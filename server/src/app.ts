import express, { Request, Response, NextFunction } from 'express';
import 'express-async-errors';
import cors from 'cors';

import authRoutes from './routes/auth';
import restaurantRoutes from './routes/restaurant';
import employeeRoutes from './routes/employees';
import menuRoutes from './routes/menu';
import modifierRoutes from './routes/modifiers';
import recipeRoutes from './routes/recipes';
import taxRoutes from './routes/taxes';
import tableRoutes from './routes/tables';
import orderRoutes from './routes/orders';
import inventoryRoutes from './routes/inventory';
import supplierRoutes from './routes/suppliers';
import purchaseOrderRoutes from './routes/purchaseOrders';
import customerRoutes from './routes/customers';
import couponRoutes from './routes/coupons';
import reservationRoutes from './routes/reservations';
import qrGuestRoutes from './routes/qrGuest';
import onlineOrderRoutes from './routes/onlineOrders';
import reportRoutes from './routes/reports';
import attendanceRoutes from './routes/attendance';
import payrollRoutes from './routes/payroll';
import printerRoutes from './routes/printers';
import auditLogRoutes from './routes/auditLogs';
import notificationRoutes from './routes/notifications';
import dashboardRoutes from './routes/dashboard';
import financeRoutes from './routes/finance';
import feedbackRoutes from './routes/feedback';
import campaignRoutes from './routes/campaigns';
import happyHourRoutes from './routes/happyHourRoutes';
import superAdminRoutes from './routes/superAdmin';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));

app.get('/api/health', (_req, res) => res.json({ ok: true, version: 3 }));

app.use('/api/auth', authRoutes);
app.use('/api/restaurant', restaurantRoutes);       // branches, settings, pos-config
app.use('/api/employees', employeeRoutes);          // + role permissions
app.use('/api/menu', menuRoutes);                   // categories + items
app.use('/api/modifiers', modifierRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/taxes', taxRoutes);
app.use('/api/tables', tableRoutes);                // + service requests
app.use('/api/orders', orderRoutes);                // POS core
app.use('/api/inventory', inventoryRoutes);         // + warehouses, stock adjustments
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/customers', customerRoutes);          // + loyalty/wallet
app.use('/api/coupons', couponRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/guest', qrGuestRoutes);                // PUBLIC — unauthenticated QR ordering
app.use('/api/online-orders', onlineOrderRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/attendance', attendanceRoutes);        // + leave
app.use('/api/payroll', payrollRoutes);
app.use('/api/printers', printerRoutes);             // + KOT/bill ESC-POS generation
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/finance', financeRoutes);          // expenses + P&L-style summary
app.use('/api/feedback', feedbackRoutes);        // guest ratings & reviews (submission is public, under /api/guest)
app.use('/api/campaigns', campaignRoutes);
app.use('/api/happy-hour', happyHourRoutes);
app.use('/api/super-admin', superAdminRoutes);

// 404 for anything under /api not matched above
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler — catches thrown errors from async route handlers
// (Express 4 doesn't auto-catch async rejections; every route above is a
// plain async function, so an uncaught Prisma error lands here instead of
// crashing the function or hanging the request).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] unhandled error', err);
  const status = err.status ?? 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
});
