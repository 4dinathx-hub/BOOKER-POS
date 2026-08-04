import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

function downloadSvgAsPng(svgId: string, filename: string) {
  const svg = document.getElementById(svgId);
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
    a.download = filename;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
}

function QrCard({ id, title, value, filename, note }: { id: string; title: string; value: string; filename: string; note?: string }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <h4 style={{ marginTop: 0 }}>{title}</h4>
      <div style={{ background: 'white', padding: 12, display: 'inline-block' }}>
        <QRCodeSVG id={id} value={value} size={200} />
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all', margin: '8px 0' }}>{value}</p>
      {note && <p style={{ fontSize: 12, color: 'var(--muted)' }}>{note}</p>}
      <button onClick={() => downloadSvgAsPng(id, filename)}>Download PNG</button>
    </div>
  );
}

export default function QrCodes() {
  const { user } = useAuth();
  const { data: restaurant } = useQuery({ queryKey: ['/restaurant/settings'], queryFn: async () => (await api.get('/restaurant/settings')).data });

  const [customLabel, setCustomLabel] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [savedCustom, setSavedCustom] = useState<{ label: string; url: string } | null>(null);

  const [upiAmount, setUpiAmount] = useState('');

  const menuUrl = user?.restaurantId ? `${window.location.origin}/menu/${user.restaurantId}` : '';
  const upiVpa = restaurant?.upiVpa;
  const upiUrl = upiVpa
    ? `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(restaurant?.name ?? '')}&cu=INR${upiAmount ? `&am=${encodeURIComponent(upiAmount)}` : ''}`
    : '';

  return (
    <div>
      <h2>QR Code Maker</h2>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: -8 }}>
        Generate and download QR codes for anything guests need to scan. Per-table ordering QRs
        live on the <Link to="/tables">Tables</Link> page since each one is tied to a specific table.
      </p>

      <div className="grid grid-3" style={{ gap: 16 }}>
        {menuUrl && (
          <QrCard id="qr-menu" title="Digital Menu (view-only)" value={menuUrl} filename="digital-menu-qr.png" note="No ordering — good for flyers, Instagram bio, entrance signage." />
        )}

        <div className="card" style={{ textAlign: 'center' }}>
          <h4 style={{ marginTop: 0 }}>Scan to Pay (UPI)</h4>
          {!upiVpa ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              Add a UPI ID in <Link to="/settings">Settings</Link> to generate this.
            </p>
          ) : (
            <>
              <div style={{ marginBottom: 8 }}>
                <input placeholder="Amount (optional)" type="number" value={upiAmount} onChange={(e) => setUpiAmount(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div style={{ background: 'white', padding: 12, display: 'inline-block' }}>
                <QRCodeSVG id="qr-upi" value={upiUrl} size={200} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: '8px 0' }}>{upiVpa}{upiAmount ? ` · ₹${upiAmount}` : ' · any amount'}</p>
              <button onClick={() => downloadSvgAsPng('qr-upi', 'upi-scan-to-pay-qr.png')}>Download PNG</button>
            </>
          )}
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <h4 style={{ marginTop: 0 }}>Custom link</h4>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -6 }}>Google reviews, Instagram, WhatsApp — anything.</p>
          {!savedCustom ? (
            <form onSubmit={(e) => { e.preventDefault(); if (customUrl) setSavedCustom({ label: customLabel || 'Custom QR', url: customUrl }); }}>
              <div className="form-row"><input placeholder="Label (e.g. Google Review)" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} /></div>
              <div className="form-row"><input placeholder="https://…" value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} required /></div>
              <button type="submit">Generate</button>
            </form>
          ) : (
            <>
              <div style={{ background: 'white', padding: 12, display: 'inline-block' }}>
                <QRCodeSVG id="qr-custom" value={savedCustom.url} size={200} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all', margin: '8px 0' }}>{savedCustom.url}</p>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                <button onClick={() => downloadSvgAsPng('qr-custom', `${savedCustom.label.toLowerCase().replace(/\s+/g, '-')}-qr.png`)}>Download PNG</button>
                <button className="secondary" onClick={() => setSavedCustom(null)}>New link</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
