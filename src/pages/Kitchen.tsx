import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const NEXT_STATUS: Record<string, string> = { NEW: 'PREPARING', PREPARING: 'READY', READY: 'SERVED' };

export default function Kitchen() {
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useQuery({
    queryKey: ['/orders', 'kitchen'],
    queryFn: async () => (await api.get('/orders')).data,
    refetchInterval: 8000,
  });

  const advance = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => (await api.patch(`/orders/${id}/status`, { status })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/orders', 'kitchen'] }),
  });

  if (isLoading) return <p>Loading…</p>;

  const active = (orders ?? []).filter((o: any) => ['NEW', 'PREPARING', 'READY'].includes(o.status));

  return (
    <div>
      <h2>Kitchen Display</h2>
      <div className="grid grid-4">
        {active.map((order: any) => (
          <div key={order.id} className="card">
            <div className="topbar">
              <strong>{order.table?.label ?? 'Takeaway'}</strong>
              <span className="badge">{order.status}</span>
            </div>
            <ul style={{ paddingLeft: 18 }}>
              {order.items.map((it: any) => (
                <li key={it.id}>{it.quantity}x {it.menuItem.name}{it.notes ? ` — ${it.notes}` : ''}</li>
              ))}
            </ul>
            {NEXT_STATUS[order.status] && (
              <button style={{ width: '100%' }} onClick={() => advance.mutate({ id: order.id, status: NEXT_STATUS[order.status] })}>
                Mark {NEXT_STATUS[order.status]}
              </button>
            )}
          </div>
        ))}
        {active.length === 0 && <p style={{ color: 'var(--muted)' }}>No active orders.</p>}
      </div>
    </div>
  );
}
