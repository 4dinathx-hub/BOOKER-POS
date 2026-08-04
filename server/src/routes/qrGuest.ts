import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { validate } from '../middleware/validate';
import { rateLimit } from '../middleware/rateLimit';
import { guestOrderSchema, submitFeedbackSchema } from '../schemas';
import { notifyRestaurant } from '../lib/realtime';
import { getHappyHourPrices } from '../lib/happyHour';
import { deductStockForOrder } from '../lib/stock';
import { createNotification } from '../lib/notifications';
import { createRazorpayOrder, verifyRazorpaySignature, isRazorpayConfigured } from '../lib/razorpay';

// No requireAuth here by design — this is the public /order/:restaurantId/:tableId
// surface a diner reaches by scanning a table QR code. Every route is scoped
// to a specific, guessable-but-harmless restaurantId+tableId pair and rate
// limited; it never returns anything beyond that table's own menu/order.
const router = Router({ mergeParams: true });
router.use(rateLimit(30, 60_000)); // 30 requests/min per IP per route group

// View-only digital menu — no table context, no ordering. For a QR code
// that just needs to show the menu (flyers, Instagram bio link, a QR at
// the entrance) rather than a specific table's order-here flow.
router.get('/:restaurantId/menu', async (req, res) => {
  const { restaurantId } = req.params;
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true, name: true, city: true } });
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId, items: { some: { isAvailable: true } } },
    orderBy: { sortOrder: 'asc' },
    include: { items: { where: { isAvailable: true } } },
  });
  res.json({ restaurant, categories });
});

router.get('/:restaurantId/:tableId/menu', async (req, res) => {
  const { restaurantId, tableId } = req.params;
  const table = await prisma.table.findFirst({ where: { id: tableId, restaurantId } });
  if (!table) return res.status(404).json({ error: 'Table not found' });

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId, items: { some: { isAvailable: true } } },
    orderBy: { sortOrder: 'asc' },
    include: { items: { where: { isAvailable: true }, include: { modifierGroups: { include: { modifierGroup: { include: { modifiers: true } } } } } } },
  });
  res.json({ table, categories });
});

router.post('/:restaurantId/:tableId/order', validate(guestOrderSchema), async (req, res) => {
  const { restaurantId, tableId } = req.params;
  const table = await prisma.table.findFirst({ where: { id: tableId, restaurantId } });
  if (!table) return res.status(404).json({ error: 'Table not found' });

  const menuItems = await prisma.menuItem.findMany({ where: { id: { in: req.body.items.map((i: any) => i.menuItemId) }, restaurantId, isAvailable: true } });
  const byId = new Map(menuItems.map((m) => [m.id, m]));
  const happyHourPrices = await getHappyHourPrices(restaurantId, menuItems);
  const lineItems = req.body.items.map((input: any) => {
    const item = byId.get(input.menuItemId);
    if (!item) throw new Error('Item unavailable');
    return { menuItemId: item.id, quantity: input.quantity, priceEach: happyHourPrices.get(item.id) ?? item.price, notes: input.notes };
  });
  const total = lineItems.reduce((s: number, i: any) => s + i.priceEach * i.quantity, 0);

  const order = await prisma.order.create({
    data: { restaurantId, tableId, type: 'DINE_IN', channel: 'WEBSITE', total, items: { create: lineItems } },
  });
  await prisma.table.update({ where: { id: tableId }, data: { state: 'OCCUPIED' } });
  await createNotification({
    restaurantId, type: 'NEW_ONLINE_ORDER',
    title: `New order at Table ${table.label}`,
    body: `${lineItems.length} item(s), ₹${total}`,
  });
  notifyRestaurant(restaurantId, 'orders');
  notifyRestaurant(restaurantId, 'kitchen');
  res.status(201).json({ orderId: order.id });
});

router.get('/:restaurantId/:tableId/order/:orderId/status', async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.orderId, restaurantId: req.params.restaurantId, tableId: req.params.tableId },
    select: { status: true, total: true },
  });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// ---- Online payment (Razorpay) for a guest's own order ----
