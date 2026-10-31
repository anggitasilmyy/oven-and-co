// tests/helpers/settingsDb.js
// Fake Prisma untuk uji tulis AD-11 (Step 6.4.10 C2) yang meniru perilaku InnoDB yang relevan:
//   - kunci baris store_settings: `SELECT … store_settings … FOR UPDATE` lewat $queryRaw MENUNGGU sampai transaksi
//     pemegang kunci selesai (commit/rollback) — dua request bersamaan benar-benar diserialkan;
//   - read view REPEATABLE READ dibuat pada pembacaan BIASA pertama (bukan pada locking read): pembacaan sebelum kunci
//     menghasilkan data basi, persis seperti MySQL, sehingga pola "baca → kunci → putuskan" terdeteksi uji konkurensi;
//   - penulisan dicatat dan diterapkan ke data committed saat commit; gagal → rollback (tidak ada perubahan parsial);
//   - pelanggaran dicatat: query lewat Prisma global, query tumpang tindih dalam satu transaksi (Promise.all), baca atau
//     tulis sebelum kunci diperoleh, SQL mentah selain kunci store_settings;
//   - constraint operating_hours seperti MySQL: PK hour_id & UNIQUE day_of_week → P2002 bila dilanggar;
//   - tabel `users` opsional (`userRows`, Step 6.4.10 C3): bila diisi, middleware auth membaca data committed TERBARU
//     (penonaktifan akun langsung berlaku di request berikutnya) dan Prisma global `user.findMany` dicatat beserta
//     argumennya (`ctl.userQueries`) agar `select` whitelist bisa diperiksa; `user.create` menegakkan UNIQUE seperti
//     MySQL (email tanpa beda huruf — collation _ci, phone, google_id bila tidak null, PK) dengan P2002 + meta.target nama
//     indeks, id auto-increment, dan default kolom; argumen create dicatat (`ctl.userWrites`); di dalam transaksi
//     `tx.user.findUnique/findMany` membaca read view yang sama dengan tabel lain dan `tx.user.updateMany` dievaluasi
//     ulang terhadap data committed TERBARU saat commit (seperti UPDATE InnoDB = current read), argumennya dicatat di
//     `tx.userUpdates`; tanpa `userRows` perilaku lama tetap;
//   - kait uji: `forceCount[op]` memalsukan jumlah baris UPDATE (tulisan tidak diterapkan), `transformRead(op, hasil)`
//     mengubah hasil baca (meniru data yang berubah di luar perkiraan).
// Setiap file test berjalan di proses terpisah (node --test), jadi state modul aman.

const GROUP_ORDER = ['qris', 'ewallet', 'va', 'store']; // urutan enum PaymentMethodGroup (ORDER BY enum MySQL)
const time = (hhmm) => new Date(`1970-01-01T${hhmm}:00.000Z`);

function seedTables() {
  const method = (methodCode, name, methodGroup, isActive) => ({ methodCode, name, methodGroup, isActive });
  return {
    storeSetting: {
      settingId: 1, storeName: 'Oven & Co.', address: 'Jl. Oven & Co. No. 1, Jakarta', latitude: '-6.2000000', longitude: '106.8000000',
      whatsappNumber: '+620000000000', preorderCutoffTime: time('17:00'), deliveryRadiusKm: '10.00', deliveryFeePerKm: '2500.00',
      paymentTimeoutMinutes: 30, earnAmountPerPoint: '1000.00', redeemPointsUnit: 100, redeemValue: '5000.00',
      goldMinPoints: 500, platinumMinPoints: 2000, reviewBonusPoints: 20,
    },
    operatingHours: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ hourId: d, dayOfWeek: d, openTime: time('07:00'), closeTime: time('20:00'), isOpen: true })),
    paymentMethods: [
      method('qris', 'QRIS', 'qris', true), method('gopay', 'GoPay', 'ewallet', true), method('ovo', 'OVO', 'ewallet', false),
      method('dana', 'DANA', 'ewallet', false), method('va_bca', 'BCA Virtual Account', 'va', false),
      method('pay_at_store', 'Bayar di Toko', 'store', true),
    ],
  };
}

