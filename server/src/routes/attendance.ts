import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { leaveRequestSchema, reviewRequestSchema } from '../schemas';

const router = Router();
router.use(requireAuth);

router.get('/config', requirePermission('attendance:read'), async (req, res) => {
  const config = await prisma.attendanceConfig.upsert({
    where: { restaurantId: req.auth!.restaurantId! }, update: {}, create: { restaurantId: req.auth!.restaurantId! },
  });
  res.json(config);
});

router.patch('/config', requirePermission('settings:write'), async (req, res) => {
  const updated = await prisma.attendanceConfig.update({ where: { restaurantId: req.auth!.restaurantId! }, data: req.body });
  res.json(updated);
});

// Employee taps "I'm here" -> creates today's AttendanceRequest (pending manager approval).
router.post('/check-in', requireAuth, async (req, res) => {
  if (req.auth!.actorType !== 'EMPLOYEE') return res.status(403).json({ error: 'Only staff can check in' });
  const { latitude, longitude } = req.body as { latitude?: number; longitude?: number };
  const request = await prisma.attendanceRequest.upsert({
    where: { employeeId_workDate: { employeeId: req.auth!.sub, workDate: new Date(new Date().toDateString()) } },
    update: {},
    create: { restaurantId: req.auth!.restaurantId!, employeeId: req.auth!.sub, requestLatitude: latitude, requestLongitude: longitude },
  });
  res.status(201).json(request);
});

router.get('/requests', requirePermission('attendance:approve'), async (req, res) => {
  const requests = await prisma.attendanceRequest.findMany({
    where: { restaurantId: req.auth!.restaurantId!, status: 'PENDING' },
    include: { employee: { select: { id: true, name: true, role: true } } },
    orderBy: { requestedAt: 'desc' },
  });
  res.json(requests);
});

router.post('/requests/:id/review', requirePermission('attendance:approve'), validate(reviewRequestSchema), async (req, res) => {
  const updated = await prisma.attendanceRequest.update({
    where: { id: req.params.id },
    data: { status: req.body.status, reviewedById: req.auth!.actorType === 'EMPLOYEE' ? req.auth!.sub : null, reviewedAt: new Date() },
  });
  res.json(updated);
});

router.get('/days', requirePermission('attendance:read'), async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const days = await prisma.attendanceDay.findMany({
    where: { restaurantId: req.auth!.restaurantId!, ...(from && to ? { workDate: { gte: new Date(from), lte: new Date(to) } } : {}) },
    orderBy: { workDate: 'desc' },
  });
  res.json(days);
});

// ---- Leave ----
router.post('/leave', requireAuth, validate(leaveRequestSchema), async (req, res) => {
  if (req.auth!.actorType !== 'EMPLOYEE') return res.status(403).json({ error: 'Only staff can request leave' });
  const leave = await prisma.leaveRequest.create({ data: { ...req.body, restaurantId: req.auth!.restaurantId!, employeeId: req.auth!.sub } });
  res.status(201).json(leave);
});

router.get('/leave', requirePermission('attendance:approve'), async (req, res) => {
  const leaves = await prisma.leaveRequest.findMany({
    where: { restaurantId: req.auth!.restaurantId! },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(leaves);
});

router.post('/leave/:id/review', requirePermission('attendance:approve'), validate(reviewRequestSchema), async (req, res) => {
  const updated = await prisma.leaveRequest.update({
    where: { id: req.params.id },
    data: { status: req.body.status, reviewedById: req.auth!.actorType === 'EMPLOYEE' ? req.auth!.sub : null, reviewedAt: new Date() },
  });
  res.json(updated);
});

export default router;
