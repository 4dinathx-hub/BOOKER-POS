import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Passwords don't match");
    if (password.length < 8) return setError('Password must be at least 8 characters');

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'This link is invalid or has expired');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ width: 380 }}>
          <h2 style={{ marginTop: 0 }}>Invalid link</h2>
          <p>This reset link is missing its token. Request a new one from the login page.</p>
          <Link to="/forgot-password">Request a new link</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 380 }}>
        <h2 style={{ marginTop: 0 }}>Set a new password</h2>
        {done ? (
          <p>Password updated — redirecting you to login…</p>
        ) : (
          <form onSubmit={submit}>
            <div className="form-row">
              <label>New password</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
            </div>
            <div className="form-row">
              <label>Confirm password</label>
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" required />
            </div>
            {error && <div className="error-text" style={{ marginBottom: 8 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Saving…' : 'Reset password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
