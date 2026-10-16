// utils/rules/promo.js
// Promo & voucher (dipindah dari businessRules.js di Step 5.1 tanpa mengubah perilaku)

/** Voucher aktif pada tanggal tertentu: is_active, dalam periode, kuota tersisa */
export function isVoucherActiveOn(voucher, dateKey) {
  return voucher.is_active && voucher.quota > 0 && voucher.valid_from <= dateKey && dateKey <= voucher.valid_to;
}
