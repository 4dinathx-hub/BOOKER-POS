import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createPrinterSchema } from '../schemas';
import { buildKot, buildBill } from '../lib/escpos';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('printing:read'), async (req, res) => {
  const printers = await prisma.printerConfig.findMany({ where: { restaurantId: req.auth!.restaurantId! }, orderBy: { createdAt: 'asc' } });
  res.json(printers);
});

router.post('/', requirePermission('printing:write'), validate(createPrinterSchema), async (req, res) => {
  const printer = await prisma.printerConfig.create({ data: { ...req.body, restaurantId: req.auth!.restaurantId! } });
  res.status(201).json(printer);
});

router.post('/:id/toggle', requirePermission('printing:write'), async (req, res) => {
  const p = await prisma.printerConfig.findUniqueOrThrow({ where: { id: req.params.id } });
  const updated = await prisma.printerConfig.update({ where: { id: req.params.id }, data: { isActive: !p.isActive } });
  res.json(updated);
});

router.post('/:id/set-default', requirePermission('printing:write'), async (req, res) => {
  const target = await prisma.printerConfig.findUniqueOrThrow({ where: { id: req.params.id } });
  await prisma.$transaction([
    prisma.printerConfig.updateMany({ where: { restaurantId: req.auth!.restaurantId!, type: target.type, isDefault: true }, data: { isDefault: false } }),
    prisma.printerConfig.update({ where: { id: target.id }, data: { isDefault: true } }),
  ]);
  res.status(204).send();
});

// Generates ESC/POS bytes (base64) for a KOT, grouped by each item's
// category->printer routing. Returns one payload PER destination printer
// so a print-agent (or the frontend, via WebUSB/network) can dispatch each
// group to the right physical printer.
router.get('/kot/:orderId', requirePermission('printing:read'), async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.orderId, restaurantId: req.auth!.restaurantId! },
    include: { table: true, items: { include: { menuItem: { include: { category: { include: { printer: true } }, comboComponents: { include: { componentMenuItem: { select: { name: true } } } } } } } } },
  });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const defaultPrinter = await prisma.printerConfig.findFirst({ where: { restaurantId: req.auth!.restaurantId!, type: 'KOT', isDefault: true } });

  const groups = new Map<string, { printer: any; items: any[] }>();
  for (const item of order.items) {
    const printer = item.menuItem.category.printer ?? defaultPrinter;
    const key = printer?.id ?? 'unassigned';
    if (!groups.has(key)) groups.set(key, { printer, items: [] });
    groups.get(key)!.items.push({
      name: item.menuItem.name, quantity: item.quantity, notes: item.notes,
      modifierNames: Array.isArray(item.modifierChoices) ? (item.modifierChoices as any[]).map((m) => m.name) : undefined,
      comboComponents: item.menuItem.comboComponents?.length
        ? item.menuItem.comboComponents.map((c: any) => `${c.quantity}x ${c.componentMenuItem.name}`)
        : undefined,
    });
  }

  const tickets = Array.from(groups.values()).map((g) => ({
    printerId: g.printer?.id ?? null,
    printerName: g.printer?.name ?? 'Unassigned',
    escposBase64: buildKot({
      orderLabel: `Order #${order.id.slice(0, 8)}`,
      tableLabel: order.table?.label,
      items: g.items,
      paperWidth: (g.printer?.paperWidth ?? 80) as 58 | 80,
    }).toBase64(),
  }));
  res.json({ tickets });
});

router.get('/bill/:orderId', requirePermission('printing:read'), async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.orderId, restaurantId: req.auth!.restaurantId! },
    include: { items: { include: { menuItem: true } }, restaurant: true },
  });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const billPrinter = await prisma.printerConfig.findFirst({ where: { restaurantId: req.auth!.restaurantId!, type: 'BILL', isDefault: true } });
  const escposBase64 = buildBill({
    restaurantName: order.restaurant.name,
    orderLabel: `Order #${order.id.slice(0, 8)}`,
    items: order.items.map((i) => ({ name: i.menuItem.name, quantity: i.quantity, priceEach: i.priceEach })),
    subtotal: order.items.reduce((s, i) => s + i.priceEach * i.quantity, 0),
    tax: Number(order.taxAmount),
    discount: Number(order.discountAmount),
    total: order.total,
    paperWidth: (billPrinter?.paperWidth ?? 80) as 58 | 80,
  }).toBase64();
  res.json({ escposBase64, printerId: billPrinter?.id ?? null });
});

export default router;
