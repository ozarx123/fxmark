import { create } from 'zustand';

type SessionState = {
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  isAuthenticated: false,
  login: () => set({ isAuthenticated: true }),
  logout: () => set({ isAuthenticated: false })
}));
