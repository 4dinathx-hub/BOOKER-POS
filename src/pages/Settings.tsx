import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export default function Settings() {
  const queryClient = useQueryClient();
  const { data: branch, isLoading } = useQuery({ queryKey: ['/restaurant/settings'], queryFn: async () => (await api.get('/restaurant/settings')).data });
  const { data: posConfig } = useQuery({ queryKey: ['/restaurant/pos-config'], queryFn: async () => (await api.get('/restaurant/pos-config')).data });

  const [form, setForm] = useState<any>({});
  const [posForm, setPosForm] = useState<any>({});

  useEffect(() => { if (branch) setForm(branch); }, [branch]);
  useEffect(() => { if (posConfig) setPosForm(posConfig); }, [posConfig]);

  const saveSettings = useMutation({
    mutationFn: async () => (await api.patch('/restaurant/settings', {
      gstRate: Number(form.gstRate),
      gstin: form.gstin || undefined,
      upiVpa: form.upiVpa || undefined,
    })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/restaurant/settings'] }),
  });

  const savePos = useMutation({
    mutationFn: async () => (await api.patch('/restaurant/pos-config', posForm)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/restaurant/pos-config'] }),
  });

  if (isLoading) return <p>Loading…</p>;

  return (
    <div>
      <h2>Settings</h2>
      <div className="card" style={{ marginBottom: 16, maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>Branch tax (fallback when an item has no Tax Class)</h3>
        <div className="form-row">
          <label>Flat GST rate (%)</label>
          <input type="number" value={form.gstRate ?? ''} onChange={(e) => setForm({ ...form, gstRate: e.target.value })} />
        </div>
        <div className="form-row">
          <label>GSTIN (for tax invoices)</label>
          <input value={form.gstin ?? ''} onChange={(e) => setForm({ ...form, gstin: e.target.value })} placeholder="e.g. 27ABCDE1234F1Z5" />
        </div>
        <div className="form-row">
          <label>UPI ID (for Scan-to-Pay QR)</label>
          <input value={form.upiVpa ?? ''} onChange={(e) => setForm({ ...form, upiVpa: e.target.value })} placeholder="e.g. restaurant@okhdfcbank" />
        </div>
        <button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>Save</button>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>POS configuration</h3>
        <div className="form-row">
          <label>Rounding mode</label>
          <select value={posForm.roundingMode ?? 'NEAREST'} onChange={(e) => setPosForm({ ...posForm, roundingMode: e.target.value })}>
            <option value="NEAREST">Nearest</option><option value="UP">Round up</option><option value="DOWN">Round down</option><option value="NONE">None</option>
          </select>
        </div>
        <div className="form-row">
          <label><input type="checkbox" checked={posForm.allowSplitBill ?? true} onChange={(e) => setPosForm({ ...posForm, allowSplitBill: e.target.checked })} /> Allow split bill</label>
        </div>
        <div className="form-row">
          <label><input type="checkbox" checked={posForm.tipEnabled ?? false} onChange={(e) => setPosForm({ ...posForm, tipEnabled: e.target.checked })} /> Enable tipping</label>
        </div>
        <button onClick={() => savePos.mutate()} disabled={savePos.isPending}>Save POS config</button>
      </div>
    </div>
  );
}
