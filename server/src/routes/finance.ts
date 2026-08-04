import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createExpenseSchema, updateExpenseSchema } from '../schemas';
import { recordAudit } from '../lib/audit';

const router = Router();
router.use(requireAuth);

// ---- List expenses, optionally filtered by date range / category ----
router.get('/expenses', requirePermission('finance:read'), async (req, res) => {
  const { from, to, category } = req.query as { from?: string; to?: string; category?: string };
  const expenses = await prisma.expense.findMany({
    where: {
      restaurantId: req.auth!.restaurantId!,
      ...(category ? { category } : {}),
      ...(from || to
        ? { spentOn: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
    },
    orderBy: { spentOn: 'desc' },
  });
  res.json(expenses);
});

// ---- Summary: totals by category + grand total, for a date range (defaults to current month) ----
router.get('/summary', requirePermission('finance:read'), async (req, res) => {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const { from, to } = req.query as { from?: string; to?: string };
  const range = {
    gte: from ? new Date(from) : defaultFrom,
    lte: to ? new Date(to) : now,
  };

  const expenses = await prisma.expense.findMany({
    where: { restaurantId: req.auth!.restaurantId!, spentOn: range },
  });

  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const e of expenses) {
    const amt = Number(e.amount);
    byCategory[e.category] = (byCategory[e.category] ?? 0) + amt;
    total += amt;
  }

  // Revenue for the same window, so the page can show a rough net figure
  // alongside expenses without a second round trip from the client. Mirrors
  // reports.ts's sales-summary: net sales from billed orders in the range.
  const orders = await prisma.order.findMany({
    where: { restaurantId: req.auth!.restaurantId!, status: 'BILLED', createdAt: range },
    select: { total: true, refundedAmount: true },
  });
  const revenue = orders.reduce((s, o) => s + o.total - Number(o.refundedAmount), 0);

  res.json({ from: range.gte, to: range.lte, total, byCategory, revenue, net: revenue - total });
});

router.post('/expenses', requirePermission('finance:write'), validate(createExpenseSchema), async (req, res) => {
  const expense = await prisma.expense.create({ data: { ...req.body, restaurantId: req.auth!.restaurantId! } });
  await recordAudit({
    restaurantId: req.auth!.restaurantId!, actor: req.auth!, action: 'EXPENSE_CREATED',
    entityType: 'Expense', entityId: expense.id, after: expense,
  });
  res.status(201).json(expense);
});

router.patch('/expenses/:id', requirePermission('finance:write'), validate(updateExpenseSchema), async (req, res) => {
  const before = await prisma.expense.findFirst({ where: { id: req.params.id, restaurantId: req.auth!.restaurantId! } });
  if (!before) return res.status(404).json({ error: 'Expense not found' });

  const updated = await prisma.expense.update({ where: { id: req.params.id }, data: req.body });
  await recordAudit({
    restaurantId: req.auth!.restaurantId!, actor: req.auth!, action: 'EXPENSE_UPDATED',
    entityType: 'Expense', entityId: updated.id, before, after: updated,
  });
  res.json(updated);
});

router.delete('/expenses/:id', requirePermission('finance:write'), async (req, res) => {
  const before = await prisma.expense.findFirst({ where: { id: req.params.id, restaurantId: req.auth!.restaurantId! } });
  if (!before) return res.status(404).json({ error: 'Expense not found' });

  await prisma.expense.delete({ where: { id: req.params.id } });
  await recordAudit({
    restaurantId: req.auth!.restaurantId!, actor: req.auth!, action: 'EXPENSE_DELETED',
    entityType: 'Expense', entityId: req.params.id, before,
  });
  res.status(204).send();
});

export default router;
