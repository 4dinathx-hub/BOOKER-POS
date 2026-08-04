import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import { verifySwiggySignature, verifyZomatoSignature, verifyOndcSignature } from '../lib/webhookSignatures';
import { notifyRestaurant } from '../lib/realtime';
import { createNotification } from '../lib/notifications';

const router = Router();

router.get('/', requireAuth, requirePermission('online_orders:read'), async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { restaurantId: req.auth!.restaurantId!, channel: { not: 'IN_HOUSE' } },
    orderBy: { createdAt: 'desc' },
    include: { items: { include: { menuItem: true } } },
    take: 200,
  });
  res.json(orders);
});

router.patch('/:id/external-ref', requireAuth, requirePermission('online_orders:write'), async (req, res) => {
  const { externalOrderRef, riderName, riderPhone } = req.body;
  const updated = await prisma.order.update({ where: { id: req.params.id }, data: { externalOrderRef, riderName, riderPhone } });
  res.json(updated);
});

// ==================== Aggregator configuration (admin) ====================

const aggregatorConfigSchema = z.object({
  channel: z.enum(['SWIGGY', 'ZOMATO', 'ONDC']),
  merchantId: z.string().min(1),
  webhookSecret: z.string().min(1),
  isEnabled: z.boolean().optional(),
});

router.get('/config', requireAuth, requirePermission('online_orders:read'), async (req, res) => {
  const configs = await prisma.aggregatorConfig.findMany({ where: { restaurantId: req.auth!.restaurantId! } });
  // Never echo the webhook secret back to the client once set — treat it
  // like a password. Admins re-enter it if they need to rotate it.
  res.json(configs.map((c) => ({ ...c, webhookSecret: undefined, hasSecret: true })));
});

router.put('/config', requireAuth, requirePermission('online_orders:write'), validate(aggregatorConfigSchema), async (req, res) => {
  const { channel, merchantId, webhookSecret, isEnabled } = req.body;
  const config = await prisma.aggregatorConfig.upsert({
    where: { restaurantId_channel: { restaurantId: req.auth!.restaurantId!, channel } },
    create: { restaurantId: req.auth!.restaurantId!, channel, merchantId, webhookSecret, isEnabled: isEnabled ?? true },
    update: { merchantId, webhookSecret, isEnabled: isEnabled ?? true },
  });
  res.json({ ...config, webhookSecret: undefined, hasSecret: true });
});

// ==================== Menu item <-> aggregator item mapping (admin) ====================

const itemMappingSchema = z.object({
  menuItemId: z.string().uuid(),
  channel: z.enum(['SWIGGY', 'ZOMATO', 'ONDC']),
  externalItemId: z.string().min(1),
});

router.get('/item-mappings', requireAuth, requirePermission('online_orders:read'), async (req, res) => {
  const mappings = await prisma.menuItemChannelMapping.findMany({
    where: { menuItem: { restaurantId: req.auth!.restaurantId! } },
    include: { menuItem: { select: { id: true, name: true } } },
  });
  res.json(mappings);
});

router.post('/item-mappings', requireAuth, requirePermission('online_orders:write'), validate(itemMappingSchema), async (req, res) => {
  const { menuItemId, channel, externalItemId } = req.body;
  const item = await prisma.menuItem.findFirst({ where: { id: menuItemId, restaurantId: req.auth!.restaurantId! } });
  if (!item) return res.status(404).json({ error: 'Menu item not found' });

  const mapping = await prisma.menuItemChannelMapping.upsert({
    where: { channel_externalItemId: { channel, externalItemId } },
    create: { menuItemId, channel, externalItemId },
    update: { menuItemId },
  });
  res.status(201).json(mapping);
});

router.delete('/item-mappings/:id', requireAuth, requirePermission('online_orders:write'), async (req, res) => {
  const mapping = await prisma.menuItemChannelMapping.findFirst({
    where: { id: req.params.id, menuItem: { restaurantId: req.auth!.restaurantId! } },
  });
  if (!mapping) return res.status(404).json({ error: 'Mapping not found' });
  await prisma.menuItemChannelMapping.delete({ where: { id: mapping.id } });
  res.status(204).send();
});

// ==================== Webhook ingestion (called by the platforms, not a logged-in admin) ====================

const CHANNEL_BY_PLATFORM: Record<string, 'SWIGGY' | 'ZOMATO' | 'ONDC'> = {
  swiggy: 'SWIGGY',
  zomato: 'ZOMATO',
  ondc: 'ONDC',
};

// The one genuinely platform-specific piece: each aggregator's actual JSON
// shape for "new order" is different, and their public docs change over
// time — rather than guess a shape and have it silently break in
// production, this adapter defines ONE normalized internal shape and each
// platform gets a thin function mapping its real payload into it. Fill
// these in from that platform's current partner-API docs when you
// onboard; everything downstream (signature check, merchant routing, item
// mapping, order creation) already works against the normalized shape.
interface NormalizedAggregatorOrder {
  merchantId: string;
  externalOrderRef: string;
  riderName?: string;
  riderPhone?: string;
  items: { externalItemId: string; quantity: number; notes?: string }[];
}

