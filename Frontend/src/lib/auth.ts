// auth.ts — thin type definitions kept for backward-compatibility.
// Authentication state is now managed by AuthContext (src/context/AuthContext.tsx).
// Use the useAuth() hook to access user, isLoading, isAuthenticated, login, logout.

export interface User {
  full_name: string;
  email: string;
  role: string;
  joined: string;
}

// Legacy stubs — no longer read from localStorage.
// Retained so that any outstanding import of these names doesn't cause a
// compile error. Migrate callers to useAuth().
export function isAuthenticated(): boolean {
  return false; // AuthContext is the authoritative source; this stub is unused.
}

export function getUser(): User | null {
  return null; // Use useAuth().user instead.
}
