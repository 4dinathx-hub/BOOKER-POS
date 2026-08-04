import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createInventoryItemSchema, updateInventoryItemSchema, stockAdjustSchema, createWarehouseSchema } from '../schemas';
import { recordAudit } from '../lib/audit';
import { notifyRestaurant } from '../lib/realtime';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('inventory:read'), async (req, res) => {
  const items = await prisma.inventoryItem.findMany({
    where: { restaurantId: req.auth!.restaurantId! },
    orderBy: { name: 'asc' },
    include: { supplier: true, warehouse: true },
  });
  res.json(items);
});

// Items at/below reorder level — feeds the dashboard low-stock widget and Notifications.
router.get('/low-stock', requirePermission('inventory:read'), async (req, res) => {
  const items = await prisma.$queryRaw`
    SELECT * FROM inventory_items
    WHERE restaurant_id = ${req.auth!.restaurantId!}::uuid AND stock <= reorder_level
    ORDER BY name ASC`;
  res.json(items);
});

router.post('/', requirePermission('inventory:write'), validate(createInventoryItemSchema), async (req, res) => {
  const item = await prisma.inventoryItem.create({ data: { ...req.body, restaurantId: req.auth!.restaurantId! } });
  res.status(201).json(item);
});

router.patch('/:id', requirePermission('inventory:write'), validate(updateInventoryItemSchema), async (req, res) => {
  const updated = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: req.body });
  res.json(updated);
});

// Manual stock adjustment (wastage, correction, transfer) — always logged.
router.post('/:id/adjust', requirePermission('inventory:adjust'), validate(stockAdjustSchema), async (req, res) => {
  const { changeQty, reason, note } = req.body;
  const restaurantId = req.auth!.restaurantId!;

  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.update({ where: { id: req.params.id }, data: { stock: { increment: changeQty } } });
    await tx.stockAdjustment.create({ data: { inventoryItemId: item.id, changeQty, reason, note, refType: 'MANUAL', createdById: req.auth!.sub } });
    return item;
  });

  await recordAudit({ restaurantId, actor: req.auth!, action: 'STOCK_ADJUSTED', entityType: 'InventoryItem', entityId: updated.id, after: { changeQty, reason, note } });
  notifyRestaurant(restaurantId, 'inventory');
  res.json(updated);
});

router.get('/:id/adjustments', requirePermission('inventory:read'), async (req, res) => {
  const adjustments = await prisma.stockAdjustment.findMany({ where: { inventoryItemId: req.params.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json(adjustments);
});

router.delete('/:id', requirePermission('inventory:write'), async (req, res) => {
  await prisma.inventoryItem.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ---- Warehouses (multi-location stock) ----
router.get('/warehouses', requirePermission('warehouse:read'), async (req, res) => {
  const warehouses = await prisma.warehouse.findMany({ where: { restaurantId: req.auth!.restaurantId! }, orderBy: { name: 'asc' } });
  res.json(warehouses);
});

router.post('/warehouses', requirePermission('warehouse:write'), validate(createWarehouseSchema), async (req, res) => {
  const warehouse = await prisma.warehouse.create({ data: { ...req.body, restaurantId: req.auth!.restaurantId! } });
  res.status(201).json(warehouse);
});

// Transfer stock between two InventoryItem rows representing the same
// ingredient at different warehouses (kept simple: two adjustments in one transaction).
router.post('/warehouses/transfer', requirePermission('warehouse:write'), async (req, res) => {
  const { fromInventoryItemId, toInventoryItemId, quantity } = req.body as { fromInventoryItemId: string; toInventoryItemId: string; quantity: number };
  await prisma.$transaction([
    prisma.inventoryItem.update({ where: { id: fromInventoryItemId }, data: { stock: { decrement: quantity } } }),
    prisma.inventoryItem.update({ where: { id: toInventoryItemId }, data: { stock: { increment: quantity } } }),
    prisma.stockAdjustment.create({ data: { inventoryItemId: fromInventoryItemId, changeQty: -quantity, reason: 'TRANSFER', refType: 'TRANSFER' } }),
    prisma.stockAdjustment.create({ data: { inventoryItemId: toInventoryItemId, changeQty: quantity, reason: 'TRANSFER', refType: 'TRANSFER' } }),
  ]);
  res.status(204).send();
});

export default router;
