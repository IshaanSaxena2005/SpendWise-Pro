import { useState } from 'react';
import { X, Mail, Lock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: 'login' | 'signup';
}

export function AuthModal({ isOpen, onClose, initialView = 'login' }: AuthModalProps) {
  const [view, setView] = useState<'login' | 'signup'>(initialView);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate auth success
    onClose();
    navigate('/dashboard');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-black/40 hover:text-black transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
            <span className="text-white text-sm font-bold tracking-wider">SW</span>
          </div>
          <span className="text-xl font-semibold text-black">SpendWise Pro</span>
        </div>

        <h2 className="text-3xl font-medium text-black mb-2" style={{ letterSpacing: '-0.02em' }}>
          {view === 'login' ? 'Welcome back' : 'Create an account'}
        </h2>
        <p className="text-black/60 mb-8">
          {view === 'login' ? 'Enter your details to access your dashboard.' : 'Start your journey to financial clarity.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-black/80 mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-black/40" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#F5F5F5] border border-black/5 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-transparent transition-all"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-black/80 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-black/40" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#F5F5F5] border border-black/5 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-transparent transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button 
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 bg-black text-white text-base font-medium px-6 py-3.5 rounded-xl hover:bg-gray-800 transition-colors mt-4"
          >
            {view === 'login' ? 'Sign In' : 'Sign Up'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-black/60">
          {view === 'login' ? (
            <>
              Don't have an account?{' '}
              <button onClick={() => setView('signup')} className="text-black font-medium hover:underline">
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => setView('login')} className="text-black font-medium hover:underline">
                Log in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
