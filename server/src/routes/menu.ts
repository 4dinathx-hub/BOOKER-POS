import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createCategorySchema, updateCategorySchema, createMenuItemSchema, updateMenuItemSchema } from '../schemas';
import { recordAudit } from '../lib/audit';
import { notifyRestaurant } from '../lib/realtime';

const router = Router();
router.use(requireAuth);

router.get('/categories', requirePermission('menu:read'), async (req, res) => {
  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId: req.auth!.restaurantId! },
    orderBy: { sortOrder: 'asc' },
    include: { items: { orderBy: { name: 'asc' }, include: { taxClass: true, modifierGroups: { include: { modifierGroup: { include: { modifiers: true } } } }, comboComponents: { include: { componentMenuItem: { select: { id: true, name: true } } } } } } },
  });
  res.json(categories);
});

router.post('/categories', requirePermission('menu:write'), validate(createCategorySchema), async (req, res) => {
  const count = await prisma.menuCategory.count({ where: { restaurantId: req.auth!.restaurantId! } });
  const category = await prisma.menuCategory.create({ data: { ...req.body, restaurantId: req.auth!.restaurantId!, sortOrder: count } });
  res.status(201).json(category);
});

router.patch('/categories/:id', requirePermission('menu:write'), validate(updateCategorySchema), async (req, res) => {
  const updated = await prisma.menuCategory.update({ where: { id: req.params.id }, data: req.body });
  res.json(updated);
});

