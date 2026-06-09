import { ArrowRight } from 'lucide-react';

export function Hero({ onOpenAuth }: { onOpenAuth: (view: 'login' | 'signup') => void }) {
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
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur border border-black/10 mb-8">
            <span className="flex h-2 w-2 rounded-full bg-black"></span>
            <span className="text-sm font-medium text-slate-900 tracking-wide uppercase" style={{ fontSize: '11px' }}>
              SpendWise Pro
            </span>
          </div>
          <h1 
            className="text-black text-5xl md:text-7xl font-medium leading-[1.1] max-w-2xl mb-6"
            style={{ letterSpacing: '-0.04em' }}
          >
            AI-Powered Finance Management
          </h1>
          <p 
            className="text-black/70 text-lg md:text-xl max-w-xl mb-10 leading-relaxed font-medium"
            style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
          >
            Track expenses, manage budgets, analyze spending patterns, and make smarter financial decisions with intelligent insights.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <button 
              onClick={() => onOpenAuth('signup')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-black text-white text-base font-medium pl-8 pr-2 py-2 rounded-full hover:bg-gray-800 transition-colors duration-200"
            >
              Get Started
              <span className="bg-white rounded-full p-2">
                <ArrowRight className="w-5 h-5 text-black" />
              </span>
            </button>
            <button 
              onClick={() => onOpenAuth('login')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white/80 backdrop-blur text-black border border-black/10 text-base font-medium px-8 py-3.5 rounded-full hover:bg-white transition-colors duration-200"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
