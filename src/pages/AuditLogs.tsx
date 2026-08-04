import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export default function AuditLogs() {
  const { data, isLoading } = useQuery({ queryKey: ['/audit-logs'], queryFn: async () => (await api.get('/audit-logs')).data });

  if (isLoading) return <p>Loading…</p>;

  return (
    <div>
      <h2>Audit Logs</h2>
      <div className="card">
        <table>
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead>
          <tbody>
            {(data?.logs ?? []).map((log: any) => (
              <tr key={log.id}>
                <td>{new Date(log.createdAt).toLocaleString()}</td>
                <td>{log.actorName ?? log.actorType} <span className="badge">{log.actorType}</span></td>
                <td>{log.action}</td>
                <td>{log.entityType}</td>
              </tr>
            ))}
            {(data?.logs ?? []).length === 0 && <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>No audit entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