router.delete('/categories/:id', requirePermission('menu:write'), async (req, res) => {
  await prisma.menuCategory.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

router.post('/items', requirePermission('menu:write'), validate(createMenuItemSchema), async (req, res) => {
  const item = await prisma.menuItem.create({ data: { ...req.body, restaurantId: req.auth!.restaurantId! } });
  notifyRestaurant(req.auth!.restaurantId!, 'orders'); // POS/menu screens should refresh
  res.status(201).json(item);
});

router.patch('/items/:id', requirePermission('menu:write'), validate(updateMenuItemSchema), async (req, res) => {
  const before = await prisma.menuItem.findUniqueOrThrow({ where: { id: req.params.id } });
  const updated = await prisma.menuItem.update({ where: { id: req.params.id }, data: req.body });
  if (req.body.price !== undefined && req.body.price !== before.price) {
    await recordAudit({ restaurantId: req.auth!.restaurantId!, actor: req.auth!, action: 'PRICE_CHANGED', entityType: 'MenuItem', entityId: updated.id, before: { price: before.price }, after: { price: updated.price } });
  }
  notifyRestaurant(req.auth!.restaurantId!, 'orders');
  res.json(updated);
});

router.post('/items/:id/toggle-availability', requirePermission('menu:write'), async (req, res) => {
  const item = await prisma.menuItem.findUniqueOrThrow({ where: { id: req.params.id } });
  const updated = await prisma.menuItem.update({ where: { id: req.params.id }, data: { isAvailable: !item.isAvailable } });
  notifyRestaurant(req.auth!.restaurantId!, 'orders');
  res.json(updated);
});

router.delete('/items/:id', requirePermission('menu:write'), async (req, res) => {
  await prisma.menuItem.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ==================== Recipe / BOM (drives automatic stock deduction) ====================
// Without at least one RecipeIngredient row, deductStockForOrder() has
// nothing to deduct for that item — selling it will never move inventory.
// This was a real gap: the stock-deduction engine existed and was tested,
// but there was no way for a restaurant to actually configure what a dish
// consumes.

router.get('/items/:id/recipe', requirePermission('menu:read'), async (req, res) => {
  const item = await prisma.menuItem.findFirst({ where: { id: req.params.id, restaurantId: req.auth!.restaurantId! } });
  if (!item) return res.status(404).json({ error: 'Menu item not found' });
  const ingredients = await prisma.recipeIngredient.findMany({
    where: { menuItemId: req.params.id },
    include: { inventoryItem: { select: { id: true, name: true, unit: true, stock: true } } },
  });
  res.json(ingredients);
});

router.post('/items/:id/recipe', requirePermission('menu:write'), async (req, res) => {
  const { inventoryItemId, quantityPerUnit, unit } = req.body as { inventoryItemId: string; quantityPerUnit: number; unit: string };
  if (!inventoryItemId || !quantityPerUnit || !unit) {
    return res.status(400).json({ error: 'inventoryItemId, quantityPerUnit, and unit are required' });
  }
  const item = await prisma.menuItem.findFirst({ where: { id: req.params.id, restaurantId: req.auth!.restaurantId! } });
  if (!item) return res.status(404).json({ error: 'Menu item not found' });
  const inventoryItem = await prisma.inventoryItem.findFirst({ where: { id: inventoryItemId, restaurantId: req.auth!.restaurantId! } });
  if (!inventoryItem) return res.status(404).json({ error: 'Inventory item not found' });

  const ingredient = await prisma.recipeIngredient.upsert({
    where: { menuItemId_inventoryItemId: { menuItemId: req.params.id, inventoryItemId } },
    create: { menuItemId: req.params.id, inventoryItemId, quantityPerUnit, unit },
    update: { quantityPerUnit, unit },
  });
  res.status(201).json(ingredient);
});

router.delete('/recipe/:id', requirePermission('menu:write'), async (req, res) => {
  const ingredient = await prisma.recipeIngredient.findFirst({
    where: { id: req.params.id, menuItem: { restaurantId: req.auth!.restaurantId! } },
  });
  if (!ingredient) return res.status(404).json({ error: 'Recipe ingredient not found' });
  await prisma.recipeIngredient.delete({ where: { id: ingredient.id } });
  res.status(204).send();
});

// ==================== Combo components (display-only breakdown) ====================
// See the schema comment on MenuItem.comboComponents: this is purely for
// showing "this combo = X + Y + Z" on the KOT and invoice. The combo's own
// `price` and `recipeItems` (set like any normal menu item) are what
// actually drive billing and stock deduction.

router.get('/items/:id/combo-components', requirePermission('menu:read'), async (req, res) => {
  const item = await prisma.menuItem.findFirst({ where: { id: req.params.id, restaurantId: req.auth!.restaurantId! } });
  if (!item) return res.status(404).json({ error: 'Menu item not found' });
  const components = await prisma.comboComponent.findMany({
    where: { comboMenuItemId: req.params.id },
    include: { componentMenuItem: { select: { id: true, name: true, price: true } } },
  });
  res.json(components);
});

router.post('/items/:id/combo-components', requirePermission('menu:write'), async (req, res) => {
  const { componentMenuItemId, quantity } = req.body as { componentMenuItemId: string; quantity?: number };
  const comboItem = await prisma.menuItem.findFirst({ where: { id: req.params.id, restaurantId: req.auth!.restaurantId! } });
  if (!comboItem) return res.status(404).json({ error: 'Combo item not found' });
  if (!comboItem.isCombo) return res.status(400).json({ error: 'This menu item is not marked as a combo — set isCombo=true first' });

  const componentItem = await prisma.menuItem.findFirst({ where: { id: componentMenuItemId, restaurantId: req.auth!.restaurantId! } });
  if (!componentItem) return res.status(404).json({ error: 'Component menu item not found' });
  if (componentItem.id === comboItem.id) return res.status(400).json({ error: 'A combo cannot contain itself' });

  const component = await prisma.comboComponent.create({
    data: { comboMenuItemId: req.params.id, componentMenuItemId, quantity: quantity ?? 1 },
  });
  res.status(201).json(component);
});

router.delete('/combo-components/:id', requirePermission('menu:write'), async (req, res) => {
  const component = await prisma.comboComponent.findFirst({
    where: { id: req.params.id, comboMenuItem: { restaurantId: req.auth!.restaurantId! } },
  });
  if (!component) return res.status(404).json({ error: 'Component not found' });
  await prisma.comboComponent.delete({ where: { id: component.id } });
  res.status(204).send();
});

export default router;
