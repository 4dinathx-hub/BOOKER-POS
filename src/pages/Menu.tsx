import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

function RecipeManagerModal({ item, onClose }: { item: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [quantityPerUnit, setQuantityPerUnit] = useState('');
  const [unit, setUnit] = useState('');

  const { data: recipe, isLoading } = useQuery({
    queryKey: ['/menu/items', item.id, 'recipe'],
    queryFn: async () => (await api.get(`/menu/items/${item.id}/recipe`)).data,
  });
  const { data: inventoryItems } = useQuery({
    queryKey: ['/inventory'],
    queryFn: async () => (await api.get('/inventory')).data,
  });

  const add = useMutation({
    mutationFn: async () => (await api.post(`/menu/items/${item.id}/recipe`, {
      inventoryItemId, quantityPerUnit: Number(quantityPerUnit), unit,
    })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/menu/items', item.id, 'recipe'] });
      setInventoryItemId(''); setQuantityPerUnit(''); setUnit('');
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/menu/recipe/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/menu/items', item.id, 'recipe'] }),
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div className="card" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Recipe for "{item.name}"</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -8 }}>
          What this dish actually consumes from inventory, per 1 sold. This is what drives automatic
          stock deduction — without at least one ingredient here, selling this item won't move stock at all.
        </p>

        {isLoading ? <p>Loading…</p> : (
          <ul style={{ listStyle: 'none', padding: 0, marginBottom: 12 }}>
            {(recipe ?? []).map((r: any) => (
              <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span>{Number(r.quantityPerUnit)} {r.unit} — {r.inventoryItem.name} <span style={{ color: 'var(--muted)', fontSize: 12 }}>(in stock: {r.inventoryItem.stock} {r.inventoryItem.unit})</span></span>
                <button className="secondary" onClick={() => remove.mutate(r.id)}>Remove</button>
              </li>
            ))}
            {(recipe ?? []).length === 0 && <li style={{ color: 'var(--danger)' }}>No ingredients set — stock won't deduct when this sells.</li>}
          </ul>
        )}

        <form onSubmit={(e) => { e.preventDefault(); if (inventoryItemId && quantityPerUnit && unit) add.mutate(); }} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)} style={{ flex: 2 }} required>
            <option value="">Ingredient…</option>
            {(inventoryItems ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input type="number" step="any" placeholder="Qty" value={quantityPerUnit} onChange={(e) => setQuantityPerUnit(e.target.value)} style={{ width: 70 }} required />
          <input placeholder="Unit (g, ml, pcs)" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: 100 }} required />
          <button type="submit" disabled={add.isPending}>Add</button>
        </form>

        <button className="secondary" style={{ marginTop: 12, width: '100%' }} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function ComboManagerModal({ item, allItems, onClose }: { item: any; allItems: any[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [componentId, setComponentId] = useState('');
  const [quantity, setQuantity] = useState(1);

  const { data: components, isLoading } = useQuery({
    queryKey: ['/menu/items', item.id, 'combo-components'],
    queryFn: async () => (await api.get(`/menu/items/${item.id}/combo-components`)).data,
  });

  const add = useMutation({
    mutationFn: async () => (await api.post(`/menu/items/${item.id}/combo-components`, { componentMenuItemId: componentId, quantity })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/menu/items', item.id, 'combo-components'] });
      setComponentId(''); setQuantity(1);
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/menu/combo-components/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/menu/items', item.id, 'combo-components'] }),
  });

  const options = allItems.filter((i) => i.id !== item.id && !i.isCombo);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div className="card" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>What's in "{item.name}"?</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -8 }}>
          For display only (KOT + invoice breakdown). The combo's own price and stock recipe still control billing and inventory deduction.
        </p>

        {isLoading ? <p>Loading…</p> : (
          <ul style={{ listStyle: 'none', padding: 0, marginBottom: 12 }}>
            {(components ?? []).map((c: any) => (
              <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span>{c.quantity}× {c.componentMenuItem.name}</span>
                <button className="secondary" onClick={() => remove.mutate(c.id)}>Remove</button>
              </li>
            ))}
            {(components ?? []).length === 0 && <li style={{ color: 'var(--muted)' }}>No components added yet.</li>}
          </ul>
        )}

        <form onSubmit={(e) => { e.preventDefault(); if (componentId) add.mutate(); }} style={{ display: 'flex', gap: 8 }}>
          <select value={componentId} onChange={(e) => setComponentId(e.target.value)} style={{ flex: 1 }} required>
            <option value="">Add item…</option>
            {options.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} style={{ width: 60 }} />
          <button type="submit" disabled={add.isPending}>Add</button>
        </form>

        <button className="secondary" style={{ marginTop: 12, width: '100%' }} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

export default function Menu() {
  const queryClient = useQueryClient();
  const { data: categories, isLoading } = useQuery({
    queryKey: ['/menu/categories'],
    queryFn: async () => (await api.get('/menu/categories')).data,
  });
  const { data: taxClasses } = useQuery({
    queryKey: ['/taxes'],
    queryFn: async () => (await api.get('/taxes')).data,
  });

  const [newCategoryName, setNewCategoryName] = useState('');
  const [itemForm, setItemForm] = useState<Record<string, any>>({});
  const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
  const [comboItem, setComboItem] = useState<any | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['/menu/categories'] });

  const addCategory = useMutation({
    mutationFn: async () => (await api.post('/menu/categories', { name: newCategoryName })).data,
    onSuccess: () => { setNewCategoryName(''); invalidate(); },
  });

  const addItem = useMutation({
    mutationFn: async (categoryId: string) => (await api.post('/menu/items', { ...itemForm, categoryId, price: Number(itemForm.price) })).data,
    onSuccess: () => { setItemForm({}); setAddingToCategory(null); invalidate(); },
  });

  const toggleAvailability = useMutation({
    mutationFn: async (itemId: string) => (await api.post(`/menu/items/${itemId}/toggle-availability`)).data,
    onSuccess: invalidate,
  });

  const updatePrice = useMutation({
    mutationFn: async ({ id, price }: { id: string; price: number }) => (await api.patch(`/menu/items/${id}`, { price })).data,
    onSuccess: invalidate,
  });

  if (isLoading) return <p>Loading…</p>;

  const allItems = (categories ?? []).flatMap((c: any) => c.items);

  return (
    <div>
      <div className="topbar">
        <h2>Menu & Categories</h2>
        <form onSubmit={(e) => { e.preventDefault(); addCategory.mutate(); }} style={{ display: 'flex', gap: 8 }}>
          <input placeholder="New category name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
          <button type="submit" disabled={!newCategoryName || addCategory.isPending}>+ Category</button>
        </form>
      </div>

      {(categories ?? []).map((cat: any) => (
        <div className="card" key={cat.id} style={{ marginBottom: 16 }}>
          <div className="topbar">
            <h3 style={{ margin: 0 }}>{cat.name}</h3>
            <button className="secondary" onClick={() => setAddingToCategory(addingToCategory === cat.id ? null : cat.id)}>
              {addingToCategory === cat.id ? 'Cancel' : '+ Item'}
            </button>
          </div>

          {addingToCategory === cat.id && (
            <form onSubmit={(e) => { e.preventDefault(); addItem.mutate(cat.id); }} style={{ marginBottom: 12 }}>
              <div className="grid grid-4">
                <div className="form-row"><label>Name</label><input value={itemForm.name ?? ''} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} required /></div>
                <div className="form-row"><label>Price (₹)</label><input type="number" value={itemForm.price ?? ''} onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} required /></div>
                <div className="form-row">
                  <label>Tax Class</label>
                  <select value={itemForm.taxClassId ?? ''} onChange={(e) => setItemForm({ ...itemForm, taxClassId: e.target.value || undefined })}>
                    <option value="">Branch default</option>
                    {(taxClasses ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="form-row"><label>Veg?</label><input type="checkbox" checked={itemForm.isVeg ?? true} onChange={(e) => setItemForm({ ...itemForm, isVeg: e.target.checked })} /></div>
                <div className="form-row">
                  <label>This is a combo/bundle?</label>
                  <input type="checkbox" checked={itemForm.isCombo ?? false} onChange={(e) => setItemForm({ ...itemForm, isCombo: e.target.checked })} />
                </div>
              </div>
              <button type="submit" disabled={addItem.isPending}>Save item</button>
            </form>
          )}

          <table>
            <thead><tr><th>Name</th><th>Price</th><th>Veg</th><th>Available</th><th>Modifier groups</th><th></th></tr></thead>
            <tbody>
              {cat.items.map((item: any) => (
                <tr key={item.id}>
                  <td>{item.isCombo && <span className="badge" style={{ marginRight: 6 }}>COMBO</span>}{item.name}</td>
                  <td>
                    <input
                      type="number" defaultValue={item.price} style={{ width: 90 }}
                      onBlur={(e) => { const v = Number(e.target.value); if (v !== item.price) updatePrice.mutate({ id: item.id, price: v }); }}
                    />
                  </td>
                  <td>{item.isVeg ? '🟢' : '🔴'}</td>
                  <td>
                    <span className={`badge ${item.isAvailable ? 'success' : 'danger'}`} style={{ cursor: 'pointer' }} onClick={() => toggleAvailability.mutate(item.id)}>
                      {item.isAvailable ? 'Available' : 'Sold out'}
                    </span>
                  </td>
                  <td>{item.modifierGroups?.map((g: any) => g.modifierGroup.name).join(', ') || '—'}</td>
                  <td>
                    {item.isCombo && <button className="secondary" onClick={() => setComboItem(item)}>Edit contents</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {comboItem && <ComboManagerModal item={comboItem} allItems={allItems} onClose={() => setComboItem(null)} />}
    </div>
  );
}
