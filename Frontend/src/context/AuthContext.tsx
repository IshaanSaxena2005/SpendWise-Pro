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

// Resolve the signed-in user from the access-token cookie. If the access JWT
// is stale (>15 min) — e.g. the tab slept overnight, or the user opens the site
// fresh in another tab — /me 401s even though the 30-day refresh session is
// still valid. In that case refresh once and retry, so a cold load restores the
// session instead of bouncing the user to the landing page. If refresh fails
// too, the session is genuinely gone and we report null.
async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await api.get<{ success: boolean; user: AuthUser }>('/auth/me');
    return res.data.success ? res.data.user : null;
  } catch {
    try {
      await api.post('/auth/refresh');
      const res = await api.get<{ success: boolean; user: AuthUser }>('/auth/me');
      return res.data.success ? res.data.user : null;
    } catch {
      return null;
    }
  }
}

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
        const resolvedUser = await fetchCurrentUser();
        setUser(resolvedUser);
      } catch {
        // Network-level failure of the session check — treat as signed out
        // rather than leaving the app in a broken loading state.
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

  // Keep the access-token cookie fresh while the app is open on a visible tab.
  // The access JWT lives only ~15 minutes; without this heartbeat an idle open
  // dashboard relies on a 401-triggered refresh for the user's NEXT action, and
  // a single transient refresh failure (network blip, throttled background tab,
  // laptop waking from sleep) would bounce them out even though their 30-day
  // refresh session is perfectly valid. Refreshing proactively uses the same
  // /auth/refresh endpoint — no second auth mechanism, no weaker tokens.
  useEffect(() => {
    if (!user) return;
    const ACCESS_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // access TTL is 15 min
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void api.post('/auth/refresh').catch(() => {
        // Transient failures are harmless: normal requests still flow through
        // the 401 → refresh → retry interceptor. Genuine expiry is detected
        // there and dispatched as 'sw:auth:expired'.
      });
    }, ACCESS_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [user]);

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