function normalizePayload(platform: string, body: any): NormalizedAggregatorOrder | null {
  // Adjust field paths here per platform's actual webhook contract.
  // The generic fallbacks below (merchantId/merchant_id/restaurant_id, etc.)
  // are a reasonable starting guess, not a verified spec for any platform.
  const merchantId = body.merchantId ?? body.merchant_id ?? body.restaurant_id;
  const externalOrderRef = body.externalOrderRef ?? body.order_id ?? body.id;
  const items = body.items ?? body.order_items ?? [];
  if (!merchantId || !externalOrderRef || !Array.isArray(items) || items.length === 0) return null;

  return {
    merchantId: String(merchantId),
    externalOrderRef: String(externalOrderRef),
    riderName: body.riderName ?? body.rider_name ?? undefined,
    riderPhone: body.riderPhone ?? body.rider_phone ?? undefined,
    items: items.map((i: any) => ({
      externalItemId: String(i.externalItemId ?? i.item_id ?? i.id),
      quantity: Number(i.quantity ?? i.qty ?? 1),
      notes: i.notes ?? i.special_instructions ?? undefined,
    })),
  };
}

router.post('/webhooks/:platform', async (req, res) => {
  const platform = req.params.platform.toLowerCase();
  const channel = CHANNEL_BY_PLATFORM[platform];
  if (!channel) return res.status(404).json({ error: `Unknown platform "${platform}"` });

  const normalized = normalizePayload(platform, req.body);
  if (!normalized) return res.status(400).json({ error: 'Payload missing merchantId/orderRef/items — check the platform adapter in normalizePayload()' });

  // Route to the right restaurant BEFORE verifying the signature, since we
  // need that restaurant's specific webhookSecret to check it — the
  // webhook URL itself is shared across every restaurant on this platform.
  const config = await prisma.aggregatorConfig.findUnique({
    where: { channel_merchantId: { channel, merchantId: normalized.merchantId } },
  });
  if (!config) return res.status(404).json({ error: 'No restaurant configured for this merchant ID' });
  if (!config.isEnabled) return res.status(403).json({ error: `${platform} integration is disabled for this restaurant` });

  const rawBody: Buffer = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
  const verified =
    channel === 'SWIGGY' ? verifySwiggySignature(rawBody, req, config.webhookSecret) :
    channel === 'ZOMATO' ? verifyZomatoSignature(rawBody, req, config.webhookSecret) :
    verifyOndcSignature(rawBody, req, config.webhookSecret);

  if (!verified) return res.status(401).json({ error: 'Signature verification failed' });

  // Prevent duplicate ingestion on webhook retries — platforms commonly
  // retry on a non-2xx or timeout, and we don't want to double-bill an order.
  const existing = await prisma.order.findFirst({ where: { restaurantId: config.restaurantId, externalOrderRef: normalized.externalOrderRef, channel } });
  if (existing) return res.status(200).json({ orderId: existing.id, duplicate: true });

  const mappings = await prisma.menuItemChannelMapping.findMany({
    where: { channel, externalItemId: { in: normalized.items.map((i) => i.externalItemId) }, menuItem: { restaurantId: config.restaurantId } },
    include: { menuItem: true },
  });
  const byExternalId = new Map(mappings.map((m) => [m.externalItemId, m.menuItem]));

  const unmapped = normalized.items.filter((i) => !byExternalId.has(i.externalItemId));
  if (unmapped.length > 0) {
    // Reject rather than silently drop items from what's already a paid
    // order — the restaurant needs to add the mapping and the platform
    // will retry the webhook once we return a non-2xx.
    return res.status(422).json({
      error: 'Some items are not mapped to a menu item yet',
      unmappedExternalItemIds: unmapped.map((i) => i.externalItemId),
    });
  }

  const lineItems = normalized.items.map((i) => {
    const menuItem = byExternalId.get(i.externalItemId)!;
    return { menuItemId: menuItem.id, quantity: i.quantity, priceEach: menuItem.price, notes: i.notes };
  });
  const total = lineItems.reduce((s, i) => s + i.priceEach * i.quantity, 0);

  const order = await prisma.order.create({
    data: {
      restaurantId: config.restaurantId,
      type: 'DELIVERY',
      channel,
      total,
      externalOrderRef: normalized.externalOrderRef,
      riderName: normalized.riderName,
      riderPhone: normalized.riderPhone,
      items: { create: lineItems },
    },
  });

  await createNotification({
    restaurantId: config.restaurantId,
    type: 'NEW_ONLINE_ORDER',
    title: `New ${platform} order — ${normalized.externalOrderRef}`,
    body: `${normalized.items.length} item(s), ₹${total}`,
  });

  notifyRestaurant(config.restaurantId, 'orders');
  notifyRestaurant(config.restaurantId, 'kitchen');
  res.status(201).json({ orderId: order.id });
});

export default router;
