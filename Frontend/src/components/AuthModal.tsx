import { useState, useEffect } from 'react';
import { X, Mail, Lock, User, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: 'login' | 'signup';
}

export function AuthModal({ isOpen, onClose, initialView = 'login' }: AuthModalProps) {
  const [view, setView] = useState<'login' | 'signup'>(initialView);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Sync view when parent changes initialView
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(initialView);
    setError(null);
    setSuccess(null);
  }, [initialView, isOpen]);

  if (!isOpen) return null;

  const switchView = (v: 'login' | 'signup') => {
    setView(v);
    setError(null);
    setSuccess(null);
    setFullName('');
    setEmail('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Basic frontend validation
    if (view === 'signup' && !fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      const endpoint = view === 'login' ? '/auth/login' : '/auth/signup';
      const payload = view === 'signup'
        ? { full_name: fullName.trim(), email: email.trim(), password }
        : { email: email.trim(), password };

      const response = await api.post(endpoint, payload);

      if (response.data?.token) {
        localStorage.setItem('token', response.data.token);
        onClose();
        navigate('/dashboard');
      } else {
        throw new Error('No token received from server.');
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      const status = err.response?.status;
      const serverMsg = err.response?.data?.message || err.response?.data?.error;

      if (serverMsg) {
        setError(serverMsg);
      } else if (status === 409) {
        setError('An account with this email already exists.');
      } else if (status === 401) {
        setError('Invalid email or password. Please try again.');
      } else if (status === 400) {
        setError('Please fill in all required fields.');
      } else if (status === 500) {
        setError('Server error. Please try again later.');
      } else if (!err.response) {
        setError('Cannot connect to server. Make sure the backend is running on port 3000.');
      } else {
        setError('Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!loading ? onClose : undefined} />
      <div className="relative bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in fade-in zoom-in duration-200">

        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-black/40 hover:text-black transition-colors"
          disabled={loading}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand */}
        <div className="flex items-center gap-2 mb-8">
          <img src="/logo2.png" alt="SpendWise Pro" className="w-8 h-8 object-contain rounded-lg" />
          <span className="text-xl font-semibold text-black">SpendWise Pro</span>
        </div>

        <h2 className="text-3xl font-medium text-black mb-2" style={{ letterSpacing: '-0.02em' }}>
          {view === 'login' ? 'Welcome back' : 'Create account'}
        </h2>
        <p className="text-black/60 mb-6 text-sm">
          {view === 'login'
            ? 'Sign in to access your financial dashboard.'
            : 'Start your journey to financial clarity.'}
        </p>

        {/* Error banner */}
        {error && (
          <div className="mb-5 flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-xl p-3.5 text-xs text-rose-600 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Success banner */}
        {success && (
          <div className="mb-5 flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 text-xs text-emerald-600 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Full Name — signup only */}
          {view === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-black/80 mb-2">Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-[#F5F5F5] border border-black/5 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-transparent transition-all disabled:opacity-60"
                  placeholder="Jane Doe"
                  required
                  disabled={loading}
                  autoComplete="name"
                />
              </div>
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-black/80 mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#F5F5F5] border border-black/5 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-transparent transition-all disabled:opacity-60"
                placeholder="you@example.com"
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-black/80 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#F5F5F5] border border-black/5 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-transparent transition-all disabled:opacity-60"
                placeholder="••••••••"
                required
                minLength={6}
                disabled={loading}
                autoComplete={view === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
            {view === 'signup' && (
              <p className="text-xs text-black/40 mt-1.5 ml-1">Minimum 6 characters</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 bg-black text-white text-sm font-medium px-6 py-3.5 rounded-xl hover:bg-gray-800 transition-colors mt-2 disabled:opacity-55"
          >
            {loading
              ? 'Processing…'
              : view === 'login' ? 'Sign In' : 'Create Account'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <div className="mt-7 text-center text-sm text-black/60">
          {view === 'login' ? (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => switchView('signup')}
                className="text-black font-medium hover:underline"
                disabled={loading}
              >
                Sign up free
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => switchView('login')}
                className="text-black font-medium hover:underline"
                disabled={loading}
              >
                Log in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
