import { useState, useEffect } from 'react';
import { X, Mail, Lock, User, ArrowRight, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { GoogleLogin } from '@react-oauth/google';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: 'login' | 'signup' | 'forgot-password' | 'reset-password';
  verificationSuccess?: boolean;
  resetToken?: string | null;
}

export function AuthModal({ isOpen, onClose, initialView = 'login', verificationSuccess = false, resetToken = null }: AuthModalProps) {
  const [view, setView] = useState<'login' | 'signup' | 'forgot-password' | 'reset-password'>(initialView);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const emailFromUrl = searchParams.get('email');

  // Sync view when parent changes initialView
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(initialView);
    setError(null);
    if (verificationSuccess) {
      setSuccess('Your email has been verified. You can now log in.');
    } else {
      setSuccess(null);
    }
  }, [initialView, isOpen, verificationSuccess]);

  if (!isOpen) return null;

  const switchView = (v: 'login' | 'signup' | 'forgot-password' | 'reset-password') => {
    setView(v);
    setError(null);
    setSuccess(null);
    setFullName('');
    if (v !== 'forgot-password') {
        setEmail('');
    }
    setPassword('');
    setConfirmPassword('');
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
    if (view !== 'reset-password' && !email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (view === 'reset-password' && !resetToken) {
      setError('Invalid or expired reset link. Please request a new one.');
      return;
    }
    if (view === 'reset-password' && !emailFromUrl) {
      setError('Invalid or expired reset link. Please request a new one.');
      return;
    }
    if (view === 'reset-password' && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (view === 'reset-password' && !confirmPassword) {
      setError('Please confirm your password.');
      return;
    }
    if (view === 'reset-password' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      if (view === 'forgot-password') {
        const response = await api.post('/auth/forgot-password', { email: email.trim() });
        setSuccess(response.data.message);
        return;
      }

      if (view === 'reset-password') {
        const response = await api.post('/auth/reset-password', {
          email: emailFromUrl,
          token: resetToken,
          newPassword: password,
        });
        setSuccess(response.data.message);
        setTimeout(() => switchView('login'), 3000);
        return;
      }

      const endpoint = view === 'login' ? '/auth/login' : '/auth/signup';
      const payload = view === 'signup'
        ? { full_name: fullName.trim(), email: email.trim(), password }
        : { email: email.trim(), password };

      const response = await api.post(endpoint, payload);

      if (view === 'signup' && response.data?.requiresVerification) {
        setSuccess(response.data.message);
        return;
      }

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
      const errorType = err.response?.data?.errorType;

      if (errorType === 'unverified' || errorType === 'verification_email_failed') {
        setError('unverified');
      } else if (serverMsg) {
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

  const handleGoogleSuccess = async (credentialResponse: any) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.post('/auth/google', { token: credentialResponse.credential });
      
      if (response.data?.token) {
        localStorage.setItem('token', response.data.token);
        onClose();
        navigate('/dashboard');
      } else {
        throw new Error('No token received from server.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Google authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) {
      setError('Please enter your email to resend verification.');
      return;
    }
    
    setLoading(true);
    try {
      const response = await api.post('/auth/resend-verification', { email: email.trim() });
      setSuccess(response.data.message);
      setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to resend verification email.');
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
          {view === 'login' && 'Welcome back'}
          {view === 'signup' && 'Create account'}
          {view === 'forgot-password' && 'Reset password'}
          {view === 'reset-password' && 'New password'}
        </h2>
        <p className="text-black/60 mb-6 text-sm">
          {view === 'login' && 'Sign in to access your financial dashboard.'}
          {view === 'signup' && 'Start your journey to financial clarity.'}
          {view === 'forgot-password' && 'Enter your email to receive a reset link.'}
          {view === 'reset-password' && 'Please enter your new password below.'}
        </p>

        {/* Error banner */}
        {error && (
          <div className="mb-5 flex flex-col gap-2 bg-rose-50 border border-rose-100 rounded-xl p-3.5 text-xs text-rose-600 font-medium">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error === 'unverified' ? 'Please verify your email before logging in.' : error}</span>
            </div>
            {error === 'unverified' && (
              <button
                type="button"
                onClick={handleResendVerification}
                className="mt-1 self-start px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg transition-colors"
                disabled={loading}
              >
                Resend Verification Email
              </button>
            )}
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
          {view !== 'reset-password' && (
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
          )}

          {/* Password */}
          {view !== 'forgot-password' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-black/80">
                  {view === 'reset-password' ? 'New Password' : 'Password'}
                </label>
                {view === 'login' && (
                  <button 
                    type="button" 
                    onClick={() => switchView('forgot-password')}
                    className="text-xs font-medium text-black hover:underline"
                    tabIndex={-1}
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#F5F5F5] border border-black/5 rounded-xl pl-11 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-transparent transition-all disabled:opacity-60"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  disabled={loading}
                  autoComplete={view === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-black/40 hover:text-black transition-colors"
                  disabled={loading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {(view === 'signup' || view === 'reset-password') && (
                <p className="text-xs text-black/40 mt-1.5 ml-1">Minimum 6 characters</p>
              )}
            </div>
          )}

          {view === 'reset-password' && (
            <div>
              <label className="block text-sm font-medium text-black/80 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#F5F5F5] border border-black/5 rounded-xl pl-11 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-transparent transition-all disabled:opacity-60"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-black/40 hover:text-black transition-colors"
                  disabled={loading}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 bg-black text-white text-sm font-medium px-6 py-3.5 rounded-xl hover:bg-gray-800 transition-colors mt-2 disabled:opacity-55"
          >
            {loading
              ? 'Processing…'
              : view === 'login' ? 'Sign In' 
              : view === 'signup' ? 'Create Account' 
              : view === 'forgot-password' ? 'Send Reset Link'
              : 'Update Password'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        {(view === 'login' || view === 'signup') && (
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-black/10"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-black/40">Or continue with</span>
              </div>
            </div>
            
            <div className="mt-6 flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Google authentication failed.')}
                useOneTap={false}
                shape="rectangular"
                theme="outline"
                size="large"
                text="continue_with"
              />
            </div>
          </div>
        )}

        {(view === 'forgot-password' || view === 'reset-password') ? (
          <div className="mt-7 text-center text-sm text-black/60">
            Remembered your password?{' '}
            <button
              onClick={() => switchView('login')}
              className="text-black font-medium hover:underline"
              disabled={loading}
            >
              Sign in
            </button>
          </div>
        ) : (
          <div className="mt-7 text-center text-sm text-black/60">
            {view === 'login' && (
              <div>
                Don't have an account?{' '}
                <button
                  onClick={() => switchView('signup')}
                  className="text-black font-medium hover:underline"
                  disabled={loading}
                >
                  Sign up free
                </button>
              </div>
            )}
            {view !== 'login' && (
              <div>
                Already have an account?{' '}
                <button
                  onClick={() => switchView('login')}
                  className="text-black font-medium hover:underline"
                  disabled={loading}
                >
                  Log in
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
