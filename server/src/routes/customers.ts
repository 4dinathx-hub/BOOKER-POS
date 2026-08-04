import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createCustomerSchema, updateCustomerSchema, walletTxnSchema } from '../schemas';
import { recordAudit } from '../lib/audit';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('customers:read'), async (req, res) => {
  const { q } = req.query as { q?: string };
  const customers = await prisma.customer.findMany({
    where: { restaurantId: req.auth!.restaurantId!, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {}) },
    orderBy: { lastVisitAt: 'desc' },
    take: 200,
  });
  res.json(customers);
});

router.get('/:id', requirePermission('customers:read'), async (req, res) => {
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, restaurantId: req.auth!.restaurantId! },
    include: { walletTransactions: { orderBy: { createdAt: 'desc' }, take: 50 }, feedback: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
});

router.post('/', requirePermission('customers:write'), validate(createCustomerSchema), async (req, res) => {
  const customer = await prisma.customer.create({ data: { ...req.body, restaurantId: req.auth!.restaurantId! } });
  res.status(201).json(customer);
});

router.patch('/:id', requirePermission('customers:write'), validate(updateCustomerSchema), async (req, res) => {
  const updated = await prisma.customer.update({ where: { id: req.params.id }, data: req.body });
  res.json(updated);
});

// ---- Loyalty / wallet ----
router.post('/:id/wallet', requirePermission('loyalty:write'), validate(walletTxnSchema), async (req, res) => {
  const { amount, type, note } = req.body;
  const signedAmount = type === 'REDEEM' ? -Math.abs(amount) : Math.abs(amount);

  const customer = await prisma.$transaction(async (tx) => {
    await tx.walletTransaction.create({ data: { restaurantId: req.auth!.restaurantId!, customerId: req.params.id, amount: signedAmount, type, note } });
    return tx.customer.update({ where: { id: req.params.id }, data: { walletBalance: { increment: signedAmount } } });
  });

  await recordAudit({ restaurantId: req.auth!.restaurantId!, actor: req.auth!, action: 'WALLET_TRANSACTION', entityType: 'Customer', entityId: customer.id, after: { amount: signedAmount, type } });
  res.json(customer);
});

router.post('/:id/loyalty-points', requirePermission('loyalty:write'), async (req, res) => {
  const { points } = req.body as { points: number };
  const customer = await prisma.customer.update({ where: { id: req.params.id }, data: { loyaltyPoints: { increment: points } } });
  res.json(customer);
});

export default router;
