import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createSupplierSchema, updateSupplierSchema } from '../schemas';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('suppliers:read'), async (req, res) => {
  const suppliers = await prisma.supplier.findMany({ where: { restaurantId: req.auth!.restaurantId! }, orderBy: { name: 'asc' } });
  res.json(suppliers);
});

router.get('/:id', requirePermission('suppliers:read'), async (req, res) => {
  const supplier = await prisma.supplier.findFirst({
    where: { id: req.params.id, restaurantId: req.auth!.restaurantId! },
    include: { inventoryItems: true, purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
  res.json(supplier);
});

router.post('/', requirePermission('suppliers:write'), validate(createSupplierSchema), async (req, res) => {
  const supplier = await prisma.supplier.create({ data: { ...req.body, restaurantId: req.auth!.restaurantId! } });
  res.status(201).json(supplier);
});

router.patch('/:id', requirePermission('suppliers:write'), validate(updateSupplierSchema), async (req, res) => {
  const updated = await prisma.supplier.update({ where: { id: req.params.id }, data: req.body });
  res.json(updated);
});

router.delete('/:id', requirePermission('suppliers:write'), async (req, res) => {
  await prisma.supplier.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.status(204).send();
});

export default router;
