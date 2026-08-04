import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createModifierGroupSchema, updateModifierGroupSchema, linkModifierGroupSchema } from '../schemas';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('modifiers:read'), async (req, res) => {
  const groups = await prisma.modifierGroup.findMany({
    where: { restaurantId: req.auth!.restaurantId! },
    orderBy: { sortOrder: 'asc' },
    include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
  });
  res.json(groups);
});

router.post('/', requirePermission('modifiers:write'), validate(createModifierGroupSchema), async (req, res) => {
  const { modifiers, ...groupData } = req.body;
  const group = await prisma.modifierGroup.create({
    data: { ...groupData, restaurantId: req.auth!.restaurantId!, modifiers: { create: modifiers } },
    include: { modifiers: true },
  });
  res.status(201).json(group);
});

router.patch('/:id', requirePermission('modifiers:write'), validate(updateModifierGroupSchema), async (req, res) => {
  const { modifiers, ...groupData } = req.body;
  const updated = await prisma.modifierGroup.update({ where: { id: req.params.id }, data: groupData });
  res.json(updated);
});

router.delete('/:id', requirePermission('modifiers:write'), async (req, res) => {
  await prisma.modifierGroup.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// Individual modifier CRUD within a group
router.post('/:groupId/modifiers', requirePermission('modifiers:write'), async (req, res) => {
  const { name, priceDelta } = req.body as { name: string; priceDelta: number };
  const modifier = await prisma.modifier.create({ data: { modifierGroupId: req.params.groupId, name, priceDelta: priceDelta ?? 0 } });
  res.status(201).json(modifier);
});

router.patch('/modifiers/:id', requirePermission('modifiers:write'), async (req, res) => {
  const updated = await prisma.modifier.update({ where: { id: req.params.id }, data: req.body });
  res.json(updated);
});

router.delete('/modifiers/:id', requirePermission('modifiers:write'), async (req, res) => {
  await prisma.modifier.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// Link/unlink a modifier group to a menu item (many-to-many)
router.post('/link', requirePermission('modifiers:write'), validate(linkModifierGroupSchema), async (req, res) => {
  const link = await prisma.menuItemModifierGroup.create({ data: req.body });
  res.status(201).json(link);
});

router.delete('/link/:id', requirePermission('modifiers:write'), async (req, res) => {
  await prisma.menuItemModifierGroup.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