router.post('/:restaurantId/:tableId/order/:orderId/create-payment-order', async (req, res) => {
  if (!isRazorpayConfigured()) return res.status(503).json({ error: 'Online payment is not enabled for this restaurant yet' });

  const order = await prisma.order.findFirst({
    where: { id: req.params.orderId, restaurantId: req.params.restaurantId, tableId: req.params.tableId },
    include: { payments: true },
  });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'BILLED') return res.status(400).json({ error: 'This order is already paid' });

  const alreadyPaid = order.payments.reduce((s, p) => s + p.amount, 0);
  const remaining = order.total - alreadyPaid;
  if (remaining <= 0) return res.status(400).json({ error: 'Nothing left to pay on this order' });

  try {
    const razorpayOrder = await createRazorpayOrder(remaining, order.id);
    res.json({ razorpayOrderId: razorpayOrder.id, amount: razorpayOrder.amount, currency: razorpayOrder.currency, keyId: razorpayOrder.keyId });
  } catch (err: any) {
    res.status(502).json({ error: `Could not start payment: ${err.message}` });
  }
});

router.post('/:restaurantId/:tableId/order/:orderId/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body as Record<string, string>;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  // Signature check happens BEFORE anything else touches the database —
  // an unverified "I paid" claim from a client is not evidence of payment.
  const verified = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!verified) return res.status(400).json({ error: 'Payment verification failed — signature mismatch' });

  const order = await prisma.order.findFirst({
    where: { id: req.params.orderId, restaurantId: req.params.restaurantId, tableId: req.params.tableId },
    include: { payments: true },
  });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Idempotency: Razorpay's checkout can call this more than once (retry,
  // double-tap, browser back-forward) — a gatewayPaymentId we've already
  // recorded means this exact payment was already applied, not a new one.
  const alreadyRecorded = order.payments.some((p) => p.gatewayPaymentId === razorpay_payment_id);
  if (alreadyRecorded) return res.json({ status: order.status, duplicate: true });

  const amountPaid = order.total - order.payments.reduce((s, p) => s + p.amount, 0);
  const fullyPaid = true; // create-payment-order always charges exactly the remaining balance

  const updated = await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        orderId: order.id, method: 'ONLINE_GATEWAY', amount: amountPaid,
        gatewayOrderId: razorpay_order_id, gatewayPaymentId: razorpay_payment_id, gatewaySignature: razorpay_signature,
      },
    });
    const result = await tx.order.update({ where: { id: order.id }, data: { status: fullyPaid ? 'BILLED' : 'PARTIALLY_PAID' } });
    if (fullyPaid) {
      await deductStockForOrder(order.id, tx as any);
      await tx.table.update({ where: { id: order.tableId! }, data: { state: 'FREE' } });
    }
    return result;
  });

  notifyRestaurant(req.params.restaurantId, 'orders');
  res.json({ status: updated.status });
});

router.post('/:restaurantId/:tableId/service-request', async (req, res) => {
  const { restaurantId, tableId } = req.params;
  const { type } = req.body as { type: 'CALL_WAITER' | 'REQUEST_BILL' };
  const table = await prisma.table.findFirst({ where: { id: tableId, restaurantId } });
  if (!table) return res.status(404).json({ error: 'Table not found' });

  const request = await prisma.serviceRequest.create({ data: { restaurantId, tableId, type } });
  notifyRestaurant(restaurantId, 'service');
  res.status(201).json(request);
});

router.post('/:restaurantId/:tableId/feedback', validate(submitFeedbackSchema), async (req, res) => {
  const { restaurantId, tableId } = req.params;
  const table = await prisma.table.findFirst({ where: { id: tableId, restaurantId } });
  if (!table) return res.status(404).json({ error: 'Table not found' });

  const { rating, comment, phone } = req.body;
  const customer = phone ? await prisma.customer.findFirst({ where: { restaurantId, phone } }) : null;

  const feedback = await prisma.feedback.create({
    data: { restaurantId, rating, comment, customerId: customer?.id },
  });
  res.status(201).json({ id: feedback.id });
});

export default router;
