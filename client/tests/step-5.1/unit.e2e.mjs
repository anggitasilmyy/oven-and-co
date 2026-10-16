// Uji fungsi murni lewat modul Vite di browser
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await b.newPage();
await p.goto('http://localhost:5173/katalog');
const r = await p.evaluate(async () => {
  const R = await import('/src/utils/businessRules.js');
  const Q = await import('/src/utils/catalogQuery.js');
  const out = [];
  const eq = (name, a, e) => out.push([name, JSON.stringify(a) === JSON.stringify(e) ? 'PASS' : `FAIL got ${JSON.stringify(a)} want ${JSON.stringify(e)}`]);
  const d = (s) => new Date(s);
  const pre = { availability_type: 'preorder', lead_time_days: 1 };
  eq('BR-02 preorder 14:00 → H+1', R.getEarliestReadyDate(pre, d('2026-10-16T14:00:00')), '2026-10-17');
  eq('BR-02 preorder 17:00 tepat → H+1', R.getEarliestReadyDate(pre, d('2026-10-16T17:00:00')), '2026-10-17');
  eq('BR-02 preorder 17:01 → H+2', R.getEarliestReadyDate(pre, d('2026-10-16T17:01:00')), '2026-10-18');
  eq('BR-02 custom → H+3', R.getEarliestReadyDate({ availability_type: 'custom', lead_time_days: 3 }, d('2026-10-16T19:00:00')), '2026-10-19');
  eq('BR-01 ready → hari ini', R.getEarliestReadyDate({ availability_type: 'ready', lead_time_days: 0 }, d('2026-10-16T19:00:00')), '2026-10-16');
  eq('akhir bulan', R.getEarliestReadyDate(pre, d('2026-10-31T18:00:00')), '2026-11-02');
  eq('dateOptions disabled', R.buildDateOptions('2026-10-16', '2026-10-18', 4).map((o) => o.disabled), [true, true, false, false]);
  eq('maxAddable ready', R.getMaxAddableQuantity({ isReady: true, remainingToday: 5, inCart: 3, fallbackMax: 99 }), 2);
  eq('maxAddable habis', R.getMaxAddableQuantity({ isReady: true, remainingToday: 2, inCart: 3, fallbackMax: 99 }), 0);
  eq('maxAddable preorder', R.getMaxAddableQuantity({ isReady: false, remainingToday: null, inCart: 3, fallbackMax: 99 }), 99);
  eq('clamp', [R.clampQuantity(7, 5), R.clampQuantity(0, 5), R.clampQuantity(3, 0)], [5, 1, 0]);
  const prods = [
    { product_id: 1, name: 'Classic Butter Croissant', category_id: 3, category_name: 'Pastry', price: 28000, availability_type: 'ready', remaining_today: 5, is_active: true, rating: { average: 4.7, count: 9 }, sold_count: 30 },
    { product_id: 8, name: 'Pain au Chocolat', category_id: 3, category_name: 'Pastry', price: 30000, availability_type: 'ready', remaining_today: 0, is_active: true, rating: { average: 4.2, count: 3 }, sold_count: 40 },
    { product_id: 5, name: 'Premium Birthday Cake', category_id: 2, category_name: 'Cake', price: 385000, availability_type: 'preorder', remaining_today: null, is_active: true, rating: { average: null, count: 0 }, sold_count: 2 },
    { product_id: 11, name: 'Red Velvet Slice', category_id: 2, category_name: 'Cake', price: 38000, availability_type: 'ready', remaining_today: 5, is_active: false, rating: { average: 5, count: 1 }, sold_count: 0 },
  ];
  const ids = (l) => l.map((x) => x.product_id);
  eq('filter aktif saja', ids(R.filterCatalog(prods, {})), [1, 8, 5]);
  eq('filter ready hari ini', ids(R.filterCatalog(prods, { availability: ['ready'] })), [1]);
  eq('filter ready+preorder', ids(R.filterCatalog(prods, { availability: ['ready', 'preorder'] })), [1, 5]);
  eq('filter kategori', ids(R.filterCatalog(prods, { categoryId: 2 })), [5]);
  eq('filter harga', ids(R.filterCatalog(prods, { minPrice: 29000, maxPrice: 400000 })), [8, 5]);
  eq('filter rating 4.5', ids(R.filterCatalog(prods, { minRating: 4.5 })), [1]);
  eq('sort terlaris', ids(R.sortCatalog(prods.slice(0, 3), 'terlaris')), [8, 1, 5]);
  eq('sort harga asc', ids(R.sortCatalog(prods.slice(0, 3), 'harga-terendah')), [1, 8, 5]);
  eq('sort harga desc', ids(R.sortCatalog(prods.slice(0, 3), 'harga-tertinggi')), [5, 8, 1]);
  eq('sort rating', ids(R.sortCatalog(prods.slice(0, 3), 'rating')), [1, 8, 5]);
  eq('countActive', R.countActiveFilters({ availability: ['ready'], minPrice: 1000, maxPrice: null, minRating: 4 }), 3);
  eq('search nama', ids(R.searchCatalog(prods, 'croissant')), [1]);
  eq('search kategori', ids(R.searchCatalog(prods, 'cake')), [5]);
  eq('search multi kata', ids(R.searchCatalog(prods, '  birthday   CAKE ')), [5]);
  eq('search kosong', ids(R.searchCatalog(prods, 'brownies')), []);
  const revs = [
    { review_id: 1, rating: 5, is_hidden: false, photos: ['a'], created_at: '2026-10-10' },
    { review_id: 2, rating: 3, is_hidden: true, photos: [], created_at: '2026-10-12' },
    { review_id: 3, rating: 4, is_hidden: false, photos: [], created_at: '2026-10-14' },
  ];
  const s = R.summarizeRatings(revs);
  eq('summary', [s.average, s.count, s.withPhotoCount, s.distribution.map((x) => x.count)], [4.5, 2, 1, [1, 1, 0, 0, 0]]);
  eq('filterReviews semua (hidden dibuang, terbaru dulu)', R.filterReviews(revs, 'semua').map((r) => r.review_id), [3, 1]);
  eq('filterReviews foto', R.filterReviews(revs, 'foto').map((r) => r.review_id), [1]);
  eq('filterReviews 3 (hidden)', R.filterReviews(revs, '3').map((r) => r.review_id), []);
  eq('averageRating lama', R.averageRating(revs), { average: 4.5, count: 2 });
  const parsed = Q.parseCatalogQuery(new URLSearchParams('kategori=3&ketersediaan=ready,xx,ready&harga_min=600000&harga_max=10000&rating=4.5&urut=rating'));
  eq('parse URL', parsed, { categoryId: 3, availability: ['ready'], minPrice: 10000, maxPrice: null, minRating: 4.5, sort: 'rating' });
  eq('parse URL invalid', Q.parseCatalogQuery(new URLSearchParams('kategori=abc&rating=3&urut=zz')), Q.EMPTY_CATALOG_FILTERS);
  eq('build URL', Q.buildCatalogQuery({ categoryId: 2, availability: ['preorder'], minPrice: null, maxPrice: 200000, minRating: null, sort: 'terlaris' }), { kategori: '2', ketersediaan: 'preorder', harga_max: '200000' });
  // regresi fungsi lama
  eq('getRemainingStock', R.getRemainingStock({ qty_planned: 3, qty_sold: 5 }), 0);
  eq('getMemberLevel', R.getMemberLevel(600).level.key, 'gold');
  eq('pointsRedeemValue', R.pointsRedeemValue(1250), 60000);
  return out;
});
let fail = 0;
for (const [n, res] of r) { console.log(res.startsWith('PASS') ? '✓' : '✗', n, res === 'PASS' ? '' : res); if (res !== 'PASS') fail++; }
console.log(`${r.length - fail}/${r.length} lulus`);
await b.close();
