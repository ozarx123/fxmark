import React, { useEffect, useState } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ensureUserRole } from '../../utils/authHelpers';
import FxmarkLogo from '../../components/FxmarkLogo';
import { getApiBase } from '../../config/apiBase.js';

const API_BASE = getApiBase();

function readTokenFromUrl() {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search).get('token');
  return q && q.trim() ? q.trim() : null;
}

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { user, token: authToken, login } = useAuth();
  const token = searchParams.get('token')?.trim() || readTokenFromUrl();

  // no_token = opened app route without ?token= (e.g. after login or protected-route redirect); not an error
  const [status, setStatus] = useState(() => (token ? 'verifying' : 'no_token')); // 'no_token' | 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const [resendEmail, setResendEmail] = useState(() => location.state?.email || user?.email || '');
  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState(null);
  const signupVerificationWarning = location.state?.verificationEmailWarning;

  useEffect(() => {
    const fromState = location.state?.email;
    const fromUser = user?.email;
    if (fromState || fromUser) {
      setResendEmail((prev) => prev || fromState || fromUser || '');
    }
  }, [location.state?.email, user?.email]);

  useEffect(() => {
    if (!token) {
      setStatus('no_token');
      setMessage('');
      return;
    }

    let cancelled = false;
    setStatus('verifying');
    setMessage('');

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.verified) {
          if (data.user && authToken) {
            const u = ensureUserRole({ ...data.user, emailVerified: true });
            login(u, authToken);
          }
          setStatus('success');
          if (data.alreadyVerified) {
            setMessage(data.message || 'Your email is already verified.');
          } else {
            setMessage(
              data.user && authToken
                ? "Your email is verified. You're all set."
                : 'Your email has been verified. You can now sign in.'
            );
          }
          return;
        }
        setStatus('error');
        const hint = data.hint ? ` ${data.hint}` : '';
        if (data.code === 'TOKEN_EXPIRED') {
          setMessage((data.error || data.message || 'This link has expired.') + hint);
        } else if (data.code === 'TOKEN_INVALID') {
          setMessage((data.error || data.message || 'This link is invalid or was already used.') + hint);
        } else {
          setMessage((data.error || data.message || 'Verification failed.') + hint);
        }
      } catch {
        if (cancelled) return;
        setStatus('error');
        setMessage('Something went wrong. Please try again or use the link from your email.');
      }
    })();

    return () => { cancelled = true; };
  // Only re-run when URL token changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!resendEmail?.trim()) return;
    setResendResult(null);
    setResending(true);
    try {
      const res = await fetch(`${API_BASE}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResendResult({ ok: true, message: data.message || 'Verification email sent. Check your inbox.' });
      } else {
        const baseMsg = data.error || data.message || 'Failed to send. Try again.';
        const detail = data.detail && typeof data.detail === 'string' ? ` ${data.detail}` : '';
        setResendResult({ ok: false, message: `${baseMsg}${detail}`.trim() });
      }
    } catch {
      setResendResult({ ok: false, message: 'Request failed. Try again.' });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card auth-callback">
        <FxmarkLogo className="auth-logo" />
        <h1 className="auth-title">Email verification</h1>

        {signupVerificationWarning && (
          <p className="auth-error" style={{ marginBottom: '1rem', fontSize: '0.95rem' }} role="alert">
            {signupVerificationWarning}
          </p>
        )}

        {status === 'verifying' && (
          <p className="auth-callback-status">Verifying your email…</p>
        )}

        {status === 'success' && (
          <>
            <p className="auth-callback-status" style={{ color: 'var(--success, #22c55e)' }}>{message}</p>
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {authToken ? (
                <Link to="/dashboard" className="auth-submit" style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
                  Go to dashboard
                </Link>
              ) : (
                <Link to="/auth" className="auth-submit" style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
                  Sign in
                </Link>
              )}
            </div>
          </>
        )}

        {(status === 'no_token' || status === 'error') && (
          <>
            {status === 'no_token' ? (
              <p className="auth-callback-status" style={{ marginBottom: '1rem' }}>
                We sent a verification link to your email. Open that link to finish verifying. If you need a new link, enter your email below.
              </p>
            ) : (
              <p className="auth-callback-status auth-error">{message}</p>
            )}
            <div style={{ marginTop: status === 'no_token' ? '0.5rem' : '1rem' }}>
              <Link to="/auth" className="auth-link" style={{ marginRight: '0.5rem' }}>Back to sign in</Link>
            </div>
            <div className="auth-divider" style={{ margin: '1.5rem 0' }} />
            <p className="auth-footer" style={{ marginBottom: '0.5rem' }}>Resend verification email</p>
            <form className="auth-form" onSubmit={handleResend} style={{ marginTop: 0 }}>
              <label className="auth-label">
                <span>Email</span>
                <input
                  type="email"
                  className="auth-input"
                  placeholder="your@email.com"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  disabled={resending}
                />
              </label>
              <button type="submit" className="auth-submit" disabled={resending}>
                {resending ? 'Sending…' : 'Resend'}
              </button>
            </form>
            {resendResult && (
              <p className={resendResult.ok ? 'auth-callback-status' : 'auth-error'} style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
                {resendResult.message}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}


