// tests-mysql/helpers/server.js
// Integrasi MySQL 8 — Validasi AD-11 (C3), dengan smoke test C2. Menjalankan server API asli (`node src/server.js`)
// sebagai proses terpisah terhadap database uji (akun MySQL c4app) dan menyediakan klien HTTP + token JWT.
// Token ditandatangani langsung dengan JWT_SECRET uji (bentuk sama dengan auth.service: HS256, sub = user_id) agar
// pengujian tidak bergantung pada rate limit login; middleware auth tetap membaca is_active/role dari database.

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const jwt = require('jsonwebtoken');
const { ARTIFACT_DIR, APP_URL, sleep } = require('./context');

const JWT_SECRET = 'c4-integration-secret-only-for-temporary-mysql';

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * @param {string} name — nama log (/tmp/c4/server-<name>.log)
 * @param {{urlParams?: Record<string,string>}} options — parameter tambahan DATABASE_URL (mis. connection_limit)
 */
async function startServer(name, { urlParams = {} } = {}) {
  const port = await freePort();
  const url = new URL(APP_URL);
  Object.entries(urlParams).forEach(([key, value]) => url.searchParams.set(key, value));
  const logPath = path.join(ARTIFACT_DIR, `server-${name}.log`);
  const log = fs.openSync(logPath, 'w');
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, DATABASE_URL: url.toString(), PORT: String(port), JWT_SECRET, NODE_ENV: 'test' },
    stdio: ['ignore', log, log],
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i += 1) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) break;
    } catch { /* belum siap */ }
    if (i > 200 || child.exitCode !== null) throw new Error(`Server uji gagal start, lihat ${logPath}`);
    await sleep(50);
  }
  return {
    baseUrl,
    logPath,
    readLog: () => fs.readFileSync(logPath, 'utf8'),
    stop: () => new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', () => { fs.closeSync(log); resolve(); });
      child.kill('SIGTERM');
    }),
  };
}

const tokenFor = (userId) => jwt.sign({ sub: String(userId) }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

/** Panggil API; hasil {status, body, ms} (tidak melempar untuk status 4xx/5xx) */
async function call(server, method, urlPath, { userId, body } = {}) {
  const started = Date.now();
  const response = await fetch(`${server.baseUrl}${urlPath}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(userId ? { Authorization: `Bearer ${tokenFor(userId)}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: response.status, body: parsed, ms: Date.now() - started };
}

const patchActive = (server, actorId, targetId, isActive) =>
  call(server, 'PATCH', `/api/admin/staff/${targetId}/active`, { userId: actorId, body: { is_active: isActive } });

module.exports = { startServer, call, patchActive, tokenFor };
