// services/category.service.js
// FR-05 · FR-06 · C-05 · C-07 — kategori produk, bentuk sama dengan tabel categories di frontend
// ({category_id, name, sort_order}); category_id INT tetap angka karena filter Katalog membandingkan angka.

const prisma = require('../lib/prisma');

async function getCategories() {
  const rows = await prisma.category.findMany({
    orderBy: [
      { sortOrder: 'asc' },
      { categoryId: 'asc' },
    ],
    select: {
      categoryId: true,
      name: true,
      sortOrder: true,
    },
  });

  return rows.map((row) => ({
    category_id: row.categoryId,
    name: row.name,
    sort_order: row.sortOrder,
  }));
}

module.exports = {
  getCategories,
};
