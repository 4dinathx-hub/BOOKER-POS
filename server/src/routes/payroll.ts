import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { recordAudit } from '../lib/audit';

const router = Router();
router.use(requireAuth, requirePermission('payroll:read'));

router.get('/runs', async (req, res) => {
  const runs = await prisma.payrollRun.findMany({ where: { restaurantId: req.auth!.restaurantId! }, orderBy: { periodStart: 'desc' }, include: { entries: true } });
  res.json(runs);
});

router.post('/runs', requirePermission('payroll:write'), async (req, res) => {
  const { periodStart, periodEnd } = req.body as { periodStart: string; periodEnd: string };
  const restaurantId = req.auth!.restaurantId!;

  const employees = await prisma.employee.findMany({ where: { restaurantId, status: 'ACTIVE' } });
  const days = await prisma.attendanceDay.findMany({
    where: { restaurantId, workDate: { gte: new Date(periodStart), lte: new Date(periodEnd) } },
  });

  const run = await prisma.payrollRun.create({
    data: {
      restaurantId, periodStart: new Date(periodStart), periodEnd: new Date(periodEnd),
      entries: {
        create: employees.map((emp) => {
          const daysPresent = days.filter((d) => d.employeeId === emp.id).reduce((s, d) => s + Number(d.daysPaid), 0);
          const netPay = emp.payType === 'MONTHLY' ? Number(emp.baseSalary) : Number(emp.baseSalary) * daysPresent;
          return { employeeId: emp.id, baseSalary: emp.baseSalary, payType: emp.payType, daysPresent, netPay };
        }),
      },
    },
    include: { entries: true },
  });
  res.status(201).json(run);
});

router.post('/runs/:id/finalize', requirePermission('payroll:write'), async (req, res) => {
  const updated = await prisma.payrollRun.update({ where: { id: req.params.id }, data: { status: 'FINALIZED', finalizedAt: new Date() } });
  await recordAudit({ restaurantId: req.auth!.restaurantId!, actor: req.auth!, action: 'PAYROLL_FINALIZED', entityType: 'PayrollRun', entityId: updated.id });
  res.json(updated);
});

router.patch('/entries/:id', requirePermission('payroll:write'), async (req, res) => {
  const { bonus, deductions, note } = req.body;
  const entry = await prisma.payrollEntry.findUniqueOrThrow({ where: { id: req.params.id } });
  const netPay = Number(entry.baseSalary) + Number(bonus ?? entry.bonus) - Number(deductions ?? entry.deductions);
  const updated = await prisma.payrollEntry.update({ where: { id: req.params.id }, data: { bonus, deductions, note, netPay } });
  res.json(updated);
});

export default router;
