import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export default function Reservations() {
  const queryClient = useQueryClient();
  const { data: reservations, isLoading } = useQuery({ queryKey: ['/reservations'], queryFn: async () => (await api.get('/reservations')).data });
  const { data: tables } = useQuery({ queryKey: ['/tables'], queryFn: async () => (await api.get('/tables')).data });

  const [form, setForm] = useState({ guestName: '', guestPhone: '', partySize: 2, tableId: '', reservedFor: '' });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['/reservations'] });

  const create = useMutation({
    mutationFn: async () => (await api.post('/reservations', {
      ...form, partySize: Number(form.partySize), tableId: form.tableId || undefined,
      reservedFor: new Date(form.reservedFor).toISOString(),
    })).data,
    onSuccess: () => { setForm({ guestName: '', guestPhone: '', partySize: 2, tableId: '', reservedFor: '' }); invalidate(); },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => (await api.patch(`/reservations/${id}`, { status })).data,
    onSuccess: invalidate,
  });

  if (isLoading) return <p>Loading…</p>;

  return (
    <div>
      <h2>Reservations & Waitlist</h2>
      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid grid-4">
          <div className="form-row"><label>Guest name</label><input value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} required /></div>
          <div className="form-row"><label>Phone</label><input value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} /></div>
          <div className="form-row"><label>Party size</label><input type="number" value={form.partySize} onChange={(e) => setForm({ ...form, partySize: Number(e.target.value) })} /></div>
          <div className="form-row"><label>Table (optional)</label>
            <select value={form.tableId} onChange={(e) => setForm({ ...form, tableId: e.target.value })}>
              <option value="">Unassigned</option>
              {(tables ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-row"><label>Reserved for</label><input type="datetime-local" value={form.reservedFor} onChange={(e) => setForm({ ...form, reservedFor: e.target.value })} required /></div>
          <button type="submit" disabled={create.isPending}>+ Reserve</button>
        </form>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Guest</th><th>Party</th><th>Table</th><th>When</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {(reservations ?? []).map((r: any) => (
              <tr key={r.id}>
                <td>{r.guestName}</td><td>{r.partySize}</td><td>{r.table?.label ?? '—'}</td>
                <td>{new Date(r.reservedFor).toLocaleString()}</td>
                <td><span className="badge">{r.status}</span></td>
                <td style={{ display: 'flex', gap: 6 }}>
                  {r.status === 'PENDING' && <button className="secondary" onClick={() => setStatus.mutate({ id: r.id, status: 'CONFIRMED' })}>Confirm</button>}
                  {['PENDING', 'CONFIRMED'].includes(r.status) && <button onClick={() => setStatus.mutate({ id: r.id, status: 'SEATED' })}>Seat</button>}
                  {['PENDING', 'CONFIRMED'].includes(r.status) && <button className="danger" onClick={() => setStatus.mutate({ id: r.id, status: 'CANCELLED' })}>Cancel</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
