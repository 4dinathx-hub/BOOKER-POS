import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['/dashboard/summary'],
    queryFn: async () => (await api.get('/dashboard/summary')).data,
  });

  if (isLoading) return <p>Loading…</p>;

  const cards = [
    { label: "Today's Sales", value: `₹${(data?.todaySales ?? 0).toLocaleString()}` },
    { label: 'Orders Today', value: data?.todayOrderCount ?? 0 },
    { label: 'Occupied Tables', value: `${data?.activeTables ?? 0} / ${data?.totalTables ?? 0}` },
    { label: 'Low Stock Items', value: data?.lowStockCount ?? 0 },
    { label: 'Open Service Requests', value: data?.openServiceRequests ?? 0 },
    { label: 'Pending Attendance', value: data?.pendingAttendance ?? 0 },
  ];

  return (
    <div>
      <h2>Dashboard</h2>
      <div className="grid grid-3">
        {cards.map((c) => (
          <div className="card" key={c.label}>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>{c.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
