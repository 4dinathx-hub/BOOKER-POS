import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

const router = Router();
router.use(requireAuth, requirePermission('notifications:read'));

router.get('/', async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: {
      restaurantId: req.auth!.restaurantId!,
      OR: [{ targetRole: null }, { targetRole: req.auth!.role as any }],
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(notifications);
});

router.post('/:id/read', async (req, res) => {
  const updated = await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
  res.json(updated);
});

router.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { restaurantId: req.auth!.restaurantId!, isRead: false }, data: { isRead: true } });
  res.status(204).send();
});

export default router;
