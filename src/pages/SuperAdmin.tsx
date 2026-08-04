import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

function statusColor(status: string) {
  if (status === 'ACTIVE') return 'var(--success, #16a34a)';
  if (status === 'SUSPENDED') return 'var(--danger, #dc2626)';
  return 'var(--muted)';
}

export default function SuperAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: companies, isLoading } = useQuery({
    queryKey: ['/super-admin/companies'],
    queryFn: async () => (await api.get('/super-admin/companies')).data,
    enabled: user?.role === 'SUPER_ADMIN',
  });

  const suspend = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/super-admin/companies/${id}/suspend`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/super-admin/companies'] }),
  });
  const reactivate = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/super-admin/companies/${id}/reactivate`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/super-admin/companies'] }),
  });

  if (user?.role !== 'SUPER_ADMIN') return <Navigate to="/" replace />;

  const rows: any[] = Array.isArray(companies) ? companies : [];
  const filtered = search
    ? rows.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.ownerEmail?.toLowerCase().includes(search.toLowerCase()))
    : rows;

  const active = rows.filter((c) => c.subscriptionStatus === 'ACTIVE').length;
  const suspended = rows.filter((c) => c.subscriptionStatus === 'SUSPENDED').length;

  return (
    <div>
      <h2>Platform / Super Admin</h2>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: -8 }}>
        Every restaurant company on Booker — visible only to platform-level SUPER_ADMIN accounts.
      </p>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card"><div style={{ color: 'var(--muted)', fontSize: 13 }}>Total companies</div><div style={{ fontSize: 28, fontWeight: 700 }}>{rows.length}</div></div>
        <div className="card"><div style={{ color: 'var(--muted)', fontSize: 13 }}>Active</div><div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success, #16a34a)' }}>{active}</div></div>
        <div className="card"><div style={{ color: 'var(--muted)', fontSize: 13 }}>Suspended</div><div style={{ fontSize: 28, fontWeight: 700, color: 'var(--danger, #dc2626)' }}>{suspended}</div></div>
      </div>

      <div className="card">
        <div className="topbar" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Companies</h3>
          <input placeholder="Search by name or owner email…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />
        </div>

        {isLoading ? <p>Loading…</p> : filtered.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No companies match.</p>
        ) : (
          <table>
            <thead><tr><th>Company</th><th>Owner</th><th>Branches</th><th>Status</th><th>Paid until</th><th>Signed up</th><th></th></tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.ownerEmail ?? '—'}<br /><span style={{ color: 'var(--muted)', fontSize: 12 }}>{c.ownerPhone ?? ''}</span></td>
                  <td>{c.branches?.map((b: any) => b.name).join(', ') || '—'}</td>
                  <td><span style={{ color: statusColor(c.subscriptionStatus), fontWeight: 600 }}>{c.subscriptionStatus}</span></td>
                  <td>{c.paidUntil ? new Date(c.paidUntil).toLocaleDateString() : '—'}</td>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td>
                    {c.subscriptionStatus === 'SUSPENDED' ? (
                      <button onClick={() => reactivate.mutate(c.id)} disabled={reactivate.isPending}>Reactivate</button>
                    ) : (
                      <button className="danger" onClick={() => { if (confirm(`Suspend ${c.name}? They will lose access immediately.`)) suspend.mutate(c.id); }} disabled={suspend.isPending}>
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
