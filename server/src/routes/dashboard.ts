import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

const router = Router();
router.use(requireAuth, requirePermission('dashboard:read'));

router.get('/summary', async (req, res) => {
  const restaurantId = req.auth!.restaurantId!;
  const todayStart = new Date(new Date().toDateString());

  const lowStockRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM inventory_items WHERE restaurant_id = ${restaurantId}::uuid AND stock <= reorder_level`;
  const lowStockCount = Number(lowStockRows[0]?.count ?? 0);

  const [todayOrders, activeTables, totalTables, openServiceRequests, pendingAttendance] = await Promise.all([
    prisma.order.findMany({ where: { restaurantId, status: 'BILLED', createdAt: { gte: todayStart } }, select: { total: true } }),
    prisma.table.count({ where: { restaurantId, state: 'OCCUPIED' } }),
    prisma.table.count({ where: { restaurantId } }),
    prisma.serviceRequest.count({ where: { restaurantId, status: 'OPEN' } }),
    prisma.attendanceRequest.count({ where: { restaurantId, status: 'PENDING' } }),
  ]);

  res.json({
    todaySales: todayOrders.reduce((s, o) => s + o.total, 0),
    todayOrderCount: todayOrders.length,
    activeTables, totalTables,
    lowStockCount,
    openServiceRequests,
    pendingAttendance,
  });
});

export default router;
