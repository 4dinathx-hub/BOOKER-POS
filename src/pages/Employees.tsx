import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const ROLES = ['MANAGER', 'CAPTAIN', 'WAITER', 'CASHIER', 'CHEF', 'KITCHEN_STAFF', 'HELPER'];

export default function Employees() {
  const queryClient = useQueryClient();
  const { data: employees, isLoading } = useQuery({ queryKey: ['/employees'], queryFn: async () => (await api.get('/employees')).data });
  const { data: permData } = useQuery({ queryKey: ['/employees/roles/permissions'], queryFn: async () => (await api.get('/employees/roles/permissions')).data });

  const [form, setForm] = useState({ name: '', role: 'WAITER', code: '', pin: '' });
  const [showPermissions, setShowPermissions] = useState(false);

  const createEmployee = useMutation({
    mutationFn: async () => (await api.post('/employees', form)).data,
    onSuccess: () => { setForm({ name: '', role: 'WAITER', code: '', pin: '' }); queryClient.invalidateQueries({ queryKey: ['/employees'] }); },
  });

  const togglePermission = useMutation({
    mutationFn: async ({ role, permission, granted }: any) => (await api.put('/employees/roles/permissions', { role, permission, granted })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/employees/roles/permissions'] }),
  });

  function isGranted(role: string, permission: string) {
    const override = permData?.overrides.find((o: any) => o.role === role && o.permission === permission);
    if (override) return override.granted;
    return permData?.defaults[role]?.includes(permission) ?? false;
  }

  if (isLoading) return <p>Loading…</p>;

  return (
    <div>
      <div className="topbar">
        <h2>Employees & Roles</h2>
        <button className="secondary" onClick={() => setShowPermissions((v) => !v)}>{showPermissions ? 'Hide' : 'Edit'} permission matrix</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={(e) => { e.preventDefault(); createEmployee.mutate(); }} className="grid grid-4">
          <div className="form-row"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="form-row">
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-row"><label>Login code</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></div>
          <div className="form-row"><label>PIN (4-8 digits)</label><input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} required /></div>
          <button type="submit" disabled={createEmployee.isPending}>+ Add employee</button>
        </form>
      </div>

      {showPermissions && permData && (
        <div className="card" style={{ marginBottom: 16, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Permission</th>{ROLES.map((r) => <th key={r}>{r}</th>)}</tr></thead>
            <tbody>
              {permData.allPermissions.map((perm: string) => (
                <tr key={perm}>
                  <td>{perm}</td>
                  {ROLES.map((role) => (
                    <td key={role} style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox" checked={isGranted(role, perm)}
                        onChange={(e) => togglePermission.mutate({ role, permission: perm, granted: e.target.checked })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Code</th><th>Status</th></tr></thead>
          <tbody>
            {(employees ?? []).map((e: any) => (
              <tr key={e.id}><td>{e.name}</td><td>{e.role}</td><td>{e.code}</td><td><span className="badge">{e.status}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
