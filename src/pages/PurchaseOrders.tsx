import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export default function PurchaseOrders() {
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useQuery({ queryKey: ['/purchase-orders'], queryFn: async () => (await api.get('/purchase-orders')).data });
  const { data: suggestions } = useQuery({ queryKey: ['/purchase-orders/suggestions'], queryFn: async () => (await api.get('/purchase-orders/suggestions')).data });
  const { data: inventoryItems } = useQuery({ queryKey: ['/inventory'], queryFn: async () => (await api.get('/inventory')).data });

  const [vendor, setVendor] = useState('');
  const [lines, setLines] = useState<{ inventoryItemId: string; quantity: number; unitCost: number }[]>([]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['/purchase-orders'] });

  const createPO = useMutation({
    mutationFn: async () => (await api.post('/purchase-orders', { vendor, items: lines })).data,
    onSuccess: () => { setVendor(''); setLines([]); invalidate(); },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => (await api.patch(`/purchase-orders/${id}/status`, { status })).data,
    onSuccess: invalidate,
  });

  function addSuggestionAsLine(s: any) {
    setLines((prev) => [...prev, { inventoryItemId: s.inventoryItemId, quantity: Math.max(1, s.suggestedQuantity), unitCost: 0 }]);
  }

  if (isLoading) return <p>Loading…</p>;

  return (
    <div>
      <h2>Purchase Orders</h2>

      {(suggestions ?? []).length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <strong>Reorder suggestions (at/below reorder level)</strong>
          {suggestions.map((s: any) => (
            <div key={s.inventoryItemId} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>{s.name} — stock {String(s.currentStock)}, suggest +{s.suggestedQuantity}</span>
              <button className="secondary" onClick={() => addSuggestionAsLine(s)}>Add to draft PO</button>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>New purchase order</h3>
        <div className="form-row"><label>Vendor</label><input value={vendor} onChange={(e) => setVendor(e.target.value)} /></div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select value={line.inventoryItemId} onChange={(e) => { const next = [...lines]; next[i].inventoryItemId = e.target.value; setLines(next); }}>
              <option value="">Select item</option>
              {(inventoryItems ?? []).map((it: any) => <option key={it.id} value={it.id}>{it.name}</option>)}
            </select>
            <input type="number" value={line.quantity} onChange={(e) => { const next = [...lines]; next[i].quantity = Number(e.target.value); setLines(next); }} style={{ width: 100 }} />
            <input type="number" placeholder="Unit cost" value={line.unitCost} onChange={(e) => { const next = [...lines]; next[i].unitCost = Number(e.target.value); setLines(next); }} style={{ width: 120 }} />
          </div>
        ))}
        <button className="secondary" type="button" onClick={() => setLines([...lines, { inventoryItemId: '', quantity: 1, unitCost: 0 }])}>+ Line item</button>
        <div style={{ marginTop: 12 }}>
          <button onClick={() => createPO.mutate()} disabled={!vendor || lines.length === 0 || createPO.isPending}>Create draft PO</button>
        </div>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Vendor</th><th>Status</th><th>Items</th><th>Actions</th></tr></thead>
          <tbody>
            {(orders ?? []).map((po: any) => (
              <tr key={po.id}>
                <td>{po.vendor}</td>
                <td><span className="badge">{po.status}</span></td>
                <td>{po.items.map((i: any) => `${i.inventoryItem.name} x${i.quantity}`).join(', ')}</td>
                <td>
                  {po.status === 'DRAFT' && <button className="secondary" onClick={() => setStatus.mutate({ id: po.id, status: 'ORDERED' })}>Mark Ordered</button>}
                  {po.status === 'ORDERED' && <button onClick={() => setStatus.mutate({ id: po.id, status: 'RECEIVED' })}>Receive (adds stock)</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
