import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createHappyHourRuleSchema, updateHappyHourRuleSchema } from '../schemas';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('menu:read'), async (req, res) => {
  const rules = await prisma.happyHourRule.findMany({ where: { restaurantId: req.auth!.restaurantId! }, orderBy: { createdAt: 'desc' } });
  res.json(rules);
});

router.post('/', requirePermission('menu:write'), validate(createHappyHourRuleSchema), async (req, res) => {
  const rule = await prisma.happyHourRule.create({ data: { ...req.body, restaurantId: req.auth!.restaurantId! } });
  res.status(201).json(rule);
});

router.patch('/:id', requirePermission('menu:write'), validate(updateHappyHourRuleSchema), async (req, res) => {
  const existing = await prisma.happyHourRule.findFirst({ where: { id: req.params.id, restaurantId: req.auth!.restaurantId! } });
  if (!existing) return res.status(404).json({ error: 'Rule not found' });
  const rule = await prisma.happyHourRule.update({ where: { id: req.params.id }, data: req.body });
  res.json(rule);
});

router.delete('/:id', requirePermission('menu:write'), async (req, res) => {
  const existing = await prisma.happyHourRule.findFirst({ where: { id: req.params.id, restaurantId: req.auth!.restaurantId! } });
  if (!existing) return res.status(404).json({ error: 'Rule not found' });
  await prisma.happyHourRule.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
