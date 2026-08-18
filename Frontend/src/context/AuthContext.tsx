import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  full_name: string;
  email: string;
  role: string;
  auth_provider?: string;
  has_local_password?: boolean;
  is_verified?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (userData: AuthUser) => void;
  logout: () => void;
  updateUser: (partial: Partial<AuthUser>) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true); // true until the /me check resolves
  const sessionChecked = useRef(false);

  // Restore session once on mount
  useEffect(() => {
    if (sessionChecked.current) return;
    sessionChecked.current = true;

    (async () => {
      try {
        // Single request to validate the access-token cookie and return user data.
        // If the access token is expired but a valid refresh token cookie exists,
        // the axios response interceptor (in api.ts) will transparently refresh it
        // before this call resolves.
        const res = await api.get<{ success: boolean; user: AuthUser }>('/auth/me');
        if (res.data.success && res.data.user) {
          setUser(res.data.user);
        }
      } catch {
        // 401 → no valid session; stay on landing page
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();

    // When both access + refresh tokens are expired (interceptor gives up),
    // clear auth state so the user sees the landing page rather than a broken dashboard.
    const handleAuthExpired = () => setUser(null);
    window.addEventListener('sw:auth:expired', handleAuthExpired);
    return () => window.removeEventListener('sw:auth:expired', handleAuthExpired);
  }, []);

  const login = useCallback((userData: AuthUser) => {
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Best-effort — clear client state regardless
    }
    setUser(null);
  }, []);

  const updateUser = useCallback((partial: Partial<AuthUser>) => {
    setUser(prev => prev ? { ...prev, ...partial } : prev);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
