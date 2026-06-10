import { ArrowRight } from 'lucide-react';

interface CTAProps {
  onOpenAuth: (view: 'login' | 'signup') => void;
}

export function CTA({ onOpenAuth }: CTAProps) {
  return (
    <section className="bg-[#1A1A1A] px-6 py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#262626] to-transparent opacity-50"></div>
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium text-white mb-6 leading-tight" style={{ letterSpacing: '-0.03em' }}>
          Start Managing Money Smarter
        </h2>
        <p className="text-white/60 text-lg md:text-xl mb-10 max-w-2xl mx-auto">
          Join SpendWise Pro and gain complete visibility into your financial life.
        </p>
        
        <div className="flex items-center justify-center">
          <button 
            onClick={() => onOpenAuth('signup')}
            className="inline-flex items-center gap-3 bg-white text-black text-base font-medium px-8 py-4 rounded-full hover:bg-gray-100 transition-colors duration-200"
          >
            Get Started Free
            <span className="bg-black rounded-full p-2">
               <ArrowRight className="w-4 h-4 text-white" />
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
