import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

const router = Router();
router.use(requireAuth, requirePermission('reports:read'));

function dateRange(req: any) {
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  return { from, to };
}

router.get('/sales-summary', async (req, res) => {
  const { from, to } = dateRange(req);
  const restaurantId = req.auth!.restaurantId!;
  const orders = await prisma.order.findMany({
    where: { restaurantId, status: 'BILLED', createdAt: { gte: from, lte: to } },
    select: { total: true, discountAmount: true, taxAmount: true, refundedAmount: true, type: true, channel: true, createdAt: true },
  });
  const grossSales = orders.reduce((s, o) => s + o.total, 0);
  const totalDiscount = orders.reduce((s, o) => s + Number(o.discountAmount), 0);
  const totalTax = orders.reduce((s, o) => s + Number(o.taxAmount), 0);
  const totalRefunds = orders.reduce((s, o) => s + Number(o.refundedAmount), 0);
  res.json({ orderCount: orders.length, grossSales, totalDiscount, totalTax, totalRefunds, netSales: grossSales - totalRefunds });
});

// Item-level sales + a naive margin estimate using recipe cost (sum of
// ingredient unitCost from the item's most recent PurchaseOrderItem, where known).
router.get('/item-performance', async (req, res) => {
  const { from, to } = dateRange(req);
  const restaurantId = req.auth!.restaurantId!;
  const items = await prisma.orderItem.groupBy({
    by: ['menuItemId'],
    where: { order: { restaurantId, status: 'BILLED', createdAt: { gte: from, lte: to } } },
    _sum: { quantity: true, priceEach: true },
  });
  const menuItems = await prisma.menuItem.findMany({ where: { id: { in: items.map((i) => i.menuItemId) } } });
  const byId = new Map(menuItems.map((m) => [m.id, m]));
  const rows = items.map((i) => ({
    menuItemId: i.menuItemId,
    name: byId.get(i.menuItemId)?.name ?? 'Unknown',
    unitsSold: i._sum.quantity ?? 0,
    revenue: (i._sum.quantity ?? 0) * (byId.get(i.menuItemId)?.price ?? 0),
  })).sort((a, b) => b.revenue - a.revenue);
  res.json(rows);
});

router.get('/discount-impact', async (req, res) => {
  const { from, to } = dateRange(req);
  const redemptions = await prisma.couponRedemption.findMany({
    where: { order: { restaurantId: req.auth!.restaurantId!, createdAt: { gte: from, lte: to } } },
    include: { coupon: true },
  });
  res.json(redemptions);
});

router.get('/labor-cost', async (req, res) => {
  const { from, to } = dateRange(req);
  const entries = await prisma.payrollEntry.findMany({
    where: { payrollRun: { restaurantId: req.auth!.restaurantId!, periodStart: { gte: from }, periodEnd: { lte: to } } },
  });
  const totalLabor = entries.reduce((s, e) => s + Number(e.netPay), 0);
  res.json({ totalLabor, entryCount: entries.length });
});

// ---- Multi-branch comparison — owner-only, aggregates across every
// restaurant under this Company. Deliberately not gated by requirePermission
// (which only knows about the single active branch's role) — gated on
// actorType directly, since "compare my other branches" is inherently a
// cross-branch, owner-level view a branch-scoped MANAGER shouldn't get. ----
router.get('/branch-comparison', async (req, res) => {
  if (req.auth!.actorType !== 'OWNER') {
    return res.status(403).json({ error: 'Only the account owner can compare branches' });
  }
  const { from, to } = dateRange(req);
  const branches = await prisma.restaurant.findMany({ where: { companyId: req.auth!.companyId! }, select: { id: true, name: true, city: true } });

  const rows = await Promise.all(
    branches.map(async (branch) => {
      const orders = await prisma.order.findMany({
        where: { restaurantId: branch.id, status: 'BILLED', createdAt: { gte: from, lte: to } },
        select: { total: true, refundedAmount: true },
      });
      const revenue = orders.reduce((s, o) => s + o.total - Number(o.refundedAmount), 0);
      const orderCount = orders.length;

      const expenses = await prisma.expense.findMany({ where: { restaurantId: branch.id, spentOn: { gte: from, lte: to } }, select: { amount: true } });
      const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

      const feedback = await prisma.feedback.findMany({ where: { restaurantId: branch.id, createdAt: { gte: from, lte: to } }, select: { rating: true } });
      const avgRating = feedback.length ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length : null;

      return {
        branchId: branch.id,
        branchName: branch.name,
        city: branch.city,
        revenue,
        orderCount,
        avgOrderValue: orderCount ? Math.round(revenue / orderCount) : 0,
        totalExpenses,
        net: revenue - totalExpenses,
        avgRating,
        reviewCount: feedback.length,
      };
    })
  );

  res.json({ from, to, branches: rows.sort((a, b) => b.revenue - a.revenue) });
});

export default router;
