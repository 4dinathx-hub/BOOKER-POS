import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth, (req, res, next) => {
  if (req.auth!.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Super-admin only' });
  next();
});

router.get('/companies', async (req, res) => {
  const companies = await prisma.company.findMany({
    include: { branches: { select: { id: true, name: true, city: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(companies);
});

router.patch('/companies/:id/suspend', async (req, res) => {
  const updated = await prisma.company.update({ where: { id: req.params.id }, data: { subscriptionStatus: 'SUSPENDED' } });
  res.json(updated);
});

router.patch('/companies/:id/reactivate', async (req, res) => {
  const updated = await prisma.company.update({ where: { id: req.params.id }, data: { subscriptionStatus: 'ACTIVE' } });
  res.json(updated);
});

export default router;
