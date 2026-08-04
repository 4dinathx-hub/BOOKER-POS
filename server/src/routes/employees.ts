import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createEmployeeSchema, updateEmployeeSchema, rolePermissionSchema } from '../schemas';
import { hashSecret } from '../lib/hash';
import { recordAudit } from '../lib/audit';
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '../lib/permissions';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('employees:read'), async (req, res) => {
  const employees = await prisma.employee.findMany({
    where: { restaurantId: req.auth!.restaurantId! },
    select: { id: true, name: true, role: true, phone: true, email: true, shiftLabel: true, code: true, status: true, baseSalary: true, payType: true, createdAt: true },
    orderBy: { name: 'asc' },
  });
  res.json(employees);
});

router.post('/', requirePermission('employees:write'), validate(createEmployeeSchema), async (req, res) => {
  const { pin, ...data } = req.body;
  const pinHash = await hashSecret(pin);
  const employee = await prisma.employee.create({ data: { ...data, pinHash, restaurantId: req.auth!.restaurantId! } });
  await recordAudit({ restaurantId: req.auth!.restaurantId!, actor: req.auth!, action: 'EMPLOYEE_CREATED', entityType: 'Employee', entityId: employee.id, after: { ...employee, pinHash: undefined } });
  res.status(201).json({ ...employee, pinHash: undefined });
});

router.patch('/:id', requirePermission('employees:write'), validate(updateEmployeeSchema), async (req, res) => {
  const before = await prisma.employee.findFirst({ where: { id: req.params.id, restaurantId: req.auth!.restaurantId! } });
  if (!before) return res.status(404).json({ error: 'Employee not found' });
  const updated = await prisma.employee.update({ where: { id: req.params.id }, data: req.body });
  const action = req.body.role && req.body.role !== before.role ? 'EMPLOYEE_ROLE_CHANGED' : 'EMPLOYEE_UPDATED';
  await recordAudit({ restaurantId: req.auth!.restaurantId!, actor: req.auth!, action, entityType: 'Employee', entityId: updated.id, before: { ...before, pinHash: undefined }, after: { ...updated, pinHash: undefined } });
  res.json({ ...updated, pinHash: undefined });
});

router.post('/:id/reset-pin', requirePermission('employees:write'), async (req, res) => {
  const { pin } = req.body as { pin: string };
  const pinHash = await hashSecret(pin);
  await prisma.employee.update({ where: { id: req.params.id }, data: { pinHash } });
  await recordAudit({ restaurantId: req.auth!.restaurantId!, actor: req.auth!, action: 'EMPLOYEE_PIN_RESET', entityType: 'Employee', entityId: req.params.id });
  res.status(204).send();
});

// ---- RBAC: view/edit permission matrix for this branch ----
router.get('/roles/permissions', requirePermission('employees:roles'), async (req, res) => {
  const overrides = await prisma.rolePermission.findMany({ where: { restaurantId: req.auth!.restaurantId! } });
  res.json({ allPermissions: PERMISSIONS, defaults: DEFAULT_ROLE_PERMISSIONS, overrides });
});

router.put('/roles/permissions', requirePermission('employees:roles'), validate(rolePermissionSchema), async (req, res) => {
  const { role, permission, granted } = req.body;
  const updated = await prisma.rolePermission.upsert({
    where: { restaurantId_role_permission: { restaurantId: req.auth!.restaurantId!, role, permission } },
    update: { granted },
    create: { restaurantId: req.auth!.restaurantId!, role, permission, granted },
  });
  await recordAudit({ restaurantId: req.auth!.restaurantId!, actor: req.auth!, action: 'ROLE_PERMISSION_CHANGED', entityType: 'RolePermission', after: updated });
  res.json(updated);
});

export default router;
