import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { downloadCsv } from '../lib/csvExport';

const CATEGORIES = ['RENT', 'UTILITIES', 'SALARIES', 'MAINTENANCE', 'MARKETING', 'SUPPLIES', 'LICENSING', 'TRANSPORT', 'MISC'];

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Finance() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState('MISC');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [spentOn, setSpentOn] = useState(today());
  const [error, setError] = useState<string | null>(null);

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['/finance/summary', from, to],
    queryFn: async () => (await api.get('/finance/summary', { params: { from, to } })).data,
  });

  const { data: expenses, isLoading: loadingExpenses } = useQuery({
    queryKey: ['/finance/expenses', from, to],
    queryFn: async () => (await api.get('/finance/expenses', { params: { from, to } })).data,
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post('/finance/expenses', { category, description: description || undefined, amount: Number(amount), spentOn })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/finance/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/finance/expenses'] });
      setShowForm(false); setDescription(''); setAmount(''); setError(null);
    },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Failed to save'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/finance/expenses/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/finance/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/finance/expenses'] });
    },
  });

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const rows: any[] = Array.isArray(expenses) ? expenses : [];

  return (
    <div>
      <div className="topbar">
        <h2>Finance & Expenses</h2>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ Add expense'}</button>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'end' }}>
        <div className="form-row" style={{ margin: 0 }}><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="form-row" style={{ margin: 0 }}><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!amount || Number(amount) <= 0) return setError('Enter a valid amount');
              create.mutate();
            }}
          >
            <div className="grid grid-2">
              <div className="form-row">
                <label>Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-row"><label>Amount (₹)</label><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="form-row"><label>Date</label><input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} /></div>
              <div className="form-row"><label>Description (optional)</label><input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            </div>
            {error && <div className="error-text">{error}</div>}
            <button type="submit" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save expense'}</button>
          </form>
        </div>
      )}

      {loadingSummary ? <p>Loading…</p> : (
        <div className="grid grid-3" style={{ marginBottom: 16 }}>
          <div className="card">
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Revenue (billed orders)</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{fmt(summary?.revenue ?? 0)}</div>
          </div>
          <div className="card">
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Total expenses</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{fmt(summary?.total ?? 0)}</div>
          </div>
          <div className="card">
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Net (rough estimate)</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: (summary?.net ?? 0) >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>
              {fmt(summary?.net ?? 0)}
            </div>
          </div>
        </div>
      )}

      {summary?.byCategory && Object.keys(summary.byCategory).length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>By category</h3>
          <table>
            <thead><tr><th>Category</th><th>Amount</th></tr></thead>
            <tbody>
              {Object.entries(summary.byCategory).map(([cat, amt]) => (
                <tr key={cat}><td>{cat}</td><td>{fmt(amt as number)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Expenses</h3>
        {rows.length > 0 && (
          <button
            className="secondary"
            style={{ marginBottom: 8 }}
            onClick={() => downloadCsv(`expenses-${from}-to-${to}.csv`, rows.map((r) => ({ date: r.spentOn, category: r.category, description: r.description ?? '', amount: r.amount })))}
          >
            Export CSV
          </button>
        )}
        {loadingExpenses ? <p>Loading…</p> : rows.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No expenses recorded in this range.</p>
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.spentOn).toLocaleDateString()}</td>
                  <td>{r.category}</td>
                  <td>{r.description ?? '—'}</td>
                  <td>{fmt(Number(r.amount))}</td>
                  <td><button className="secondary" onClick={() => { if (confirm('Delete this expense?')) remove.mutate(r.id); }}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