const pick = (row, select) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : { ...row });
const sortMethods = (rows) => [...rows].sort((a, b) => GROUP_ORDER.indexOf(a.methodGroup) - GROUP_ORDER.indexOf(b.methodGroup) || a.name.localeCompare(b.name));
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Filter `where` Prisma yang dipakai untuk users: kolom = nilai, `{ in: [...] }`, `{ not: … }` */
function matchesUser(row, where = {}) {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return cond.some((alt) => matchesUser(row, alt));
    if (key === 'email' && typeof cond === 'string') return row.email.toLowerCase() === cond.toLowerCase(); // collation _ci
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && typeof cond !== 'bigint') {
      if ('in' in cond) return cond.in.includes(row[key]);
      if ('not' in cond) return row[key] !== cond.not;
      throw new Error(`filter users tidak dikenal: ${key}`);
    }
    return row[key] === cond;
  });
}

/**
 * @param {object} fakePrisma — objek dari tests/helpers/fakePrisma.js
 * @param {Record<string, {userId, role, isActive}>} users — untuk middleware auth (Prisma global, di luar transaksi)
 * @param {{userRows?: () => Array<object>}} [options] — baris `users` lengkap (C3); dipanggil ulang setiap reset()
 */
function installSettingsDb(fakePrisma, users, { userRows } = {}) {
  const ctl = {
    committed: null,
    transactions: [], // { id, options, ops, committed, error }
    globalCalls: [],
    violations: [],
    lockWaits: 0,
    failOn: null, // (op, args) => boolean | Error — sisipkan kegagalan
    afterLock: null, // async (txId) => void — tahan transaksi setelah kunci (uji bersamaan)
    forceCount: {}, // { 'paymentMethod.updateMany': 0 } — jumlah baris palsu, tulisan tidak diterapkan
    transformRead: null, // (op, result) => result
    userQueries: [], // argumen query users lewat Prisma global (selain auth)
    userWrites: [], // argumen user.create
    reset() {
      const committed = seedTables();
      if (userRows) committed.users = userRows();
      Object.assign(ctl, {
        committed, transactions: [], globalCalls: [], violations: [], lockWaits: 0, failOn: null, afterLock: null,
        forceCount: {}, transformRead: null, userQueries: [], userWrites: [],
      });
    },
  };
  let lockHolder = null;
  const lockQueue = [];
  let seq = 0;

  async function acquire(id) {
    if (lockHolder != null) ctl.lockWaits += 1;
    while (lockHolder != null) await new Promise((resolve) => lockQueue.push(resolve));
    lockHolder = id;
  }
  function release(id) {
    if (lockHolder !== id) return;
    lockHolder = null;
    const next = lockQueue.shift();
    if (next) next();
  }

  function createTx(id, tx) {
    let inFlight = 0;
    // Read view: dibuat pada pembacaan biasa pertama (consistent read), lalu dipakai semua pembacaan transaksi ini
    const view = () => {
      if (!tx.snapshot) tx.snapshot = structuredClone(ctl.committed);
      return tx.snapshot;
    };
    const run = (op, kind, fn) => async (args) => {
      if (inFlight > 0) ctl.violations.push(`tumpang tindih: ${op} (tx ${id})`);
      inFlight += 1;
      tx.ops.push(op);
      try {
        await tick();
        if (kind !== 'lock' && !tx.locked) ctl.violations.push(`${kind} sebelum kunci: ${op} (tx ${id})`);
        const failure = ctl.failOn?.(op, args); // true → error umum; objek Error → dilempar apa adanya (mis. P2002)
        if (failure) throw failure instanceof Error ? failure : Object.assign(new Error(`Kegagalan uji pada ${op}`), { code: 'P2034' });
        if (kind === 'tulis' && op in ctl.forceCount) return { count: ctl.forceCount[op] };
        const result = await fn(args);
        return kind === 'baca' && ctl.transformRead ? ctl.transformRead(op, result) : result;
      } finally {
        inFlight -= 1;
      }
    };
    // Tulis: diterapkan ke read view transaksi ini (agar terbaca ulang) dan dicatat untuk diterapkan saat commit
    const write = (apply) => {
      apply(view());
      tx.writes.push(apply);
    };

    return {
      $queryRaw: run('lock:store_settings', 'lock', async (strings) => {
        const sql = (Array.isArray(strings) ? strings.join('?') : String(strings)).replace(/\s+/g, ' ');
        if (!/FROM store_settings/.test(sql) || !/FOR UPDATE/.test(sql)) {
          ctl.violations.push(`SQL mentah tidak dikenal: ${sql}`);
          throw new Error(`SQL tidak dikenal: ${sql}`);
        }
        await acquire(id);
        tx.locked = true;
        if (ctl.afterLock) await ctl.afterLock(id);
        return ctl.committed.storeSetting ? [{ setting_id: 1 }] : [];
      }),
      $executeRaw: run('executeRaw', 'tulis', async () => { throw new Error('$executeRaw tidak dipakai AD-11'); }),
      storeSetting: {
        findFirst: run('storeSetting.findFirst', 'baca', async ({ select } = {}) => {
          const row = view().storeSetting;
          return row ? pick(row, select) : null;
        }),
        updateMany: run('storeSetting.updateMany', 'tulis', async ({ data }) => {
          tx.lastData = { ...data };
          write((t) => { Object.assign(t.storeSetting, data); });
          return { count: 1 };
        }),
      },
      operatingHour: {
        findMany: run('operatingHour.findMany', 'baca', async ({ select } = {}) => [...view().operatingHours]
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek).map((r) => pick(r, select))),
        update: run('operatingHour.update', 'tulis', async ({ where, data }) => {
          if (!view().operatingHours.some((h) => h.dayOfWeek === where.dayOfWeek)) {
            throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
          }
          tx.hourWrites.push({ op: 'update', day: where.dayOfWeek, data });
          write((t) => { Object.assign(t.operatingHours.find((h) => h.dayOfWeek === where.dayOfWeek), data); });
          return { ...view().operatingHours.find((h) => h.dayOfWeek === where.dayOfWeek) };
        }),
        create: run('operatingHour.create', 'tulis', async ({ data }) => {
          const unique = (t) => {
            const target = t.operatingHours.some((h) => h.hourId === data.hourId) ? 'PRIMARY'
              : t.operatingHours.some((h) => h.dayOfWeek === data.dayOfWeek) ? 'operating_hours_day_of_week_key' : null;
            if (target) throw Object.assign(new Error(`Unique constraint failed on ${target}`), { code: 'P2002', meta: { target } });
          };
          unique(view());
          tx.hourWrites.push({ op: 'create', day: data.dayOfWeek, data });
          write((t) => { unique(t); t.operatingHours.push({ ...data }); });
          return { ...data };
        }),
      },
      user: {
        findUnique: run('user.findUnique', 'baca', async ({ where, select }) => {
          const row = (view().users ?? []).find((u) => u.userId === BigInt(where.userId));
          return row ? pick(row, select) : null;
        }),
        findMany: run('user.findMany', 'baca', async ({ where, select } = {}) => (view().users ?? [])
          .filter((u) => matchesUser(u, where)).map((u) => pick(u, select))),
        updateMany: run('user.updateMany', 'tulis', async ({ where, data }) => {
          tx.userUpdates.push(structuredClone({ where, data }));
          const count = (view().users ?? []).filter((u) => matchesUser(u, where)).length;
          write((t) => { t.users.filter((u) => matchesUser(u, where)).forEach((u) => Object.assign(u, data)); });
          return { count };
        }),
      },
      paymentMethod: {
        findMany: run('paymentMethod.findMany', 'baca', async () => sortMethods(view().paymentMethods).map((r) => ({ ...r }))),
        findUnique: run('paymentMethod.findUnique', 'baca', async ({ where }) => {
          const row = view().paymentMethods.find((m) => m.methodCode === where.methodCode);
          return row ? { ...row } : null;
        }),
        updateMany: run('paymentMethod.updateMany', 'tulis', async ({ where, data }) => {
          const exists = view().paymentMethods.some((m) => m.methodCode === where.methodCode);
          write((t) => { t.paymentMethods.filter((m) => m.methodCode === where.methodCode).forEach((m) => Object.assign(m, data)); });
          return { count: exists ? 1 : 0 };
        }),
      },
    };
  }

  // Prisma global: hanya user.findUnique (middleware auth) yang boleh; model pengaturan lewat global = pelanggaran
  for (const model of ['storeSetting', 'operatingHour', 'paymentMethod']) {
    fakePrisma[model] = new Proxy({}, {
      get: (_target, name) => async () => {
        ctl.globalCalls.push(`${model}.${String(name)}`);
        throw new Error(`query ${model}.${String(name)} lewat Prisma global, bukan klien transaksi`);
      },
    });
  }
  fakePrisma.$queryRaw = async () => { ctl.globalCalls.push('$queryRaw'); throw new Error('$queryRaw di luar transaksi'); };
  fakePrisma.user = userRows
    ? {
      // Middleware auth (userId) & login (email/phone) membaca data committed terbaru — bukan snapshot
      findUnique: async ({ where, select }) => {
        const row = ctl.committed.users.find((u) => (where.userId != null ? u.userId === BigInt(where.userId) : matchesUser(u, where)));
        return row ? pick(row, select) : null;
      },
      create: async (args) => {
        ctl.userWrites.push(structuredClone(args));
        await tick();
        const failure = ctl.failOn?.('user.create', args);
        if (failure) throw failure instanceof Error ? failure : Object.assign(new Error('Kegagalan uji pada user.create'), { code: 'P2034' });
        const rows = ctl.committed.users;
        const { data } = args;
        const userId = data.userId ?? rows.reduce((max, u) => (u.userId > max ? u.userId : max), 0n) + 1n;
        const target = rows.some((u) => u.userId === userId) ? 'PRIMARY'
          : rows.some((u) => u.email.toLowerCase() === data.email.toLowerCase()) ? 'users_email_key'
            : rows.some((u) => u.phone === data.phone) ? 'users_phone_key'
              : data.googleId != null && rows.some((u) => u.googleId === data.googleId) ? 'users_google_id_key' : null;
        if (target) throw Object.assign(new Error(`Unique constraint failed on the constraint: \`${target}\``), { code: 'P2002', meta: { target } });
        const row = { userId, passwordHash: null, googleId: null, isActive: true, createdAt: new Date(), ...data };
        ctl.committed.users = [...rows, row];
        return pick(row, args.select);
      },
      findMany: async (args = {}) => {
        ctl.userQueries.push(structuredClone(args));
        await tick();
        if (ctl.failOn?.('user.findMany', args)) throw Object.assign(new Error("Can't reach database server at db:3306"), { code: 'P1001' });
        return ctl.committed.users.filter((u) => matchesUser(u, args.where)).map((u) => pick(u, args.select));
      },
    }
    : { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
  fakePrisma.$transaction = async (callback, options) => {
    if (typeof callback !== 'function') throw new Error('hanya transaksi interaktif yang dipakai AD-11');
    const id = ++seq;
    const tx = { id, options, ops: [], writes: [], hourWrites: [], userUpdates: [], locked: false, snapshot: null, committed: false, error: null };
    ctl.transactions.push(tx);
    try {
      const result = await callback(createTx(id, tx));
      // Commit: terapkan tulisan ke data committed TERBARU (bukan ke snapshot) — seperti UPDATE InnoDB
      const next = structuredClone(ctl.committed);
      for (const apply of tx.writes) apply(next);
      ctl.committed = next;
      tx.committed = true;
      return result;
    } catch (error) {
      tx.error = error;
      throw error; // rollback: tulisan tidak pernah diterapkan ke data committed
    } finally {
      release(id);
    }
  };

  ctl.reset();
  return ctl;
}

module.exports = { installSettingsDb, seedTables, time };
