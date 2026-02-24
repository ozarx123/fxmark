import React, { createContext, useContext, useState, useCallback } from 'react';
import { ensureUserRole } from '../utils/authHelpers';

const AuthContext = createContext(null);
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

  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));

  const login = useCallback((userData, accessToken = null) => {
    const u = typeof userData === 'object' ? userData : { email: userData, role: 'user' };
    const safeUser = ensureUserRole(u);
    setUser(safeUser);
    if (accessToken) {
      setToken(accessToken);
      try {
        localStorage.setItem(TOKEN_KEY, accessToken);
      } catch (e) {
        console.warn('localStorage setItem failed', e);
      }
    }
    try {
      localStorage.setItem('fxmark_user', JSON.stringify(safeUser));
    } catch (e) {
      console.warn('localStorage setItem failed', e);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem('fxmark_user');
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      console.warn('localStorage removeItem failed', e);
    }
  }, []);

  const value = { user, token, login, logout, isAuthenticated: !!user };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
