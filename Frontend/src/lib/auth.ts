export interface User {
  full_name: string;
  email: string;
  role: string;
  joined: string;
}

export function getUser(): User {
  const defaultUser: User = {
    full_name: 'Guest User',
    email: 'guest@spendwisepro.com',
    role: 'Member',
    joined: 'Recently',
  };

  const token = localStorage.getItem('token');
  if (!token) return defaultUser;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    
    return {
      full_name: payload.full_name || defaultUser.full_name,
      email: payload.email || defaultUser.email,
      role: payload.role || 'Member',
      // We don't have joined date in JWT, but we can default it gracefully
      joined: 'Joined recently',
    };
  } catch {
    return defaultUser;
  }
}
