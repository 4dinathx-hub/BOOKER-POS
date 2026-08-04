import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { downloadCsv } from '../lib/csvExport';

export default function Reports() {
  const { data: summary, isLoading } = useQuery({ queryKey: ['/reports/sales-summary'], queryFn: async () => (await api.get('/reports/sales-summary')).data });
  const { data: items } = useQuery({ queryKey: ['/reports/item-performance'], queryFn: async () => (await api.get('/reports/item-performance')).data });

  if (isLoading) return <p>Loading…</p>;

  return (
    <div>
      <div className="topbar">
        <h2>Reports</h2>
        <button
          className="secondary"
          onClick={() => downloadCsv(`sales-summary-${new Date().toISOString().slice(0, 10)}.csv`, [
            { metric: 'Gross Sales', value: summary?.grossSales ?? 0 },
            { metric: 'Net Sales', value: summary?.netSales ?? 0 },
            { metric: 'Discounts Given', value: Math.round(summary?.totalDiscount ?? 0) },
            { metric: 'Orders', value: summary?.orderCount ?? 0 },
          ])}
        >
          Export summary CSV
        </button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>Last 30 days by default.</p>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="card"><div style={{ color: 'var(--muted)', fontSize: 13 }}>Gross Sales</div><div style={{ fontSize: 24, fontWeight: 700 }}>₹{summary?.grossSales ?? 0}</div></div>
        <div className="card"><div style={{ color: 'var(--muted)', fontSize: 13 }}>Net Sales</div><div style={{ fontSize: 24, fontWeight: 700 }}>₹{summary?.netSales ?? 0}</div></div>
        <div className="card"><div style={{ color: 'var(--muted)', fontSize: 13 }}>Discounts Given</div><div style={{ fontSize: 24, fontWeight: 700 }}>₹{Math.round(summary?.totalDiscount ?? 0)}</div></div>
        <div className="card"><div style={{ color: 'var(--muted)', fontSize: 13 }}>Orders</div><div style={{ fontSize: 24, fontWeight: 700 }}>{summary?.orderCount ?? 0}</div></div>
      </div>

      <div className="card">
        <div className="topbar" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Top items by revenue</h3>
          <button className="secondary" onClick={() => downloadCsv('item-performance.csv', (items ?? []).map((i: any) => ({ item: i.name, units_sold: i.unitsSold, revenue: i.revenue })))}>
            Export CSV
          </button>
        </div>
        <table>
          <thead><tr><th>Item</th><th>Units sold</th><th>Revenue</th></tr></thead>
          <tbody>
            {(items ?? []).slice(0, 20).map((i: any) => (
              <tr key={i.menuItemId}><td>{i.name}</td><td>{i.unitsSold}</td><td>₹{i.revenue}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
