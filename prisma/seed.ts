import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('demo1234', 10);
  const company = await prisma.company.create({
    data: { name: 'Demo Restaurants Pvt Ltd', ownerEmail: 'owner@demo.com', ownerPasswordHash: passwordHash },
  });

  const branch = await prisma.restaurant.create({
    data: { companyId: company.id, name: 'Demo Branch - Koramangala', city: 'Bengaluru', gstRate: 5 },
  });

  await prisma.posConfig.create({ data: { restaurantId: branch.id } });

  const pinHash = await bcrypt.hash('1234', 10);
  await prisma.employee.create({
    data: { restaurantId: branch.id, name: 'Demo Manager', role: 'MANAGER', code: 'MGR01', pinHash, baseSalary: 30000 },
  });

  const defaultTax = await prisma.taxClass.create({
    data: { restaurantId: branch.id, name: 'GST 5%', cgstRate: 2.5, sgstRate: 2.5, isDefault: true, isTaxInclusive: true },
  });

  const category = await prisma.menuCategory.create({ data: { restaurantId: branch.id, name: 'Starters', sortOrder: 0 } });
  const item = await prisma.menuItem.create({
    data: { restaurantId: branch.id, categoryId: category.id, name: 'Paneer Tikka', price: 220, isVeg: true, taxClassId: defaultTax.id },
  });

  const inventoryItem = await prisma.inventoryItem.create({
    data: { restaurantId: branch.id, name: 'Paneer', stock: 20, unit: 'kg', reorderLevel: 5 },
  });
  await prisma.recipeIngredient.create({
    data: { menuItemId: item.id, inventoryItemId: inventoryItem.id, quantityPerUnit: 0.15, unit: 'kg' },
  });

  await prisma.table.createMany({
    data: [1, 2, 3, 4].map((n) => ({ restaurantId: branch.id, label: `T${n}`, seats: 4 })),
  });

  await prisma.printerConfig.create({ data: { restaurantId: branch.id, name: 'Kitchen KOT', type: 'KOT', isDefault: true, paperWidth: 80 } });
  await prisma.printerConfig.create({ data: { restaurantId: branch.id, name: 'Front Desk Bill', type: 'BILL', isDefault: true, paperWidth: 80 } });

  // eslint-disable-next-line no-console
  console.log('Seed complete. Owner login: owner@demo.com / demo1234. Employee: MGR01 / 1234');
}

main().finally(() => prisma.$disconnect());
