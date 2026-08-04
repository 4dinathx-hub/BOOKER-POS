import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

function TableQrModal({ table, restaurantId, onClose }: { table: any; restaurantId: string; onClose: () => void }) {
  const url = `${window.location.origin}/order/${restaurantId}/${table.id}`;

  function downloadPng() {
    const svg = document.getElementById(`qr-${table.id}`);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(img, 16, 16, 480, 480);
      const a = document.createElement('a');
      a.download = `table-${table.label}-qr.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div className="card" style={{ textAlign: 'center', width: 320 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Table {table.label}</h3>
        <div style={{ background: 'white', padding: 12, display: 'inline-block' }}>
          <QRCodeSVG id={`qr-${table.id}`} value={url} size={220} />
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all', margin: '8px 0' }}>{url}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={downloadPng}>Download PNG</button>
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function Tables() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: tables, isLoading } = useQuery({
    queryKey: ['/tables'],
    queryFn: async () => (await api.get('/tables')).data,
    refetchInterval: 15000,
  });
  const { data: serviceRequests } = useQuery({
    queryKey: ['/tables/service-requests'],
    queryFn: async () => (await api.get('/tables/service-requests')).data,
    refetchInterval: 10000,
  });

  const [label, setLabel] = useState('');
  const [seats, setSeats] = useState(4);
  const [qrTable, setQrTable] = useState<any | null>(null);

  const addTable = useMutation({
    mutationFn: async () => (await api.post('/tables', { label, seats })).data,
    onSuccess: () => { setLabel(''); queryClient.invalidateQueries({ queryKey: ['/tables'] }); },
  });

  const resolveRequest = useMutation({
    mutationFn: async (id: string) => (await api.post(`/tables/service-requests/${id}/resolve`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/tables/service-requests'] }),
  });

  const [mergingTableId, setMergingTableId] = useState<string | null>(null);
  const mergeTable = useMutation({
    mutationFn: async ({ id, intoTableId }: { id: string; intoTableId: string }) => (await api.post(`/tables/${id}/merge`, { intoTableId })).data,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/tables'] }); setMergingTableId(null); },
  });
  const unmergeTable = useMutation({
    mutationFn: async (id: string) => (await api.post(`/tables/${id}/unmerge`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/tables'] }),
  });

  if (isLoading) return <p>Loading…</p>;

  return (
    <div>
      <div className="topbar">
        <h2>Tables</h2>
        <form onSubmit={(e) => { e.preventDefault(); addTable.mutate(); }} style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Label (e.g. T5)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input type="number" value={seats} onChange={(e) => setSeats(Number(e.target.value))} style={{ width: 80 }} />
          <button type="submit" disabled={!label}>+ Table</button>
        </form>
      </div>

      {(serviceRequests ?? []).length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--danger)' }}>
          <strong>Open service requests</strong>
          {serviceRequests.map((r: any) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span>{r.table.label} — {r.type === 'CALL_WAITER' ? 'Call waiter' : 'Request bill'}</span>
              <button className="secondary" onClick={() => resolveRequest.mutate(r.id)}>Resolve</button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-4">
        {(tables ?? []).map((t: any) => (
          <div key={t.id} className="card" style={{ textAlign: 'center', opacity: t.mergedIntoTableId ? 0.7 : 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{t.label}</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>{t.seats} seats</div>
            <span className={`badge ${t.state === 'FREE' ? 'success' : t.state === 'OCCUPIED' ? 'danger' : ''}`} style={{ marginTop: 8, display: 'inline-block' }}>
              {t.state}
            </span>

            {t.mergedIntoTableId ? (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                Merged into {t.mergedIntoTable?.label}
                <div><button className="secondary" onClick={() => unmergeTable.mutate(t.id)}>Unmerge</button></div>
              </div>
            ) : (
              <>
                {t.mergedTables?.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
                    + {t.mergedTables.map((m: any) => m.label).join(', ')}
                  </div>
                )}
                <div style={{ marginTop: 8, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="secondary" onClick={() => setQrTable(t)}>QR code</button>
                  <button className="secondary" onClick={() => setMergingTableId(mergingTableId === t.id ? null : t.id)}>Merge</button>
                </div>
                {mergingTableId === t.id && (
                  <div style={{ marginTop: 8 }}>
                    <select
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) mergeTable.mutate({ id: t.id, intoTableId: e.target.value }); }}
                    >
                      <option value="" disabled>Merge into…</option>
                      {(tables ?? [])
                        .filter((o: any) => o.id !== t.id && !o.mergedIntoTableId)
                        .map((o: any) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {qrTable && user?.restaurantId && (
        <TableQrModal table={qrTable} restaurantId={user.restaurantId} onClose={() => setQrTable(null)} />
      )}
    </div>
  );
}
