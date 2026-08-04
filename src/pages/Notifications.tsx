import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export default function Notifications() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['/notifications'], queryFn: async () => (await api.get('/notifications')).data });

  const markRead = useMutation({
    mutationFn: async (id: string) => (await api.post(`/notifications/${id}/read`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => (await api.post('/notifications/read-all')).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/notifications'] }),
  });

  if (isLoading) return <p>Loading…</p>;

  return (
    <div>
      <div className="topbar">
        <h2>Notifications</h2>
        <button className="secondary" onClick={() => markAllRead.mutate()}>Mark all read</button>
      </div>
      <div className="card">
        {(data ?? []).length === 0 ? <p style={{ color: 'var(--muted)' }}>No notifications.</p> : (
          <div>
            {data.map((n: any) => (
              <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', opacity: n.isRead ? 0.5 : 1 }}>
                <div>
                  <strong>{n.title}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>{n.body}</div>
                </div>
                {!n.isRead && <button className="secondary" onClick={() => markRead.mutate(n.id)}>Mark read</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
