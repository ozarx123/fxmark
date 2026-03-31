import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { ensureUserRole } from '../utils/authHelpers';
import { reconnectWithAuth } from '../lib/datafeedSocket.js';
import { setAuthAccessToken } from '../lib/authAccessToken.js';

const AuthContext = createContext(null);
/** Bearer token in localStorage: any XSS in this origin can exfiltrate it. Mitigate with strict CSP on the SPA host; for stronger session isolation use an httpOnly cookie + BFF or token binding. */
const TOKEN_KEY = 'fxmark_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('fxmark_user');
      const parsed = stored ? JSON.parse(stored) : null;
      return parsed ? ensureUserRole(parsed) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      const t = raw && String(raw).trim();
      return t || null;
    } catch {
      return null;
    }
  });

  const login = useCallback((userData, accessToken = null) => {
    const u = typeof userData === 'object' ? userData : { email: userData, role: 'user' };
    const safeUser = ensureUserRole(u);
    setUser(safeUser);
    const trimmed =
      accessToken != null && String(accessToken).trim() ? String(accessToken).trim() : '';
    if (trimmed) {
      setToken(trimmed);
      try {
        localStorage.setItem(TOKEN_KEY, trimmed);
      } catch (e) {
        console.warn('localStorage setItem failed', e);
      }
    } else {
      setToken(null);
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch (e) {
        console.warn('localStorage removeItem failed', e);
      }
    }
    try {
      localStorage.setItem('fxmark_user', JSON.stringify(safeUser));
    } catch (e) {
      console.warn('localStorage setItem failed', e);
    }
    reconnectWithAuth();
  }, []);

  useEffect(() => {
    setAuthAccessToken(token);
  }, [token]);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem('fxmark_user');
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      console.warn('localStorage removeItem failed', e);
    }
    reconnectWithAuth();
  }, []);

  /** Require a stored access token — avoids "logged in" UI with no Bearer on API calls (401 on PAMM, wallet, etc.). */
  const value = { user, token, login, logout, isAuthenticated: !!(user && token) };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
