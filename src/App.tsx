import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedLayout } from './layouts/AppShell';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Finance from './pages/Finance';
import Onboarding from './pages/Onboarding';
import Menu from './pages/Menu';
import Modifiers from './pages/Modifiers';
import Taxes from './pages/Taxes';
import Tables from './pages/Tables';
import POS from './pages/POS';
import Kitchen from './pages/Kitchen';
import Reservations from './pages/Reservations';
import OnlineOrders from './pages/OnlineOrders';
import Inventory from './pages/Inventory';
import Warehouses from './pages/Warehouses';
import Suppliers from './pages/Suppliers';
import PurchaseOrders from './pages/PurchaseOrders';
import Customers from './pages/Customers';
import Feedback from './pages/Feedback';
import SuperAdmin from './pages/SuperAdmin';
import Invoice from './pages/Invoice';
import GuestOrder from './pages/GuestOrder';
import BranchComparison from './pages/BranchComparison';
import MenuView from './pages/MenuView';
import QrCodes from './pages/QrCodes';
import Campaigns from './pages/Campaigns';
import HappyHour from './pages/HappyHour';
import Coupons from './pages/Coupons';
import Employees from './pages/Employees';
import Attendance from './pages/Attendance';
import Payroll from './pages/Payroll';
import Reports from './pages/Reports';
import Printers from './pages/Printers';
import Notifications from './pages/Notifications';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/invoice/:orderId" element={<Invoice />} />
      <Route path="/order/:restaurantId/:tableId" element={<GuestOrder />} />
      <Route path="/menu/:restaurantId" element={<MenuView />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/branch-comparison" element={<BranchComparison />} />
        <Route path="/qr-codes" element={<QrCodes />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/happy-hour" element={<HappyHour />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/modifiers" element={<Modifiers />} />
        <Route path="/taxes" element={<Taxes />} />
        <Route path="/tables" element={<Tables />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/kitchen" element={<Kitchen />} />
        <Route path="/reservations" element={<Reservations />} />
        <Route path="/online-orders" element={<OnlineOrders />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/warehouses" element={<Warehouses />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/purchase-orders" element={<PurchaseOrders />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/super-admin" element={<SuperAdmin />} />
        <Route path="/coupons" element={<Coupons />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/printers" element={<Printers />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/audit-logs" element={<AuditLogs />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
