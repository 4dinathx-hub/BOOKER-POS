import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

const STARS = [5, 4, 3, 2, 1];

export default function Feedback() {
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['/feedback/summary'],
    queryFn: async () => (await api.get('/feedback/summary')).data,
  });

  const { data: feedback, isLoading: loadingList } = useQuery({
    queryKey: ['/feedback', ratingFilter],
    queryFn: async () => (await api.get('/feedback', { params: ratingFilter ? { rating: ratingFilter } : {} })).data,
  });

  const rows: any[] = Array.isArray(feedback) ? feedback : [];
  const maxCount = summary ? Math.max(1, ...STARS.map((s) => summary.distribution?.[s] ?? 0)) : 1;

  return (
    <div>
      <h2>Customer Feedback</h2>

      {loadingSummary ? <p>Loading…</p> : (
        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Average rating</div>
            <div style={{ fontSize: 36, fontWeight: 700, marginTop: 4 }}>
              {(summary?.average ?? 0).toFixed(1)} <span style={{ fontSize: 18, color: 'var(--muted)' }}>/ 5</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{summary?.count ?? 0} reviews</div>
          </div>

          <div className="card">
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>Distribution</div>
            {STARS.map((star) => {
              const n = summary?.distribution?.[star] ?? 0;
              return (
                <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 36, fontSize: 13 }}>{star}★</span>
                  <div style={{ flex: 1, background: 'var(--border, #eee)', borderRadius: 4, height: 10, overflow: 'hidden' }}>
                    <div style={{ width: `${(n / maxCount) * 100}%`, background: 'var(--accent, #111)', height: '100%' }} />
                  </div>
                  <span style={{ width: 24, fontSize: 13, textAlign: 'right' }}>{n}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <div className="topbar" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Reviews</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={ratingFilter === null ? '' : 'secondary'} onClick={() => setRatingFilter(null)}>All</button>
            {STARS.map((s) => (
              <button key={s} className={ratingFilter === s ? '' : 'secondary'} onClick={() => setRatingFilter(s)}>{s}★</button>
            ))}
          </div>
        </div>

        {loadingList ? <p>Loading…</p> : rows.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No feedback yet — reviews submitted after QR orders will show up here.</p>
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Customer</th><th>Rating</th><th>Comment</th></tr></thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td>{new Date(f.createdAt).toLocaleDateString()}</td>
                  <td>{f.customer?.name ?? 'Anonymous'}</td>
                  <td>{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</td>
                  <td>{f.comment ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
