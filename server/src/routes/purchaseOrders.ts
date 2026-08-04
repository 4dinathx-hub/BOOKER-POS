import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createPurchaseOrderSchema, updatePurchaseOrderStatusSchema } from '../schemas';
import { recordAudit } from '../lib/audit';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('purchase_orders:read'), async (req, res) => {
  const orders = await prisma.purchaseOrder.findMany({
    where: { restaurantId: req.auth!.restaurantId! },
    orderBy: { createdAt: 'desc' },
    include: { items: { include: { inventoryItem: true } }, supplier: true },
  });
  res.json(orders);
});

// Suggests reorder quantities for items at/below their reorder level —
// closes the "no auto-suggested reorder" gap from the audit.
router.get('/suggestions', requirePermission('purchase_orders:read'), async (req, res) => {
  const lowStock = await prisma.inventoryItem.findMany({
    where: { restaurantId: req.auth!.restaurantId! },
  });
  const suggestions = lowStock
    .filter((i) => Number(i.stock) <= Number(i.reorderLevel))
    .map((i) => ({ inventoryItemId: i.id, name: i.name, currentStock: i.stock, reorderLevel: i.reorderLevel, suggestedQuantity: Number(i.reorderLevel) * 2 - Number(i.stock), supplierId: i.supplierId }));
  res.json(suggestions);
});

router.post('/', requirePermission('purchase_orders:write'), validate(createPurchaseOrderSchema), async (req, res) => {
  const { items, ...data } = req.body;
  const po = await prisma.purchaseOrder.create({
    data: { ...data, restaurantId: req.auth!.restaurantId!, items: { create: items } },
    include: { items: true },
  });
  res.status(201).json(po);
});

router.patch('/:id/status', requirePermission('purchase_orders:write'), validate(updatePurchaseOrderStatusSchema), async (req, res) => {
  const restaurantId = req.auth!.restaurantId!;
  const po = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, restaurantId }, include: { items: true } });
  if (!po) return res.status(404).json({ error: 'Purchase order not found' });

  const { status } = req.body;
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { status, receivedAt: status === 'RECEIVED' ? new Date() : po.receivedAt },
    });
    // Receiving a PO adds stock and logs an adjustment per line — this is
    // the "GRN" step that was entirely missing before.
    if (status === 'RECEIVED' && po.status !== 'RECEIVED') {
      for (const item of po.items) {
        await tx.inventoryItem.update({ where: { id: item.inventoryItemId }, data: { stock: { increment: Number(item.quantity) } } });
        await tx.stockAdjustment.create({
          data: { inventoryItemId: item.inventoryItemId, changeQty: Number(item.quantity), reason: 'PURCHASE_RECEIVED', refType: 'PURCHASE_ORDER', refId: po.id },
        });
      }
    }
    return result;
  });

  await recordAudit({ restaurantId, actor: req.auth!, action: `PURCHASE_ORDER_${status}`, entityType: 'PurchaseOrder', entityId: po.id });
  res.json(updated);
});

export default router;
