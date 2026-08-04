import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function BranchComparison() {
  const { user } = useAuth();
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());

  const { data, isLoading } = useQuery({
    queryKey: ['/reports/branch-comparison', from, to],
    queryFn: async () => (await api.get('/reports/branch-comparison', { params: { from, to } })).data,
    enabled: user?.actorType === 'OWNER',
  });

  if (user?.actorType !== 'OWNER') return <Navigate to="/" replace />;

  const branches: any[] = data?.branches ?? [];
  const totalRevenue = branches.reduce((s, b) => s + b.revenue, 0);

  return (
    <div>
      <h2>Branch Comparison</h2>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: -8 }}>
        Every branch under your account, side by side — this is the "one dashboard for every outlet" view.
      </p>

      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'end' }}>
        <div className="form-row" style={{ margin: 0 }}><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="form-row" style={{ margin: 0 }}><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      {isLoading ? <p>Loading…</p> : branches.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No branches found.</p>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Branch</th><th>Revenue</th><th>% of total</th><th>Orders</th><th>Avg order</th>
                <th>Expenses</th><th>Net</th><th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.branchId}>
                  <td>{b.branchName}{b.city ? <span style={{ color: 'var(--muted)' }}> · {b.city}</span> : ''}</td>
                  <td>₹{b.revenue.toLocaleString('en-IN')}</td>
                  <td>{totalRevenue ? Math.round((b.revenue / totalRevenue) * 100) : 0}%</td>
                  <td>{b.orderCount}</td>
                  <td>₹{b.avgOrderValue}</td>
                  <td>₹{b.totalExpenses.toLocaleString('en-IN')}</td>
                  <td style={{ color: b.net >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)', fontWeight: 600 }}>
                    ₹{b.net.toLocaleString('en-IN')}
                  </td>
                  <td>{b.avgRating ? `${b.avgRating.toFixed(1)}★ (${b.reviewCount})` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
