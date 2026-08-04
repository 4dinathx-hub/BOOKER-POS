import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createReservationSchema, updateReservationSchema } from '../schemas';
import { notifyRestaurant } from '../lib/realtime';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('tables:read'), async (req, res) => {
  const reservations = await prisma.reservation.findMany({
    where: { restaurantId: req.auth!.restaurantId! },
    orderBy: { reservedFor: 'asc' },
    include: { table: true, customer: true },
  });
  res.json(reservations);
});

// No `duration` field exists on Reservation — just a single reservedFor
// timestamp — so double-booking detection assumes a fixed turn time rather
// than a real end time. 90 minutes is a reasonable dine-in default, but if
// a restaurant's actual table turn time is meaningfully different, this
// will under- or over-flag conflicts. Add a real duration field if this
// needs to be precise (e.g. for a restaurant that does 45-minute lunch
// slots vs 2-hour dinner reservations).
const ASSUMED_TURN_MINUTES = 90;

async function hasConflict(restaurantId: string, tableId: string, reservedFor: Date, excludeReservationId?: string) {
  const windowStart = new Date(reservedFor.getTime() - ASSUMED_TURN_MINUTES * 60 * 1000);
  const windowEnd = new Date(reservedFor.getTime() + ASSUMED_TURN_MINUTES * 60 * 1000);
  const conflict = await prisma.reservation.findFirst({
    where: {
      restaurantId, tableId,
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      reservedFor: { gte: windowStart, lte: windowEnd },
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
    },
  });
  return conflict;
}

router.post('/', requirePermission('tables:write'), validate(createReservationSchema), async (req, res) => {
  if (req.body.tableId) {
    const conflict = await hasConflict(req.auth!.restaurantId!, req.body.tableId, new Date(req.body.reservedFor));
    if (conflict) {
      return res.status(409).json({
        error: `This table already has a reservation around that time (${new Date(conflict.reservedFor).toLocaleString()}) — pick another table or time, or mark it as a waitlist entry instead.`,
      });
    }
  }
  const reservation = await prisma.reservation.create({ data: { ...req.body, restaurantId: req.auth!.restaurantId! } });
  if (reservation.tableId) await prisma.table.update({ where: { id: reservation.tableId }, data: { state: 'RESERVED' } });
  notifyRestaurant(req.auth!.restaurantId!, 'reservations');
  res.status(201).json(reservation);
});

router.patch('/:id', requirePermission('tables:write'), validate(updateReservationSchema), async (req, res) => {
  if (req.body.tableId || req.body.reservedFor) {
    const existing = await prisma.reservation.findFirst({ where: { id: req.params.id, restaurantId: req.auth!.restaurantId! } });
    if (!existing) return res.status(404).json({ error: 'Reservation not found' });
    const tableId = req.body.tableId ?? existing.tableId;
    const reservedFor = req.body.reservedFor ? new Date(req.body.reservedFor) : existing.reservedFor;
    if (tableId) {
      const conflict = await hasConflict(req.auth!.restaurantId!, tableId, reservedFor, req.params.id);
      if (conflict) {
        return res.status(409).json({ error: `This table already has a reservation around that time (${new Date(conflict.reservedFor).toLocaleString()}).` });
      }
    }
  }
  const updated = await prisma.reservation.update({ where: { id: req.params.id }, data: req.body });
  if (updated.status === 'SEATED' && updated.tableId) await prisma.table.update({ where: { id: updated.tableId }, data: { state: 'OCCUPIED' } });
  if ((updated.status === 'CANCELLED' || updated.status === 'NO_SHOW') && updated.tableId) await prisma.table.update({ where: { id: updated.tableId }, data: { state: 'FREE' } });
  notifyRestaurant(req.auth!.restaurantId!, 'reservations');
  res.json(updated);
});

export default router;
