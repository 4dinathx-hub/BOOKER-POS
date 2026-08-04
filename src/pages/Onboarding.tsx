import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { data: branches, isLoading } = useQuery({
    queryKey: ['/restaurant/branches'],
    queryFn: async () => (await api.get('/restaurant/branches')).data,
    enabled: !!user,
  });

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createBranch = useMutation({
    mutationFn: async () => (await api.post('/restaurant/branches', { name, city: city || undefined, phone: phone || undefined })).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/restaurant/branches'] });
      await api.patch('/restaurant/onboarding-step', { step: 'BRANCH_CREATED' });
    },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Failed to create branch'),
  });

  const finish = useMutation({
    mutationFn: async () => api.patch('/restaurant/onboarding-step', { step: 'COMPLETE' }),
    onSuccess: () => navigate('/'),
  });

  if (authLoading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.actorType !== 'OWNER') return <Navigate to="/" replace />;

  const hasBranch = Array.isArray(branches) && branches.length > 0;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 460 }}>
        <h2 style={{ marginTop: 0 }}>Welcome to Booker 👋</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Let's get your first branch set up. You can add more branches, menu items, and staff later from Settings.</p>

        {isLoading ? (
          <p>Loading…</p>
        ) : hasBranch ? (
          <>
            <div style={{ margin: '16px 0' }}>
              {branches.map((b: any) => (
                <div key={b.id} className="badge" style={{ marginRight: 6 }}>{b.name}</div>
              ))}
            </div>
            <p>You're all set — head to the menu builder next to add items, or jump straight into the dashboard.</p>
            <button style={{ width: '100%' }} onClick={() => finish.mutate()} disabled={finish.isPending}>
              {finish.isPending ? 'Finishing…' : 'Go to dashboard'}
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!name) return setError('Branch name is required');
              createBranch.mutate();
            }}
          >
            <div className="form-row"><label>Branch name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Downtown Branch" required /></div>
            <div className="form-row"><label>City (optional)</label><input value={city} onChange={(e) => setCity(e.target.value)} /></div>
            <div className="form-row"><label>Phone (optional)</label><input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            {error && <div className="error-text" style={{ marginBottom: 8 }}>{error}</div>}
            <button type="submit" disabled={createBranch.isPending} style={{ width: '100%' }}>
              {createBranch.isPending ? 'Creating…' : 'Create branch & continue'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
