import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createCouponSchema, updateCouponSchema } from '../schemas';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('coupons:read'), async (req, res) => {
  const coupons = await prisma.coupon.findMany({ where: { restaurantId: req.auth!.restaurantId! }, orderBy: { createdAt: 'desc' } });
  res.json(coupons);
});

router.post('/', requirePermission('coupons:write'), validate(createCouponSchema), async (req, res) => {
  const coupon = await prisma.coupon.create({ data: { ...req.body, restaurantId: req.auth!.restaurantId! } });
  res.status(201).json(coupon);
});

router.patch('/:id', requirePermission('coupons:write'), validate(updateCouponSchema), async (req, res) => {
  const updated = await prisma.coupon.update({ where: { id: req.params.id }, data: req.body });
  res.json(updated);
});

// Reports on actual discount impact — this was previously impossible since
// coupons weren't linked to orders at all.
router.get('/:id/redemptions', requirePermission('coupons:read'), async (req, res) => {
  const redemptions = await prisma.couponRedemption.findMany({ where: { couponId: req.params.id }, include: { order: true }, orderBy: { redeemedAt: 'desc' } });
  res.json(redemptions);
});

router.delete('/:id', requirePermission('coupons:write'), async (req, res) => {
  await prisma.coupon.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.status(204).send();
});

export default router;
