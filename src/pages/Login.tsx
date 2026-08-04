import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { loginOwner, loginEmployee } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'owner' | 'employee'>('owner');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'owner') await loginOwner(email, password);
      else await loginEmployee(restaurantId, code, pin);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 360 }}>
        <h2 style={{ marginTop: 0 }}>Booker Admin</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className={mode === 'owner' ? '' : 'secondary'} onClick={() => setMode('owner')} type="button">Owner</button>
          <button className={mode === 'employee' ? '' : 'secondary'} onClick={() => setMode('employee')} type="button">Staff PIN</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'owner' ? (
            <>
              <div className="form-row"><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></div>
              <div className="form-row"><label>Password</label><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required /></div>
              <div style={{ textAlign: 'right', marginBottom: 8 }}>
                <Link to="/forgot-password" style={{ fontSize: 13, color: 'var(--muted)' }}>Forgot password?</Link>
              </div>
            </>
          ) : (
            <>
              <div className="form-row"><label>Branch ID</label><input value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)} required /></div>
              <div className="form-row"><label>Employee code</label><input value={code} onChange={(e) => setCode(e.target.value)} required /></div>
              <div className="form-row"><label>PIN</label><input value={pin} onChange={(e) => setPin(e.target.value)} type="password" required /></div>
            </>
          )}
          {error && <div className="error-text" style={{ marginBottom: 8 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ width: '100%' }}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}
