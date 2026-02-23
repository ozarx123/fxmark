import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ensureUserRole } from '../../utils/authHelpers';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const [status, setStatus] = useState('Signing you in…');

  useEffect(() => {
    const token = searchParams.get('token');
    const userParam = searchParams.get('user');
    const error = searchParams.get('error');

    if (error) {
      setStatus(`Error: ${decodeURIComponent(error)}`);
      setTimeout(() => navigate('/auth', { replace: true }), 2500);
      return;
    }

    if (token && userParam) {
      try {
        const user = ensureUserRole(JSON.parse(decodeURIComponent(userParam)));
        login(user);
        setStatus('Success! Redirecting…');
        navigate('/dashboard', { replace: true });
      } catch {
        setStatus('Invalid callback data');
        setTimeout(() => navigate('/auth', { replace: true }), 2500);
      }
      return;
    }

    setStatus('No auth data received');
    setTimeout(() => navigate('/auth', { replace: true }), 2500);
  }, [searchParams, login, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card auth-callback">
        <p className="auth-callback-status">{status}</p>
      </div>
    </div>
  );
}
