import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const SEGMENTS = [
  { value: 'ALL', label: 'All customers' },
  { value: 'INACTIVE_30D', label: "Haven't visited in 30+ days" },
  { value: 'TOP_SPENDERS', label: 'Top 100 spenders' },
];

export default function Campaigns() {
  const queryClient = useQueryClient();
  const [segment, setSegment] = useState('ALL');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [result, setResult] = useState<any>(null);

  const { data: preview } = useQuery({
    queryKey: ['/campaigns/segments', segment, 'count'],
    queryFn: async () => (await api.get(`/campaigns/segments/${segment}/count`)).data,
  });

  const { data: history } = useQuery({
    queryKey: ['/campaigns'],
    queryFn: async () => (await api.get('/campaigns')).data,
  });

  const send = useMutation({
    mutationFn: async () => (await api.post('/campaigns/send', { segment, subject, body })).data,
    onSuccess: (data) => {
      setResult(data);
      setSubject(''); setBody('');
      queryClient.invalidateQueries({ queryKey: ['/campaigns'] });
    },
  });

  return (
    <div>
      <h2>Marketing Campaigns</h2>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: -8 }}>
        Email only for now — customers are stored with a phone number by default, so an email blast only
        reaches whoever also has an email on file. SMS/WhatsApp would need a separate provider (Twilio,
        Gupshup, etc.) that isn't wired up yet.
      </p>

      <div className="card" style={{ marginBottom: 16, maxWidth: 560 }}>
        <div className="form-row">
          <label>Audience</label>
          <select value={segment} onChange={(e) => setSegment(e.target.value)}>
            {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        {preview && (
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            {preview.audienceSize} customers match · {preview.withEmail} have an email on file
            {preview.audienceSize > preview.withEmail && ` (${preview.audienceSize - preview.withEmail} will be skipped)`}
          </div>
        )}

        <div className="form-row">
          <label>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. We miss you — 20% off this week" />
        </div>
        <div className="form-row">
          <label>Message</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} style={{ width: '100%', minHeight: 100 }} placeholder="Plain text or simple HTML" />
        </div>

        <button
          onClick={() => { if (confirm(`Send this to ${preview?.withEmail ?? '...'} customers?`)) send.mutate(); }}
          disabled={!subject || !body || send.isPending}
        >
          {send.isPending ? 'Sending…' : 'Send campaign'}
        </button>

        {result && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            Sent to {result.sentCount} of {result.audienceSize} ({result.skippedNoEmail} had no email on file).
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>History</h3>
        {(history ?? []).length === 0 ? <p style={{ color: 'var(--muted)' }}>No campaigns sent yet.</p> : (
          <table>
            <thead><tr><th>Date</th><th>Segment</th><th>Subject</th><th>Sent / Audience</th></tr></thead>
            <tbody>
              {history.map((c: any) => (
                <tr key={c.id}>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td>{SEGMENTS.find((s) => s.value === c.segment)?.label ?? c.segment}</td>
                  <td>{c.subject}</td>
                  <td>{c.sentCount} / {c.audienceSize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
