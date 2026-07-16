import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { DEMO_EMAIL } from '../lib/constants';

const DEMO_PASSWORD = 'SpendWiseDemo@2026';

export function Hero() {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleDemoLogin = async () => {
    try {
      setIsLoading(true);
      
      const response = await api.post('/auth/login', {
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD
      });

      if (response.data.success && response.data.token) {
        localStorage.setItem('token', response.data.token);
        navigate('/dashboard');
      } else {
        console.error('Demo login failed:', response.data);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Demo login error:', error);
      setIsLoading(false);
    }
  };

  return (
    <section className="flex-1 px-6 pt-24 pb-6 flex items-end">
      <div className="relative w-full rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>
        <video 
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260423_161253_c72b1869-400f-45ed-ac0c-52f68c2ed5bd.mp4"
          autoPlay muted loop playsInline
          className="object-cover absolute inset-0 w-full h-full"
        />
        
        <div className="absolute inset-0 bg-white/10"></div>

        <div className="relative z-10 flex flex-col items-start justify-start h-full p-10 md:p-16 pt-24 md:pt-32">
          <h1 
            className="text-black text-5xl md:text-7xl font-medium leading-[1.1] max-w-2xl mb-6"
            style={{ letterSpacing: '-0.04em' }}
          >
            Take Control of Every Rupee You Spend
          </h1>
          <p 
            className="text-black/70 text-lg md:text-xl max-w-xl mb-10 leading-relaxed font-medium"
            style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
          >
            Track expenses, manage budgets, forecast future spending, and receive AI-powered financial insights—all in one intelligent platform.
          </p>
          <button
            onClick={handleDemoLogin}
            disabled={isLoading}
            className="inline-flex items-center gap-2 bg-black text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-gray-800 transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing into Demo...
              </>
            ) : (
              <>
                🚀 Try Live Demo
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
