import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export default function Modifiers() {
  const queryClient = useQueryClient();
  const { data: groups, isLoading } = useQuery({
    queryKey: ['/modifiers'],
    queryFn: async () => (await api.get('/modifiers')).data,
  });

  const [name, setName] = useState('');
  const [maxSelect, setMaxSelect] = useState(1);
  const [options, setOptions] = useState<{ name: string; priceDelta: number }[]>([{ name: '', priceDelta: 0 }]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['/modifiers'] });

  const createGroup = useMutation({
    mutationFn: async () => (await api.post('/modifiers', { name, maxSelect, modifiers: options.filter((o) => o.name) })).data,
    onSuccess: () => { setName(''); setOptions([{ name: '', priceDelta: 0 }]); invalidate(); },
  });

  if (isLoading) return <p>Loading…</p>;

  return (
    <div>
      <h2>Modifiers & Add-ons</h2>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>New modifier group</h3>
        <div className="grid grid-2">
          <div className="form-row"><label>Group name (e.g. "Spice level")</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="form-row"><label>Max selectable (1 = single choice)</label><input type="number" value={maxSelect} onChange={(e) => setMaxSelect(Number(e.target.value))} /></div>
        </div>
        {options.map((opt, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input placeholder="Option name" value={opt.name} onChange={(e) => { const next = [...options]; next[i].name = e.target.value; setOptions(next); }} />
            <input type="number" placeholder="Price add-on (₹)" value={opt.priceDelta} onChange={(e) => { const next = [...options]; next[i].priceDelta = Number(e.target.value); setOptions(next); }} style={{ width: 140 }} />
          </div>
        ))}
        <button className="secondary" type="button" onClick={() => setOptions([...options, { name: '', priceDelta: 0 }])}>+ Option</button>
        <div style={{ marginTop: 12 }}>
          <button onClick={() => createGroup.mutate()} disabled={!name || createGroup.isPending}>Save group</button>
        </div>
      </div>

      {(groups ?? []).map((g: any) => (
        <div className="card" key={g.id} style={{ marginBottom: 12 }}>
          <strong>{g.name}</strong> <span className="badge">max {g.maxSelect}</span>
          <table style={{ marginTop: 8 }}>
            <tbody>
              {g.modifiers.map((m: any) => (
                <tr key={m.id}><td>{m.name}</td><td>+₹{m.priceDelta}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
