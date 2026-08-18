import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Props {
  children: React.ReactNode;
}

// Full-screen loading skeleton shown while the /me session check is in flight.
// This prevents the brief flash to the landing page for already-authenticated users.
function SessionLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#F5F5F5] flex">
      {/* Sidebar skeleton */}
      <div className="hidden md:flex flex-col w-56 bg-white border-r border-black/5 fixed inset-y-0 z-20 p-4 gap-4">
        <div className="h-12 bg-black/5 rounded-xl animate-pulse" />
        <div className="flex-1 space-y-2 mt-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-9 bg-black/5 rounded-xl animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
        <div className="h-10 bg-black/5 rounded-xl animate-pulse" />
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 md:pl-56 flex flex-col min-h-screen">
        {/* Header */}
        <div className="h-16 bg-white border-b border-black/5" />
        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="h-8 w-48 bg-black/5 rounded-xl animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 bg-white rounded-2xl border border-black/5 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
          <div className="h-64 bg-white rounded-2xl border border-black/5 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: Props) {
  const { isAuthenticated, isLoading } = useAuth();

  // While the /me session check is running, show the skeleton instead of
  // redirecting. This prevents authenticated users from seeing a flash to
  // the landing page on every page load / refresh.
  if (isLoading) {
    return <SessionLoadingSkeleton />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
