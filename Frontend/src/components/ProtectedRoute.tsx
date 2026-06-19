import { Navigate } from 'react-router-dom';
import { isAuthenticated } from '../lib/auth';

interface Props {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
