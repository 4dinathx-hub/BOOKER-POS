import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export interface FieldDef {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'checkbox' | 'select';
  options?: string[];
  defaultValue?: any;
}

export interface ColumnDef {
  key: string;
  label: string;
  render?: (row: any) => React.ReactNode;
}

interface Props {
  title: string;
  resourcePath: string; // e.g. '/suppliers'
  columns: ColumnDef[];
  createFields: FieldDef[];
  extraActions?: (row: any, refetch: () => void) => React.ReactNode;
  /** Set to false for resources whose DELETE route doesn't exist yet. Defaults to true. */
  allowDelete?: boolean;
  /** Set to false for resources without a PATCH route. Defaults to true. */
  allowEdit?: boolean;
}

function emptyForm(fields: FieldDef[]) {
  return Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === 'checkbox' ? false : '')]));
}

// A pragmatic list+create+edit view for modules where a bespoke UI isn't
// worth the extra code (Suppliers, Coupons, Taxes, ...). Every one of these
// still goes through the real validated/audited API — this only simplifies
// the presentation layer, not the backend behavior.
export function SimpleCrudPage({ title, resourcePath, columns, createFields, extraActions, allowDelete = true, allowEdit = true }: Props) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>(emptyForm(createFields));
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [resourcePath],
    queryFn: async () => (await api.get(resourcePath)).data,
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm(createFields));
    setError(null);
    setShowForm(true);
  }

  function openEdit(row: any) {
    setEditingId(row.id);
    setForm(Object.fromEntries(createFields.map((f) => [f.name, row[f.name] ?? (f.type === 'checkbox' ? false : '')])));
    setError(null);
    setShowForm(true);
  }

  const saveMutation = useMutation({
    mutationFn: async (payload: any) =>
      editingId
        ? (await api.patch(`${resourcePath}/${editingId}`, payload)).data
        : (await api.post(resourcePath, payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [resourcePath] });
      setShowForm(false);
      setEditingId(null);
      setError(null);
    },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`${resourcePath}/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [resourcePath] }),
    onError: (err: any) => setError(err.response?.data?.error ?? 'Failed to delete'),
  });

  const rows: any[] = Array.isArray(data) ? data : [];

  return (
    <div>
      <div className="topbar">
        <h2>{title}</h2>
        <button onClick={() => (showForm ? setShowForm(false) : openCreate())}>{showForm ? 'Cancel' : '+ Add'}</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const payload = { ...form };
              for (const f of createFields) if (f.type === 'number') payload[f.name] = Number(payload[f.name]);
              saveMutation.mutate(payload);
            }}
          >
            <div className="grid grid-2">
              {createFields.map((f) => (
                <div className="form-row" key={f.name}>
                  <label>{f.label}</label>
                  {f.type === 'select' ? (
                    <select value={form[f.name]} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                      {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'checkbox' ? (
                    <input type="checkbox" checked={!!form[f.name]} onChange={(e) => setForm({ ...form, [f.name]: e.target.checked })} />
                  ) : (
                    <input
                      type={f.type ?? 'text'}
                      value={form[f.name]}
                      onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
            {error && <div className="error-text">{error}</div>}
            <button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Save'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <p>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Nothing here yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                {columns.map((c) => <th key={c.key}>{c.label}</th>)}
                {(extraActions || allowEdit || allowDelete) && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : String(row[c.key] ?? '')}</td>)}
                  {(extraActions || allowEdit || allowDelete) && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {allowEdit && (
                        <button className="secondary" style={{ marginRight: 6 }} onClick={() => openEdit(row)}>Edit</button>
                      )}
                      {allowDelete && (
                        <button
                          className="secondary"
                          onClick={() => {
                            if (confirm(`Delete this ${title.toLowerCase()} entry?`)) deleteMutation.mutate(row.id);
                          }}
                        >
                          Delete
                        </button>
                      )}
                      {extraActions?.(row, () => queryClient.invalidateQueries({ queryKey: [resourcePath] }))}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
