export interface User {
  full_name: string;
  email: string;
  role: string;
  joined: string;
}

function decodeToken(token: string): Record<string, unknown> {
  return JSON.parse(atob(token.split('.')[1]));
}

function isTokenValid(token: string): boolean {
  try {
    const payload = decodeToken(token);
    const exp = payload.exp;
    if (typeof exp === 'number' && exp * 1000 <= Date.now()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isAuthenticated(): boolean {
  const token = localStorage.getItem('token');
  if (!token) return false;
  return isTokenValid(token);
}

export function getUser(): User | null {
  const token = localStorage.getItem('token');
  if (!token || !isTokenValid(token)) return null;

  try {
    const payload = decodeToken(token);

    return {
      full_name: (payload.full_name as string) || 'User',
      email: (payload.email as string) || '',
      role: (payload.role as string) || 'Member',
      joined: 'Joined recently',
    };
  } catch {
    return null;
  }
}
