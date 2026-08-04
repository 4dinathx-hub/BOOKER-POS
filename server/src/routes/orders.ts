import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  createOrderSchema, addOrderItemsSchema, updateOrderStatusSchema, payOrderSchema, refundOrderSchema,
} from '../schemas';
import { recordAudit } from '../lib/audit';
import { notifyRestaurant } from '../lib/realtime';
import { getHappyHourPrices } from '../lib/happyHour';
import { priceLine } from '../lib/pricing';

// Frees a table AND any tables merged into it (see the schema comment on
// Table.mergedIntoTableId) — without this, a merged-in table stays stuck
// OCCUPIED forever once its party's bill closes out on the primary table,
// since nothing else ever touches its state.
async function freeTableAndMerged(tableId: string, tx: typeof prisma) {
  await tx.table.update({ where: { id: tableId }, data: { state: 'FREE' } });
  await tx.table.updateMany({ where: { mergedIntoTableId: tableId }, data: { state: 'FREE', mergedIntoTableId: null } });
}
import { deductStockForOrder, restoreStockForOrder } from '../lib/stock';

const router = Router();
router.use(requireAuth);

// Computes line totals + per-line tax using the menu item's TaxClass (falls
// back to the branch's flat gstRate if no TaxClass is assigned — keeps
// existing restaurants working without forcing them to configure tax
// classes on day one).
async function priceItems(restaurantId: string, items: { menuItemId: string; quantity: number; modifierChoices?: any[]; notes?: string }[]) {
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: items.map((i) => i.menuItemId) } },
    include: { taxClass: true },
  });
  const branch = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
  const byId = new Map(menuItems.map((m) => [m.id, m]));
  const happyHourPrices = await getHappyHourPrices(restaurantId, menuItems);

  let subtotal = 0;   // sum of raw line amounts (price * qty), pre-any-tax-adjustment
  let totalTax = 0;   // informational tax breakdown (embedded for inclusive, added for exclusive)
  let payableTotal = 0; // what the customer actually owes for these lines
  const lineItems = items.map((input) => {
    const menuItem = byId.get(input.menuItemId);
    if (!menuItem) throw new Error(`Menu item ${input.menuItemId} not found`);
    const basePrice = happyHourPrices.get(menuItem.id) ?? menuItem.price;

    const cgstRate = menuItem.taxClass ? Number(menuItem.taxClass.cgstRate) : branch.gstRate / 2;
    const sgstRate = menuItem.taxClass ? Number(menuItem.taxClass.sgstRate) : branch.gstRate / 2;
    const isTaxInclusive = menuItem.taxClass ? menuItem.taxClass.isTaxInclusive : true;
    const { priceEach, lineTotal, lineTax, linePayable } = priceLine({
      quantity: input.quantity, basePrice, modifierChoices: input.modifierChoices, cgstRate, sgstRate, isTaxInclusive,
    });

    subtotal += lineTotal;
    totalTax += lineTax;
    payableTotal += linePayable;
    return { menuItemId: input.menuItemId, quantity: input.quantity, priceEach, taxAmount: lineTax, modifierChoices: input.modifierChoices ?? null, notes: (input as any).notes ?? null };
  });

  return { lineItems, subtotal, totalTax, payableTotal };
}

async function applyCoupon(restaurantId: string, code: string | undefined, subtotal: number) {
  if (!code) return { coupon: null, discount: 0 };
  const coupon = await prisma.coupon.findFirst({ where: { restaurantId, code, isActive: true } });
  if (!coupon) throw new Error('Invalid or inactive coupon code');
  if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new Error('Coupon has expired');
  const discount = coupon.discountType === 'PERCENT' ? (subtotal * Number(coupon.discountValue)) / 100 : Number(coupon.discountValue);
  return { coupon, discount: Math.min(discount, subtotal) };
}

router.get('/', requirePermission('orders:read'), async (req, res) => {
  const { status } = req.query as { status?: string };
  const orders = await prisma.order.findMany({
    where: { restaurantId: req.auth!.restaurantId!, ...(status ? { status: status as any } : {}) },
    orderBy: { createdAt: 'desc' },
    include: { items: { include: { menuItem: true } }, table: true, payments: true },
    take: 200,
  });
  res.json(orders);
});

router.get('/:id', requirePermission('orders:read'), async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, restaurantId: req.auth!.restaurantId! },
    include: { items: { include: { menuItem: true } }, table: true, payments: true, couponRedemption: { include: { coupon: true } } },
  });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

router.post('/', requirePermission('orders:write'), validate(createOrderSchema), async (req, res) => {
  const { tableId, type, channel, items, customerId, couponCode } = req.body;
  const restaurantId = req.auth!.restaurantId!;

  try {
    const { lineItems, subtotal, totalTax, payableTotal } = await priceItems(restaurantId, items);
    const { coupon, discount } = await applyCoupon(restaurantId, couponCode, payableTotal);
    const total = Math.round(payableTotal - discount);

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          restaurantId, tableId, type, channel, total,
          discountAmount: discount, taxAmount: totalTax,
          createdById: req.auth!.actorType === 'EMPLOYEE' ? req.auth!.sub : null,
          items: { create: lineItems },
        },
        include: { items: true },
      });
      if (coupon) {
        await tx.couponRedemption.create({ data: { couponId: coupon.id, orderId: created.id, discountApplied: discount } });
        await tx.coupon.update({ where: { id: coupon.id }, data: { timesUsed: { increment: 1 } } });
      }
      if (tableId) await tx.table.update({ where: { id: tableId }, data: { state: 'OCCUPIED' } });
      return created;
    });

    notifyRestaurant(restaurantId, 'orders');
    notifyRestaurant(restaurantId, 'kitchen');
    res.status(201).json(order);
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? 'Failed to create order' });
  }
});

