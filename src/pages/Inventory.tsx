import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export default function Inventory() {
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useQuery({ queryKey: ['/inventory'], queryFn: async () => (await api.get('/inventory')).data });

  const [form, setForm] = useState({ name: '', unit: 'kg', stock: 0, reorderLevel: 0 });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['/inventory'] });

  const createItem = useMutation({
    mutationFn: async () => (await api.post('/inventory', form)).data,
    onSuccess: () => { setForm({ name: '', unit: 'kg', stock: 0, reorderLevel: 0 }); invalidate(); },
  });

  const adjust = useMutation({
    mutationFn: async ({ id, changeQty, reason }: { id: string; changeQty: number; reason: string }) =>
      (await api.post(`/inventory/${id}/adjust`, { changeQty, reason })).data,
    onSuccess: invalidate,
  });

  if (isLoading) return <p>Loading…</p>;

  return (
    <div>
      <div className="topbar"><h2>Inventory</h2></div>

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={(e) => { e.preventDefault(); createItem.mutate(); }} className="grid grid-4">
          <div className="form-row"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="form-row"><label>Unit</label><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
          <div className="form-row"><label>Opening stock</label><input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} /></div>
          <div className="form-row"><label>Reorder level</label><input type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })} /></div>
          <button type="submit" disabled={createItem.isPending}>+ Add ingredient</button>
        </form>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Stock</th><th>Reorder level</th><th>Vendor</th><th>Adjust</th></tr></thead>
          <tbody>
            {(items ?? []).map((item: any) => {
              const low = Number(item.stock) <= Number(item.reorderLevel);
              return (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td className={low ? 'error-text' : ''}>{Number(item.stock).toFixed(2)} {item.unit}</td>
                  <td>{Number(item.reorderLevel).toFixed(2)} {item.unit}</td>
                  <td>{item.supplier?.name ?? item.vendor ?? '—'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="secondary" onClick={() => adjust.mutate({ id: item.id, changeQty: 1, reason: 'MANUAL_CORRECTION' })}>+1</button>
                    <button className="secondary" onClick={() => adjust.mutate({ id: item.id, changeQty: -1, reason: 'WASTAGE' })}>-1 (waste)</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
