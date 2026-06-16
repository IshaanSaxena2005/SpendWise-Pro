import { Navigate } from 'react-router-dom';

interface Props {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/?login=1" replace />;
  }
  return <>{children}</>;
}
