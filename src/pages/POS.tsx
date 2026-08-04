import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

interface CartLine { menuItemId: string; name: string; price: number; quantity: number; }

export default function POS() {
  const queryClient = useQueryClient();
  const { data: categories } = useQuery({ queryKey: ['/menu/categories'], queryFn: async () => (await api.get('/menu/categories')).data });
  const { data: tables } = useQuery({ queryKey: ['/tables'], queryFn: async () => (await api.get('/tables')).data });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [tableId, setTableId] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addToCart(item: any) {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) return prev.map((l) => l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  }

  const subtotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);

  const createOrder = useMutation({
    mutationFn: async () => (await api.post('/orders', {
      tableId: tableId || undefined, type: tableId ? 'DINE_IN' : 'TAKEAWAY',
      items: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
    })).data,
    onSuccess: (order) => { setOrderId(order.id); setError(null); queryClient.invalidateQueries({ queryKey: ['/tables'] }); },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Failed to create order'),
  });

  const [lastBilledOrderId, setLastBilledOrderId] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState(false);
  const [splitLines, setSplitLines] = useState<{ method: 'CASH' | 'CARD' | 'UPI'; amount: string }[]>([{ method: 'CASH', amount: '' }]);

  const payOrder = useMutation({
    mutationFn: async (payments: { method: 'CASH' | 'CARD' | 'UPI'; amount: number }[]) =>
      (await api.post(`/orders/${orderId}/pay`, { payments })).data,
    onSuccess: () => {
      setLastBilledOrderId(orderId); setCart([]); setOrderId(null); setTableId('');
      setSplitMode(false); setSplitLines([{ method: 'CASH', amount: '' }]);
      queryClient.invalidateQueries({ queryKey: ['/tables'] });
    },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Payment failed'),
  });

  function payFullAmount(method: 'CASH' | 'CARD' | 'UPI') {
    payOrder.mutate([{ method, amount: Math.round(subtotal) }]);
  }

  const splitTotal = splitLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const splitRemaining = Math.round(subtotal) - splitTotal;

  return (
    <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 20 }}>
      {lastBilledOrderId && (
        <div className="card" style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Order billed successfully.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to={`/invoice/${lastBilledOrderId}`} target="_blank"><button>View / Print Invoice</button></Link>
            <button className="secondary" onClick={() => setLastBilledOrderId(null)}>Dismiss</button>
          </div>
        </div>
      )}
      <div>
        <h2>POS</h2>
        {(categories ?? []).map((cat: any) => (
          <div key={cat.id} style={{ marginBottom: 16 }}>
            <h4>{cat.name}</h4>
            <div className="grid grid-4">
              {cat.items.filter((i: any) => i.isAvailable).map((item: any) => (
                <button key={item.id} className="secondary" style={{ padding: 12, textAlign: 'left' }} onClick={() => addToCart(item)} disabled={!!orderId}>
                  <div>{item.name}</div>
                  <div style={{ color: 'var(--muted)' }}>₹{item.price}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ height: 'fit-content', position: 'sticky', top: 20 }}>
        <h3 style={{ marginTop: 0 }}>Current Order</h3>
        {!orderId && (
          <div className="form-row">
            <label>Table (optional — leave blank for takeaway)</label>
            <select value={tableId} onChange={(e) => setTableId(e.target.value)}>
              <option value="">Takeaway</option>
              {(tables ?? []).filter((t: any) => t.state === 'FREE').map((t: any) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        )}

        {cart.map((l) => (
          <div key={l.menuItemId} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span>{l.quantity}x {l.name}</span>
            <span>₹{l.price * l.quantity}</span>
          </div>
        ))}
        <hr style={{ borderColor: 'var(--border)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>Total</span><span>₹{subtotal}</span>
        </div>

        {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}

        {!orderId ? (
          <button style={{ width: '100%', marginTop: 12 }} disabled={cart.length === 0 || createOrder.isPending} onClick={() => createOrder.mutate()}>
            Send to Kitchen
          </button>
        ) : !splitMode ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={() => payFullAmount('CASH')} disabled={payOrder.isPending}>Cash</button>
              <button onClick={() => payFullAmount('UPI')} disabled={payOrder.isPending}>UPI</button>
              <button onClick={() => payFullAmount('CARD')} disabled={payOrder.isPending}>Card</button>
            </div>
            <button className="secondary" style={{ width: '100%' }} onClick={() => setSplitMode(true)}>Split bill</button>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {splitLines.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <select
                  value={line.method}
                  onChange={(e) => setSplitLines(splitLines.map((l, j) => (j === i ? { ...l, method: e.target.value as any } : l)))}
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="CARD">Card</option>
                </select>
                <input
                  type="number" placeholder="Amount" value={line.amount} style={{ flex: 1 }}
                  onChange={(e) => setSplitLines(splitLines.map((l, j) => (j === i ? { ...l, amount: e.target.value } : l)))}
                />
                {splitLines.length > 1 && (
                  <button className="secondary" onClick={() => setSplitLines(splitLines.filter((_, j) => j !== i))}>✕</button>
                )}
              </div>
            ))}
            <button className="secondary" style={{ width: '100%', marginBottom: 8 }} onClick={() => setSplitLines([...splitLines, { method: 'CASH', amount: '' }])}>
              + Add payment method
            </button>
            <div style={{ fontSize: 13, color: splitRemaining === 0 ? 'var(--success, #16a34a)' : 'var(--muted)', marginBottom: 8 }}>
              {splitRemaining > 0 ? `₹${splitRemaining} remaining` : splitRemaining < 0 ? `₹${-splitRemaining} over` : 'Fully covered'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{ flex: 1 }}
                disabled={splitRemaining !== 0 || payOrder.isPending}
                onClick={() => payOrder.mutate(splitLines.filter((l) => Number(l.amount) > 0).map((l) => ({ method: l.method, amount: Number(l.amount) })))}
              >
                Confirm split payment
              </button>
              <button className="secondary" onClick={() => { setSplitMode(false); setSplitLines([{ method: 'CASH', amount: '' }]); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
