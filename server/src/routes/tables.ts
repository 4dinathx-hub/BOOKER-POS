import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createTableSchema, updateTableSchema } from '../schemas';
import { notifyRestaurant } from '../lib/realtime';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('tables:read'), async (req, res) => {
  const tables = await prisma.table.findMany({
    where: { restaurantId: req.auth!.restaurantId! },
    orderBy: { label: 'asc' },
    include: {
      orders: { where: { status: { notIn: ['BILLED', 'CANCELLED', 'VOIDED', 'REFUNDED'] } } },
      serviceRequests: { where: { status: 'OPEN' } },
      mergedTables: { select: { id: true, label: true, seats: true } },
      mergedIntoTable: { select: { id: true, label: true } },
    },
  });
  res.json(tables);
});

router.post('/', requirePermission('tables:write'), validate(createTableSchema), async (req, res) => {
  const table = await prisma.table.create({ data: { ...req.body, restaurantId: req.auth!.restaurantId! } });
  res.status(201).json(table);
});

router.patch('/:id', requirePermission('tables:write'), validate(updateTableSchema), async (req, res) => {
  const updated = await prisma.table.update({ where: { id: req.params.id }, data: req.body });
  notifyRestaurant(req.auth!.restaurantId!, 'tables');
  res.json(updated);
});

router.delete('/:id', requirePermission('tables:write'), async (req, res) => {
  await prisma.table.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ---- Table merging (large party spanning multiple tables) ----
router.post('/:id/merge', requirePermission('tables:write'), async (req, res) => {
  const { intoTableId } = req.body as { intoTableId: string };
  if (req.params.id === intoTableId) return res.status(400).json({ error: 'A table cannot be merged into itself' });

  const [table, target] = await Promise.all([
    prisma.table.findFirst({ where: { id: req.params.id, restaurantId: req.auth!.restaurantId! } }),
    prisma.table.findFirst({ where: { id: intoTableId, restaurantId: req.auth!.restaurantId! } }),
  ]);
  if (!table || !target) return res.status(404).json({ error: 'Table not found' });
  if (target.mergedIntoTableId) return res.status(400).json({ error: `${target.label} is itself merged into another table — merge into that primary table instead` });

  const updated = await prisma.table.update({
    where: { id: req.params.id },
    data: { mergedIntoTableId: intoTableId, state: 'OCCUPIED' },
  });
  notifyRestaurant(req.auth!.restaurantId!, 'tables');
  res.json(updated);
});

router.post('/:id/unmerge', requirePermission('tables:write'), async (req, res) => {
  const table = await prisma.table.findFirst({ where: { id: req.params.id, restaurantId: req.auth!.restaurantId! } });
  if (!table) return res.status(404).json({ error: 'Table not found' });

  const updated = await prisma.table.update({
    where: { id: req.params.id },
    data: { mergedIntoTableId: null, state: 'FREE' },
  });
  notifyRestaurant(req.auth!.restaurantId!, 'tables');
  res.json(updated);
});

// Service requests raised from the guest QR page (call waiter / request bill)
router.get('/service-requests', requirePermission('tables:read'), async (req, res) => {
  const requests = await prisma.serviceRequest.findMany({ where: { restaurantId: req.auth!.restaurantId!, status: 'OPEN' }, include: { table: true }, orderBy: { createdAt: 'asc' } });
  res.json(requests);
});

router.post('/service-requests/:id/resolve', requirePermission('tables:write'), async (req, res) => {
  const updated = await prisma.serviceRequest.update({ where: { id: req.params.id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
  notifyRestaurant(req.auth!.restaurantId!, 'service');
  res.json(updated);
});

export default router;
