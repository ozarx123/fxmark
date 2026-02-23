import React, { createContext, useContext, useState, useCallback } from 'react';
import { ensureUserRole } from '../utils/authHelpers';

const AuthContext = createContext(null);

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

  const login = useCallback((userData) => {
    setUser(userData);
    try {
      localStorage.setItem('fxmark_user', JSON.stringify(userData));
    } catch (e) {
      console.warn('localStorage setItem failed', e);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    try {
      localStorage.removeItem('fxmark_user');
    } catch (e) {
      console.warn('localStorage removeItem failed', e);
    }
  }, []);

  const value = { user, login, logout, isAuthenticated: !!user };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
