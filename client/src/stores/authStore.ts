import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  sessionId: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  sessionExpired: boolean;
  setAuth: (user: User, accessToken: string, sessionId?: string) => void;
  updateUser: (user: Partial<User>) => void;
  clearAuth: (expired?: boolean) => void;
  setInitializing: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  sessionId: null,
  isAuthenticated: false,
  isInitializing: true,
  sessionExpired: false,

  setAuth: (user, accessToken, sessionId) =>
    set({
      user,
      accessToken,
      sessionId: sessionId ?? null,
      isAuthenticated: true,
      isInitializing: false,
      sessionExpired: false,
    }),

  updateUser: (updates) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    })),

  clearAuth: (expired = false) =>
    set({
      user: null,
      accessToken: null,
      sessionId: null,
      isAuthenticated: false,
      isInitializing: false,
      sessionExpired: expired,
    }),

  setInitializing: (value) => set({ isInitializing: value }),
}));
