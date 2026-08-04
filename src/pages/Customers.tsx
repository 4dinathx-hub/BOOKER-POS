import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export default function Customers() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const { data: customers, isLoading } = useQuery({
    queryKey: ['/customers', q],
    queryFn: async () => (await api.get('/customers', { params: q ? { q } : {} })).data,
  });

  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const createCustomer = useMutation({
    mutationFn: async () => (await api.post('/customers', { name: form.name, phone: form.phone || undefined, email: form.email || undefined })).data,
    onSuccess: () => { setForm({ name: '', phone: '', email: '' }); queryClient.invalidateQueries({ queryKey: ['/customers'] }); },
  });

  const topUp = useMutation({
    mutationFn: async (id: string) => (await api.post(`/customers/${id}/wallet`, { amount: 100, type: 'TOPUP' })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/customers'] }),
  });

  return (
    <div>
      <div className="topbar">
        <h2>Customers & Loyalty</h2>
        <input placeholder="Search name/phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={(e) => { e.preventDefault(); createCustomer.mutate(); }} style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input placeholder="Email (optional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <button type="submit" disabled={createCustomer.isPending}>+ Add customer</button>
        </form>
      </div>

      <div className="card">
        {isLoading ? <p>Loading…</p> : (
          <table>
            <thead><tr><th>Name</th><th>Phone</th><th>Visits</th><th>Total spend</th><th>Loyalty pts</th><th>Wallet</th><th>Tier</th><th></th></tr></thead>
            <tbody>
              {(customers ?? []).map((c: any) => (
                <tr key={c.id}>
                  <td>{c.name}</td><td>{c.phone}</td><td>{c.visits}</td><td>₹{c.totalSpend}</td>
                  <td>{c.loyaltyPoints}</td><td>₹{Number(c.walletBalance).toFixed(2)}</td>
                  <td><span className="badge">{c.membershipTier}</span></td>
                  <td><button className="secondary" onClick={() => topUp.mutate(c.id)}>+₹100 wallet</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
