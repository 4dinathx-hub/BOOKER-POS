import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export default function Payroll() {
  const queryClient = useQueryClient();
  const { data: runs, isLoading } = useQuery({ queryKey: ['/payroll/runs'], queryFn: async () => (await api.get('/payroll/runs')).data });

  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const createRun = useMutation({
    mutationFn: async () => (await api.post('/payroll/runs', { periodStart, periodEnd })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/payroll/runs'] }),
  });

  const finalize = useMutation({
    mutationFn: async (id: string) => (await api.post(`/payroll/runs/${id}/finalize`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/payroll/runs'] }),
  });

  if (isLoading) return <p>Loading…</p>;

  return (
    <div>
      <h2>Payroll</h2>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid grid-3">
          <div className="form-row"><label>Period start</label><input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
          <div className="form-row"><label>Period end</label><input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
          <button style={{ alignSelf: 'end' }} onClick={() => createRun.mutate()} disabled={!periodStart || !periodEnd || createRun.isPending}>Generate run</button>
        </div>
      </div>

      {(runs ?? []).map((run: any) => (
        <div className="card" key={run.id} style={{ marginBottom: 12 }}>
          <div className="topbar">
            <strong>{new Date(run.periodStart).toLocaleDateString()} – {new Date(run.periodEnd).toLocaleDateString()}</strong>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="badge">{run.status}</span>
              {run.status === 'DRAFT' && <button onClick={() => finalize.mutate(run.id)}>Finalize</button>}
            </div>
          </div>
          <table>
            <thead><tr><th>Employee</th><th>Days present</th><th>Net pay</th></tr></thead>
            <tbody>
              {run.entries.map((e: any) => (
                <tr key={e.id}><td>{e.employeeId}</td><td>{e.daysPresent}</td><td>₹{e.netPay}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
