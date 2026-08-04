import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createTaxClassSchema, updateTaxClassSchema } from '../schemas';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('taxes:read'), async (req, res) => {
  const classes = await prisma.taxClass.findMany({ where: { restaurantId: req.auth!.restaurantId! }, orderBy: { name: 'asc' } });
  res.json(classes);
});

router.post('/', requirePermission('taxes:write'), validate(createTaxClassSchema), async (req, res) => {
  if (req.body.isDefault) {
    await prisma.taxClass.updateMany({ where: { restaurantId: req.auth!.restaurantId! }, data: { isDefault: false } });
  }
  const taxClass = await prisma.taxClass.create({ data: { ...req.body, restaurantId: req.auth!.restaurantId! } });
  res.status(201).json(taxClass);
});

router.patch('/:id', requirePermission('taxes:write'), validate(updateTaxClassSchema), async (req, res) => {
  if (req.body.isDefault) {
    await prisma.taxClass.updateMany({ where: { restaurantId: req.auth!.restaurantId! }, data: { isDefault: false } });
  }
  const updated = await prisma.taxClass.update({ where: { id: req.params.id }, data: req.body });
  res.json(updated);
});

router.delete('/:id', requirePermission('taxes:write'), async (req, res) => {
  await prisma.taxClass.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
