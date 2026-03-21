import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import FxmarkLogo from '../../components/FxmarkLogo';
import { getApiBase } from '../../config/apiBase.js';

const API_BASE = getApiBase();
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const eTrim = email.trim().toLowerCase();
    if (!eTrim || !EMAIL_REGEX.test(eTrim)) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: eTrim }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Request failed');
      }
      setDone(true);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card auth-callback">
        <FxmarkLogo className="auth-logo" />
        <h1 className="auth-title">Forgot password</h1>

        {done ? (
          <>
            <p className="auth-callback-status" style={{ marginBottom: '1rem' }}>
              If an account exists for that email, we sent instructions to reset your password. Check your inbox and spam folder.
            </p>
            <Link to="/auth" className="auth-submit" style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="auth-subtitle" style={{ marginBottom: '1.25rem' }}>
              Enter your email and we’ll send you a reset link.
            </p>
            {error && <div className="auth-error">{error}</div>}
            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="auth-label">
                Email
                <input
                  type="email"
                  className="auth-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  required
                  autoComplete="email"
                  disabled={loading}
                />
              </label>
              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            <p className="auth-footer" style={{ marginTop: '1rem' }}>
              <Link to="/auth" className="auth-link">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
