import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import FxmarkLogo from '../../components/FxmarkLogo.jsx';
import { getApiBase } from '../../config/apiBase.js';

const POLL_MS = 15_000;

/**
 * Public maintenance notice — users are redirected here when platform maintenance is active.
 */
export default function MaintenanceNotice() {
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState(
    typeof location.state?.message === 'string' ? location.state.message : ''
  );
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`${getApiBase()}/platform/maintenance`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!data.maintenance) {
          navigate('/', { replace: true });
          return;
        }
        const msg =
          typeof data.message === 'string' && data.message.trim()
            ? data.message
            : 'We are performing scheduled maintenance. Please try again shortly.';
        setMessage(msg);
      } catch {
        if (!cancelled) {
          setMessage((prev) => prev || 'We are performing scheduled maintenance. Please try again shortly.');
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    check();
    const id = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [navigate]);

  return (
    <div className="landing maintenance-notice">
      <header className="landing-header">
        <FxmarkLogo className="landing-logo" />
        <nav className="landing-nav" aria-label="Maintenance">
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            Status updates refresh automatically
          </span>
        </nav>
      </header>

      <main className="maintenance-notice-main">
        <div className="maintenance-notice-card">
          <h1 className="maintenance-notice-title">We&apos;ll be back soon</h1>
          <p className="maintenance-notice-body">
            {checking && !message ? 'Checking status…' : message}
          </p>
          <p className="maintenance-notice-hint muted">
            This page will return you to the site when maintenance ends. You can also try again below.
          </p>
          <div className="maintenance-notice-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={checking}
              onClick={() => {
                fetch(`${getApiBase()}/platform/maintenance`, { cache: 'no-store' })
                  .then((r) => r.json())
                  .then((data) => {
                    if (!data.maintenance) navigate('/', { replace: true });
                    else if (typeof data.message === 'string') setMessage(data.message);
                  })
                  .catch(() => {});
              }}
            >
              Check again
            </button>
            <Link to="/" className="btn btn-secondary">
              Home
            </Link>
          </div>
        </div>
      </main>

      <footer className="landing-footer">
        <p className="muted">FXMARK — thank you for your patience.</p>
      </footer>
    </div>
  );
}
