
const prisma = require('../lib/prisma');

async function getCategories() {
  return prisma.category.findMany({
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
}

module.exports = {
  getCategories,
};
