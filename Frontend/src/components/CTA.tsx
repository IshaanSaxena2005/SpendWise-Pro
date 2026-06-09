import { ArrowRight } from 'lucide-react';

export function CTA() {
  return (
    <section className="bg-[#1A1A1A] px-6 py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#262626] to-transparent opacity-50"></div>
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium text-white mb-6 leading-tight" style={{ letterSpacing: '-0.03em' }}>
          Start Building Better <br />
          Financial Habits Today
        </h2>
        <p className="text-white/60 text-lg md:text-xl mb-10 max-w-2xl mx-auto">
          Join thousands of users who have taken control of their financial future. Setup takes less than 5 minutes.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a href="/login" className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-white text-black text-base font-medium px-8 py-4 rounded-full hover:bg-gray-100 transition-colors">
            Launch Dashboard
            <span className="bg-black rounded-full p-2">
               <ArrowRight className="w-4 h-4 text-white" />
            </span>
          </a>
          <a href="#about" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-transparent text-white border border-white/20 text-base font-medium px-8 py-4 rounded-full hover:bg-white/5 transition-colors">
            Learn More
          </a>
        </div>
      </div>
    </section>
  );
}
