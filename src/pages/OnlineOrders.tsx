import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const CHANNELS = ['SWIGGY', 'ZOMATO', 'ONDC'] as const;

function AggregatorConfigPanel() {
  const queryClient = useQueryClient();
  const { data: configs } = useQuery({ queryKey: ['/online-orders/config'], queryFn: async () => (await api.get('/online-orders/config')).data });
  const [editing, setEditing] = useState<string | null>(null);
  const [merchantId, setMerchantId] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [error, setError] = useState<string | null>(null);

  const configByChannel = new Map((configs ?? []).map((c: any) => [c.channel, c]));

  const save = useMutation({
    mutationFn: async (channel: string) => (await api.put('/online-orders/config', { channel, merchantId, webhookSecret })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/online-orders/config'] });
      setEditing(null); setMerchantId(''); setWebhookSecret(''); setError(null);
    },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Failed to save'),
  });

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Aggregator connections</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -8 }}>
        Merchant ID + webhook secret come from each platform's partner dashboard when you onboard.
        ONDC's real signing scheme (Beckn/Ed25519) isn't implemented yet — see the code comment in
        <code> webhookSignatures.ts</code>; Swiggy/Zomato use HMAC signature verification and are live.
      </p>
      <table>
        <thead><tr><th>Platform</th><th>Merchant ID</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {CHANNELS.map((ch) => {
            const cfg: any = configByChannel.get(ch);
            return (
              <tr key={ch}>
                <td>{ch}</td>
                <td>{cfg?.merchantId ?? '—'}</td>
                <td>{cfg ? (cfg.isEnabled ? 'Enabled' : 'Disabled') : 'Not connected'}</td>
                <td>
                  {editing === ch ? (
                    <form
                      style={{ display: 'flex', gap: 6 }}
                      onSubmit={(e) => { e.preventDefault(); save.mutate(ch); }}
                    >
                      <input placeholder="Merchant ID" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} required />
                      <input placeholder="Webhook secret" type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} required />
                      <button type="submit" disabled={save.isPending}>Save</button>
                      <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
                    </form>
                  ) : (
                    <button className="secondary" onClick={() => { setEditing(ch); setMerchantId(cfg?.merchantId ?? ''); setWebhookSecret(''); }}>
                      {cfg ? 'Update' : 'Connect'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function ItemMappingPanel() {
  const queryClient = useQueryClient();
  const { data: mappings } = useQuery({ queryKey: ['/online-orders/item-mappings'], queryFn: async () => (await api.get('/online-orders/item-mappings')).data });
  const { data: categories } = useQuery({ queryKey: ['/menu/categories'], queryFn: async () => (await api.get('/menu/categories')).data });
  const [channel, setChannel] = useState<string>('SWIGGY');
  const [menuItemId, setMenuItemId] = useState('');
  const [externalItemId, setExternalItemId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const menuItems: any[] = (categories ?? []).flatMap((c: any) => c.items ?? []);

  const add = useMutation({
    mutationFn: async () => (await api.post('/online-orders/item-mappings', { channel, menuItemId, externalItemId })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/online-orders/item-mappings'] });
      setExternalItemId(''); setError(null);
    },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Failed to save'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/online-orders/item-mappings/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/online-orders/item-mappings'] }),
  });

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Menu item mapping</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -8 }}>
        An incoming order references items by the platform's own ID — map each one to your menu item once, here.
      </p>
      <form
        style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}
        onSubmit={(e) => { e.preventDefault(); if (!menuItemId || !externalItemId) return setError('Pick a menu item and enter its platform ID'); add.mutate(); }}
      >
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)} required>
          <option value="">Select menu item…</option>
          {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input placeholder="Platform's item ID" value={externalItemId} onChange={(e) => setExternalItemId(e.target.value)} required />
        <button type="submit" disabled={add.isPending}>Add mapping</button>
      </form>
      {error && <div className="error-text" style={{ marginBottom: 8 }}>{error}</div>}

      <table>
        <thead><tr><th>Platform</th><th>Menu item</th><th>External ID</th><th></th></tr></thead>
        <tbody>
          {(mappings ?? []).map((m: any) => (
            <tr key={m.id}>
              <td>{m.channel}</td>
              <td>{m.menuItem?.name}</td>
              <td>{m.externalItemId}</td>
              <td><button className="secondary" onClick={() => remove.mutate(m.id)}>Remove</button></td>
            </tr>
          ))}
          {(mappings ?? []).length === 0 && <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>No mappings yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function OnlineOrders() {
  const { data: orders, isLoading } = useQuery({ queryKey: ['/online-orders'], queryFn: async () => (await api.get('/online-orders')).data });

  return (
    <div>
      <h2>Online Orders</h2>

      <AggregatorConfigPanel />
      <div style={{ marginBottom: 16 }}><ItemMappingPanel /></div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Recent orders</h3>
        {isLoading ? <p>Loading…</p> : (
          <table>
            <thead><tr><th>Channel</th><th>External Ref</th><th>Status</th><th>Total</th><th>Rider</th></tr></thead>
            <tbody>
              {(orders ?? []).map((o: any) => (
                <tr key={o.id}>
                  <td><span className="badge">{o.channel}</span></td>
                  <td>{o.externalOrderRef ?? '—'}</td>
                  <td>{o.status}</td>
                  <td>₹{o.total}</td>
                  <td>{o.riderName ?? '—'}</td>
                </tr>
              ))}
              {(orders ?? []).length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No online orders yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
