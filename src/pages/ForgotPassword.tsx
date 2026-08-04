import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 380 }}>
        <h2 style={{ marginTop: 0 }}>Reset your password</h2>
        {submitted ? (
          <>
            <p>If an account with that email exists, we've sent a reset link. It expires in 1 hour.</p>
            <Link to="/login">Back to login</Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>
              Enter the email you used to sign up and we'll send you a reset link.
            </p>
            <div className="form-row">
              <label>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            </div>
            {error && <div className="error-text" style={{ marginBottom: 8 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Link to="/login" style={{ fontSize: 13, color: 'var(--muted)' }}>Back to login</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
