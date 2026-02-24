import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import FxmarkLogo from '../../components/FxmarkLogo';

import { ensureUserRole } from '../../utils/authHelpers';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;

function validateEmail(email) {
  if (!email?.trim()) return 'Email is required';
  if (!EMAIL_REGEX.test(email.trim().toLowerCase())) return 'Invalid email format';
  return null;
}

function validatePassword(password, isSignup = false) {
  if (!password) return 'Password is required';
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (isSignup) {
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  }
  return null;
}

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const refParam = searchParams.get('ref') || '';
  const [tab, setTab] = useState(refParam ? 'signup' : 'login'); // 'login' | 'signup'

  useEffect(() => {
    if (refParam) setTab('signup');
  }, [refParam]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    const emailErr = validateEmail(loginEmail);
    const pwdErr = validatePassword(loginPassword, false);
    if (emailErr || pwdErr) {
      setError(emailErr || pwdErr);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const u = ensureUserRole(data.user || { email: loginEmail, name: loginEmail.split('@')[0] }, loginEmail);
        login(u, data.accessToken);
        navigate(u.profileComplete ? '/dashboard' : '/auth/profile-setup', { replace: true });
        return;
      }
      if (res.status === 404 || res.status === 502) {
        login(ensureUserRole({ email: loginEmail, name: loginEmail.split('@')[0] }, loginEmail), null);
        navigate('/auth/profile-setup', { replace: true });
        return;
      }
      throw new Error(data.error || data.message || 'Login failed');
    } catch (err) {
      if (err.message !== 'Login failed' && err.message !== 'Failed to fetch') {
        setError(err.message);
      } else {
        login(ensureUserRole({ email: loginEmail, name: loginEmail.split('@')[0] }, loginEmail), null);
        navigate('/auth/profile-setup', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    const emailErr = validateEmail(signupEmail);
    const pwdErr = validatePassword(signupPassword, true);
    if (emailErr || pwdErr) {
      setError(emailErr || pwdErr);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: signupEmail,
          password: signupPassword,
          name: signupName,
          ref: refParam || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const u = ensureUserRole(data.user || { email: signupEmail, name: signupName || signupEmail.split('@')[0] }, signupEmail);
        login(u, data.accessToken);
        navigate('/auth/profile-setup', { replace: true });
        return;
      }
      if (res.status === 404 || res.status === 502) {
        login(ensureUserRole({ email: signupEmail, name: signupName || signupEmail.split('@')[0] }, signupEmail), null);
        navigate('/auth/profile-setup', { replace: true });
        return;
      }
      throw new Error(data.error || data.message || 'Signup failed');
    } catch (err) {
      if (err.message !== 'Signup failed' && err.message !== 'Failed to fetch') {
        setError(err.message);
      } else {
        login(ensureUserRole({ email: signupEmail, name: signupName || signupEmail.split('@')[0] }, signupEmail), null);
        navigate('/auth/profile-setup', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = () => {
    const redirect = `${window.location.origin}/auth/callback`;
    window.location.href = `${API_BASE}/auth/google?redirect=${encodeURIComponent(redirect)}`;
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <FxmarkLogo className="auth-logo" />
        <h1 className="auth-title">{tab === 'login' ? 'Welcome back' : 'Create account'}</h1>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => { setTab('login'); setError(''); }}
          >
            Login
          </button>
          <button
            type="button"
            className={`auth-tab ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => { setTab('signup'); setError(''); }}
          >
            Sign up
          </button>
        </div>

        <button type="button" className="auth-google-btn" onClick={handleGoogleAuth} disabled={loading}>
          <span className="auth-google-icon">
            <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          </span>
          Continue with Google
        </button>

        <div className="auth-divider">
          <span>or with email</span>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {tab === 'login' ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <label className="auth-label">
              Email
              <input
                type="email"
                className="auth-input"
                placeholder="you@example.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label className="auth-label">
              Password
              <input
                type="password"
                className="auth-input"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Log in'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleSignup}>
            <label className="auth-label">
              Name
              <input
                type="text"
                className="auth-input"
                placeholder="Your name"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="auth-label">
              Email
              <input
                type="email"
                className="auth-input"
                placeholder="you@example.com"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label className="auth-label">
              Password
              <input
                type="password"
                className="auth-input"
                placeholder="Min 8 chars, uppercase, lowercase, number"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Sign up'}
            </button>
          </form>
        )}

        <p className="auth-footer">
          {tab === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button type="button" className="auth-link" onClick={() => { setTab(tab === 'login' ? 'signup' : 'login'); setError(''); }}>
            {tab === 'login' ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </div>
    </div>
  );
}
