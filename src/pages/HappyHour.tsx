import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function HappyHour() {
  const queryClient = useQueryClient();
  const { data: rules, isLoading } = useQuery({ queryKey: ['/happy-hour'], queryFn: async () => (await api.get('/happy-hour')).data });
  const { data: categories } = useQuery({ queryKey: ['/menu/categories'], queryFn: async () => (await api.get('/menu/categories')).data });

  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState('17:00');
  const [endTime, setEndTime] = useState('19:00');
  const [discountPercent, setDiscountPercent] = useState(20);
  const [categoryId, setCategoryId] = useState('');
  const [showForm, setShowForm] = useState(false);

  const create = useMutation({
    mutationFn: async () => (await api.post('/happy-hour', {
      name, daysOfWeek: days, startTime, endTime, discountPercent, categoryId: categoryId || undefined,
    })).data,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/happy-hour'] }); setShowForm(false); setName(''); },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => (await api.patch(`/happy-hour/${id}`, { isEnabled })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/happy-hour'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/happy-hour/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/happy-hour'] }),
  });

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  return (
    <div>
      <div className="topbar">
        <h2>Happy Hour</h2>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ New rule'}</button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -8 }}>
        Discounts apply automatically at order time, in-house and QR self-ordering both — based on the
        branch's own timezone, not server time. Set in Settings if it looks off.
      </p>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <form onSubmit={(e) => { e.preventDefault(); if (name && days.length) create.mutate(); }}>
            <div className="grid grid-2">
              <div className="form-row"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekday Happy Hour" required /></div>
              <div className="form-row"><label>Discount %</label><input type="number" min={1} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))} /></div>
              <div className="form-row"><label>Start time</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
              <div className="form-row"><label>End time</label><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
              <div className="form-row">
                <label>Applies to</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Whole menu</option>
                  {(categories ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <label>Days</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {DAYS.map((d, i) => (
                  <button type="button" key={d} className={days.includes(i) ? '' : 'secondary'} onClick={() => toggleDay(i)}>{d}</button>
                ))}
              </div>
            </div>
            <button type="submit" disabled={create.isPending}>Save rule</button>
          </form>
        </div>
      )}

      <div className="card">
        {isLoading ? <p>Loading…</p> : (rules ?? []).length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No happy hour rules yet.</p>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Days</th><th>Time</th><th>Discount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rules.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.daysOfWeek.map((d: number) => DAYS[d]).join(', ')}</td>
                  <td>{r.startTime}–{r.endTime}</td>
                  <td>{r.discountPercent}%</td>
                  <td>
                    <span className={`badge ${r.isEnabled ? 'success' : ''}`} style={{ cursor: 'pointer' }} onClick={() => toggle.mutate({ id: r.id, isEnabled: !r.isEnabled })}>
                      {r.isEnabled ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td><button className="secondary" onClick={() => remove.mutate(r.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
