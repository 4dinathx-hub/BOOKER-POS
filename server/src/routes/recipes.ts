import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { upsertRecipeSchema } from '../schemas';

const router = Router();
router.use(requireAuth);

router.get('/:menuItemId', requirePermission('recipes:read'), async (req, res) => {
  const ingredients = await prisma.recipeIngredient.findMany({
    where: { menuItemId: req.params.menuItemId },
    include: { inventoryItem: { select: { id: true, name: true, unit: true, stock: true } } },
  });
  res.json(ingredients);
});

// Full replace of a menu item's recipe — simplest correct semantics for an
// editable BOM list (delete-then-recreate inside a transaction).
router.put('/', requirePermission('recipes:write'), validate(upsertRecipeSchema), async (req, res) => {
  const { menuItemId, ingredients } = req.body;
  const result = await prisma.$transaction(async (tx) => {
    await tx.recipeIngredient.deleteMany({ where: { menuItemId } });
    await tx.recipeIngredient.createMany({ data: ingredients.map((i: any) => ({ ...i, menuItemId })) });
    return tx.recipeIngredient.findMany({ where: { menuItemId }, include: { inventoryItem: true } });
  });
  res.json(result);
});

export default router;
