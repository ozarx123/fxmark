import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import FxmarkLogo from '../../components/FxmarkLogo';
import { getApiBase } from '../../config/apiBase.js';

const API_BASE = getApiBase();
const PASSWORD_MIN = 8;

function readTokenFromUrl() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('token')?.trim() || '';
}

function validatePassword(password) {
  if (!password) return 'Password is required';
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token')?.trim() || readTokenFromUrl();

  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('This link is missing a token. Open the link from your email or request a new reset.');
      return;
    }
    const p1 = validatePassword(password);
    if (p1) {
      setError(p1);
      return;
    }
    if (password !== password2) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Reset failed');
      }
      setSuccess(true);
      setTimeout(() => navigate('/auth', { replace: true }), 2000);
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
        <h1 className="auth-title">Set new password</h1>

        {success ? (
          <p className="auth-callback-status" style={{ color: 'var(--success, #22c55e)' }}>
            Password updated. Redirecting to sign in…
          </p>
        ) : !token ? (
          <>
            <p className="auth-error" role="alert">
              Reset link is invalid or incomplete. Request a new link below.
            </p>
            <Link to="/forgot-password" className="auth-submit" style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center', marginTop: '1rem' }}>
              Request new link
            </Link>
            <p className="auth-footer" style={{ marginTop: '1rem' }}>
              <Link to="/auth" className="auth-link">Back to sign in</Link>
            </p>
          </>
        ) : (
          <>
            <p className="auth-subtitle" style={{ marginBottom: '1rem' }}>
              Choose a strong password for your account.
            </p>
            {error && <div className="auth-error">{error}</div>}
            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="auth-label">
                New password
                <input
                  type="password"
                  className="auth-input"
                  placeholder="Min 8 chars, upper, lower, number"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={loading}
                />
              </label>
              <label className="auth-label">
                Confirm password
                <input
                  type="password"
                  className="auth-input"
                  placeholder="Repeat password"
                  value={password2}
                  onChange={(ev) => setPassword2(ev.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={loading}
                />
              </label>
              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? 'Updating…' : 'Update password'}
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
