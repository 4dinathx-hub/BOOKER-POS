import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

const router = Router();
router.use(requireAuth, requirePermission('audit_logs:read'));

router.get('/', async (req, res) => {
  const { entityType, action, from, to, page = '1', pageSize = '50' } = req.query as Record<string, string>;
  const where: any = { restaurantId: req.auth!.restaurantId! };
  if (entityType) where.entityType = entityType;
  if (action) where.action = action;
  if (from || to) where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where, orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(pageSize), take: Number(pageSize),
    }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ logs, total, page: Number(page), pageSize: Number(pageSize) });
});

export default router;
