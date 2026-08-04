import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createBranchSchema, updateBranchSchema, updateSettingsSchema, updatePosConfigSchema } from '../schemas';
import { recordAudit } from '../lib/audit';

const router = Router();
router.use(requireAuth);

// ---- Branches ----
router.get('/branches', requirePermission('branches:read'), async (req, res) => {
  const branches = await prisma.restaurant.findMany({ where: { companyId: req.auth!.companyId! }, orderBy: { createdAt: 'asc' } });
  res.json(branches);
});

router.post('/branches', requirePermission('branches:write'), validate(createBranchSchema), async (req, res) => {
  const count = await prisma.restaurant.count({ where: { companyId: req.auth!.companyId! } });
  const branch = await prisma.restaurant.create({
    data: { ...req.body, companyId: req.auth!.companyId!, isDefaultBranch: count === 0 },
  });
  await prisma.posConfig.create({ data: { restaurantId: branch.id } });
  await recordAudit({ restaurantId: branch.id, actor: req.auth!, action: 'BRANCH_CREATED', entityType: 'Restaurant', entityId: branch.id, after: branch });
  res.status(201).json(branch);
});

router.patch('/branches/:id', requirePermission('branches:write'), validate(updateBranchSchema), async (req, res) => {
  const existing = await prisma.restaurant.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId! } });
  if (!existing) return res.status(404).json({ error: 'Branch not found' });
  const updated = await prisma.restaurant.update({ where: { id: req.params.id }, data: req.body });
  await recordAudit({ restaurantId: updated.id, actor: req.auth!, action: 'BRANCH_UPDATED', entityType: 'Restaurant', entityId: updated.id, before: existing, after: updated });
  res.json(updated);
});

// ---- Settings (branch-level tax/geofence/currency) ----
router.get('/settings', requirePermission('settings:read'), async (req, res) => {
  const branch = await prisma.restaurant.findUniqueOrThrow({ where: { id: req.auth!.restaurantId! } });
  res.json(branch);
});

router.patch('/settings', requirePermission('settings:write'), validate(updateSettingsSchema), async (req, res) => {
  const before = await prisma.restaurant.findUniqueOrThrow({ where: { id: req.auth!.restaurantId! } });
  const updated = await prisma.restaurant.update({ where: { id: req.auth!.restaurantId! }, data: req.body });
  await recordAudit({ restaurantId: updated.id, actor: req.auth!, action: 'SETTINGS_UPDATED', entityType: 'Restaurant', entityId: updated.id, before, after: updated });
  res.json(updated);
});

// ---- Company-level notification prefs ----
router.patch('/company/notifications', requirePermission('settings:write'), async (req, res) => {
  const { notifyEmailEnabled, notifySmsEnabled, notifyWhatsappEnabled } = req.body;
  const updated = await prisma.company.update({
    where: { id: req.auth!.companyId! },
    data: { notifyEmailEnabled, notifySmsEnabled, notifyWhatsappEnabled },
  });
  res.json(updated);
});

// ---- POS configuration ----
router.get('/pos-config', requirePermission('pos:use'), async (req, res) => {
  const config = await prisma.posConfig.upsert({
    where: { restaurantId: req.auth!.restaurantId! },
    update: {},
    create: { restaurantId: req.auth!.restaurantId! },
  });
  res.json(config);
});

router.patch('/pos-config', requirePermission('pos:config'), validate(updatePosConfigSchema), async (req, res) => {
  const updated = await prisma.posConfig.upsert({
    where: { restaurantId: req.auth!.restaurantId! },
    update: req.body,
    create: { restaurantId: req.auth!.restaurantId!, ...req.body },
  });
  await recordAudit({ restaurantId: req.auth!.restaurantId!, actor: req.auth!, action: 'POS_CONFIG_UPDATED', entityType: 'PosConfig', after: updated });
  res.json(updated);
});

// ---- Onboarding: owner marks the wizard done once branch/menu basics exist ----
router.patch('/onboarding-step', async (req, res) => {
  if (req.auth!.actorType !== 'OWNER') return res.status(403).json({ error: 'Only the owner can update onboarding status' });
  const { step } = req.body as { step: string };
  const updated = await prisma.company.update({ where: { id: req.auth!.companyId! }, data: { onboardingStep: step } });
  res.json({ onboardingStep: updated.onboardingStep });
});

export default router;
