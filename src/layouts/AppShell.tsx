import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const NAV_SECTIONS: { label: string; items: { to: string; label: string }[] }[] = [
  { label: 'Overview', items: [{ to: '/', label: 'Dashboard' }] },
  {
    label: 'Menu', items: [
      { to: '/menu', label: 'Menu & Categories' },
      { to: '/modifiers', label: 'Modifiers' },
      { to: '/taxes', label: 'Taxes & GST' },
    ],
  },
  {
    label: 'Operations', items: [
      { to: '/pos', label: 'POS' },
      { to: '/tables', label: 'Tables' },
      { to: '/qr-codes', label: 'QR Codes' },
      { to: '/kitchen', label: 'Kitchen (KDS)' },
      { to: '/reservations', label: 'Reservations' },
      { to: '/online-orders', label: 'Online Orders' },
    ],
  },
  {
    label: 'Inventory', items: [
      { to: '/inventory', label: 'Inventory' },
      { to: '/warehouses', label: 'Warehouses' },
      { to: '/suppliers', label: 'Suppliers' },
      { to: '/purchase-orders', label: 'Purchase Orders' },
    ],
  },
  {
    label: 'CRM', items: [
      { to: '/customers', label: 'Customers & Loyalty' },
      { to: '/feedback', label: 'Feedback & Reviews' },
      { to: '/campaigns', label: 'Marketing Campaigns' },
      { to: '/coupons', label: 'Coupons' },
      { to: '/happy-hour', label: 'Happy Hour' },
    ],
  },
  {
    label: 'Team', items: [
      { to: '/employees', label: 'Employees & Roles' },
      { to: '/attendance', label: 'Attendance & Leave' },
      { to: '/payroll', label: 'Payroll' },
      { to: '/finance', label: 'Finance & Expenses' },
    ],
  },
  {
    label: 'System', items: [
      { to: '/reports', label: 'Reports' },
      { to: '/printers', label: 'Printing (KOT/Bill)' },
      { to: '/notifications', label: 'Notifications' },
      { to: '/audit-logs', label: 'Audit Logs' },
      { to: '/settings', label: 'Settings' },
    ],
  },
];

export function ProtectedLayout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  const { data: branches } = useQuery({
    queryKey: ['/restaurant/branches'],
    queryFn: async () => (await api.get('/restaurant/branches')).data,
    enabled: !!user && user.actorType === 'OWNER',
  });

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  const needsOnboarding = user.actorType === 'OWNER' && Array.isArray(branches) && branches.length === 0;
  if (needsOnboarding && location.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />;

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div style={{ fontWeight: 700, padding: '4px 10px 16px' }}>Booker Admin</div>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 10px', textTransform: 'uppercase' }}>{section.label}</div>
            {section.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}>{item.label}</NavLink>
            ))}
          </div>
        ))}
        {user.actorType === 'OWNER' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 10px', textTransform: 'uppercase' }}>Owner</div>
            <NavLink to="/branch-comparison">Branch Comparison</NavLink>
          </div>
        )}
        {user.role === 'SUPER_ADMIN' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 10px', textTransform: 'uppercase' }}>Platform</div>
            <NavLink to="/super-admin">Super Admin</NavLink>
          </div>
        )}
        <div style={{ marginTop: 'auto', padding: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>{user.name} <span className="badge">{user.role}</span></div>
          <button className="secondary" onClick={logout}>Log out</button>
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
