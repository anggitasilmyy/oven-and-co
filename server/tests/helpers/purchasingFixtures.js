// tests/helpers/purchasingFixtures.js
// CR-04a CP3 — fixture bersama aturan murni pembelian & buku mutasi. Dipakai unit test server (tests/purchasingRules.test.js)
// dan uji silang client (client/tests/vitest/purchasingRules.test.mjs): hasil client harus identik dengan server.

// [input, opsi, hasil (sen sebagai teks) atau pesan error]
const DECIMAL_CASES = [
  ['10', { max: '99999999.99' }, '1000'], ['0.01', { max: '99999999.99' }, '1'], [' 6.5 ', { max: '99999999.99' }, '650'],
  ['99999999.99', { max: '99999999.99' }, '9999999999'], ['0', { max: '99999999.99', allowZero: true }, '0'],
  ['0', { max: '99999999.99' }, 'Harus lebih dari 0.'], ['0.00', { max: '99999999.99' }, 'Harus lebih dari 0.'],
  ['100000000.00', { max: '99999999.99' }, 'Melebihi batas maksimum.'],
  ['1.005', { max: '99999999.99' }, 'Harus berupa angka desimal (teks) dengan maks. 2 angka di belakang koma.'],
  ['-1', { max: '99999999.99' }, 'Harus berupa angka desimal (teks) dengan maks. 2 angka di belakang koma.'],
  ['1e3', { max: '99999999.99' }, 'Harus berupa angka desimal (teks) dengan maks. 2 angka di belakang koma.'],
  ['1,5', { max: '99999999.99' }, 'Harus berupa angka desimal (teks) dengan maks. 2 angka di belakang koma.'],
  [10, { max: '99999999.99' }, 'Harus berupa angka desimal (teks) dengan maks. 2 angka di belakang koma.'],
  ['', { max: '99999999.99' }, 'Wajib diisi.'], [null, { max: '99999999.99' }, 'Wajib diisi.'],
];

// [qty, harga, nilai baris] — pembulatan setengah menjauhi nol per baris
const VALUE_CASES = [
  ['3', '1000', '3000.00'], ['0.33', '0.15', '0.05'], // 0,0495 → 0,05
  ['0.01', '0.49', '0.00'], // 0,0049 → 0,00
  ['0.01', '0.50', '0.01'], // 0,0050 → 0,01 (setengah naik)
  ['-0.01', '0.50', '-0.01'], // pembalik: tepat negatif
  ['-0.33', '0.15', '-0.05'], ['99999999.99', '100', '9999999999.00'], ['2.25', '33333.33', '74999.99'],
];

const SUPPLIER_OK = { name: ' Toko Tepung ', phone: '+62 812-3456-789', address: 'Jl. Mawar 1', email: 'toko@contoh.id', contact_person: 'Ani', note: '', material_ids: ['3', '1'] };

module.exports = { DECIMAL_CASES, VALUE_CASES, SUPPLIER_OK };
