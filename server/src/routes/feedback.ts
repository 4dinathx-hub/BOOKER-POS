import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

const router = Router();
router.use(requireAuth, requirePermission('feedback:read'));

// ---- List feedback, optionally filtered by rating, newest first ----
router.get('/', async (req, res) => {
  const { rating } = req.query as { rating?: string };
  const feedback = await prisma.feedback.findMany({
    where: {
      restaurantId: req.auth!.restaurantId!,
      ...(rating ? { rating: Number(rating) } : {}),
    },
    include: { customer: { select: { id: true, name: true, phone: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json(feedback);
});

// ---- Summary: average rating + distribution across 1-5 stars ----
router.get('/summary', async (req, res) => {
  const all = await prisma.feedback.findMany({
    where: { restaurantId: req.auth!.restaurantId! },
    select: { rating: true },
  });

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const f of all) distribution[f.rating] = (distribution[f.rating] ?? 0) + 1;

  const average = all.length ? all.reduce((s, f) => s + f.rating, 0) / all.length : 0;
  res.json({ count: all.length, average, distribution });
});

export default router;
