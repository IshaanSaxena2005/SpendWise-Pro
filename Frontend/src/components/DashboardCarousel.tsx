import { useState, useEffect } from 'react';
import { ArrowUpRight } from 'lucide-react';

// Real SpendWise Pro UI screenshots (copied from the repo's screenshots/ folder
// into public/screenshots/ so Vite serves them) — one per preview tab.
const mockups = [
  {
    title: 'Financial Dashboard',
    desc: 'Get an overview of balance metrics, AI health scores, budgets, and recent transactions in real time.',
    img: '/screenshots/dashboard.png',
    url: 'spendwise.pro/dashboard'
  },
  {
    title: 'Transaction Management',
    desc: 'Categorize, search, filter, and export transaction lists cleanly.',
    img: '/screenshots/transactions.png',
    url: 'spendwise.pro/dashboard/expenses'
  },
  {
    title: 'Budget Tracking',
    desc: 'Maintain limits, prevent overspending, and see live category-specific utilization bars.',
    img: '/screenshots/budgets.png',
    url: 'spendwise.pro/dashboard/budgets'
  },
  {
    title: 'Smart Analytics',
    desc: 'Understand spending trends across multiple months with detailed breakdown lists.',
    img: '/screenshots/analytics.png',
    url: 'spendwise.pro/dashboard/analytics'
  }
];

export function DashboardCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % mockups.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section id="preview" className="bg-[#1A1A1A] px-3 sm:px-6 py-8 md:py-12 relative overflow-hidden">
      <div className="max-w-[88rem] mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-medium text-white mb-3" style={{ letterSpacing: '-0.02em' }}>
            A Dashboard That Works For You
          </h2>
          <p className="text-white/60 text-base max-w-2xl mx-auto">
            Experience complete financial clarity with our intuitive and powerful interface.
          </p>
        </div>

        <div className="flex justify-start md:justify-center gap-3 mb-6 overflow-x-auto flex-nowrap md:flex-wrap [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {mockups.map((m, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`px-3 md:px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 shrink-0 ${
                active === i
                  ? 'bg-white text-black shadow-lg shadow-white/10'
                  : 'bg-white/10 text-white/80 hover:bg-white/15 hover:text-white'
              }`}
            >
              {m.title}
            </button>
          ))}
        </div>

        <div className="relative">
          {/* Decorative accent glow behind the product frame */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] h-[80%] rounded-full bg-violet-600/10 blur-3xl"
          ></div>

          {/* Decorative browser-style product frame */}
          <div className="relative mx-auto max-w-3xl rounded-2xl overflow-hidden border border-white/10 bg-[#111111] shadow-[0_30px_80px_rgba(0,0,0,0.45)] transition-transform duration-500 hover:-translate-y-1">
            {/* Browser chrome (visual mockup only, non-interactive) */}
            <div aria-hidden="true" className="flex items-center gap-3 px-3 sm:px-4 h-9 sm:h-10 bg-[#141414] border-b border-white/10">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-white/15"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-white/15"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-white/15"></span>
              </div>
              <div className="flex-1 min-w-0 flex justify-center">
                <div className="flex items-center rounded-md bg-white/5 border border-white/10 px-3 py-1 max-w-full">
                  <span className="text-[11px] leading-none text-white/40 truncate">{mockups[active].url}</span>
                </div>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-white/25 shrink-0" />
            </div>

            {/* Screenshot viewport — carousel slides unchanged */}
            <div className="relative bg-[#262626]" style={{ height: 'min(42vh, 380px)' }}>
              {mockups.map((m, i) => (
                <div
                  key={i}
                  className={`absolute inset-0 transition-opacity duration-500 ${active === i ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                >
                  <div className="absolute inset-0 bg-[#1A1A1A]/80"></div>
                  <img
                    src={m.img}
                    alt={`SpendWise Pro ${m.title} screen`}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover object-top"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