router.post('/:id/items', requirePermission('orders:write'), validate(addOrderItemsSchema), async (req, res) => {
  const restaurantId = req.auth!.restaurantId!;
  const order = await prisma.order.findFirst({ where: { id: req.params.id, restaurantId } });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { lineItems, totalTax, payableTotal } = await priceItems(restaurantId, req.body.items);
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      items: { create: lineItems },
      total: { increment: Math.round(payableTotal) },
      taxAmount: { increment: totalTax },
    },
    include: { items: true },
  });
  notifyRestaurant(restaurantId, 'orders');
  notifyRestaurant(restaurantId, 'kitchen');
  res.json(updated);
});

// Kitchen + front-of-house status transitions (NEW -> PREPARING -> READY -> SERVED -> BILLED, or HELD/CANCELLED/VOIDED)
router.patch('/:id/status', requirePermission('orders:write'), validate(updateOrderStatusSchema), async (req, res) => {
  const restaurantId = req.auth!.restaurantId!;
  const order = await prisma.order.findFirst({ where: { id: req.params.id, restaurantId } });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { status, reason } = req.body;

  if (status === 'VOIDED') return res.status(400).json({ error: 'Use POST /:id/void for voiding a settled order' });

  const data: any = { status };
  if (status === 'SERVED') data.servedAt = new Date();
  if (status === 'CANCELLED' && reason) data.refundReason = reason;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.order.update({ where: { id: order.id }, data });
    if (status === 'BILLED') {
      await deductStockForOrder(order.id, tx as any);
      if (order.tableId) await freeTableAndMerged(order.tableId, tx as any);
    }
    if (status === 'CANCELLED' && order.tableId) {
      await freeTableAndMerged(order.tableId, tx as any);
    }
    return result;
  });

  notifyRestaurant(restaurantId, 'orders');
  notifyRestaurant(restaurantId, 'kitchen');
  res.json(updated);
});

// Records payment(s) against an order and marks it BILLED (with stock deduction).
router.post('/:id/pay', requirePermission('orders:write'), validate(payOrderSchema), async (req, res) => {
  const restaurantId = req.auth!.restaurantId!;
  const order = await prisma.order.findFirst({ where: { id: req.params.id, restaurantId }, include: { payments: true } });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const paidSoFar = order.payments.reduce((s, p) => s + p.amount, 0);
  const newPayments = req.body.payments as { method: any; amount: number }[];
  const newTotal = paidSoFar + newPayments.reduce((s, p) => s + p.amount, 0);
  const fullyPaid = newTotal >= order.total;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.payment.createMany({ data: newPayments.map((p) => ({ orderId: order.id, method: p.method, amount: p.amount })) });
    const result = await tx.order.update({ where: { id: order.id }, data: { status: fullyPaid ? 'BILLED' : 'PARTIALLY_PAID' } });
    if (fullyPaid) {
      await deductStockForOrder(order.id, tx as any);
      if (order.tableId) await freeTableAndMerged(order.tableId, tx as any);
    }
    return result;
  });

  notifyRestaurant(restaurantId, 'orders');
  res.json(updated);
});

router.post('/:id/void', requirePermission('orders:void'), async (req, res) => {
  const restaurantId = req.auth!.restaurantId!;
  const order = await prisma.order.findFirst({ where: { id: req.params.id, restaurantId }, include: { couponRedemption: true } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'BILLED') return res.status(400).json({ error: 'Only a billed order can be voided; use status update to cancel an unbilled one' });

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.order.update({
      where: { id: order.id },
      data: { status: 'VOIDED', voidedByName: req.auth!.name, voidedAt: new Date() },
    });
    // The order was BILLED, which means deductStockForOrder already ran —
    // reverse it here so voiding doesn't silently leave inventory short for
    // food that (presumably) was never actually served.
    await restoreStockForOrder(order.id, tx as any);
    // Same logic for a coupon: if this order never actually happened, it
    // shouldn't count against the coupon's usage total either.
    if (order.couponRedemption) {
      await tx.coupon.update({ where: { id: order.couponRedemption.couponId }, data: { timesUsed: { decrement: 1 } } });
      await tx.couponRedemption.delete({ where: { id: order.couponRedemption.id } });
    }
    return result;
  });
  await recordAudit({ restaurantId, actor: req.auth!, action: 'ORDER_VOIDED', entityType: 'Order', entityId: order.id, before: { status: order.status }, after: { status: 'VOIDED' } });
  notifyRestaurant(restaurantId, 'orders');
  res.json(updated);
});

router.post('/:id/refund', requirePermission('orders:refund'), validate(refundOrderSchema), async (req, res) => {
  const restaurantId = req.auth!.restaurantId!;
  const order = await prisma.order.findFirst({ where: { id: req.params.id, restaurantId } });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { amount, reason } = req.body;
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { refundedAmount: { increment: amount }, refundReason: reason, status: amount >= order.total ? 'REFUNDED' : order.status },
  });
  await recordAudit({ restaurantId, actor: req.auth!, action: 'ORDER_REFUNDED', entityType: 'Order', entityId: order.id, after: { amount, reason } });
  notifyRestaurant(restaurantId, 'orders');
  res.json(updated);
});

export default router;
