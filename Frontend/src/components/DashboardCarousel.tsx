import { useState, useEffect } from 'react';

// Real SpendWise Pro UI screenshots (copied from the repo's screenshots/ folder
// into public/screenshots/ so Vite serves them) — one per preview tab.
const mockups = [
  {
    title: 'Financial Dashboard',
    desc: 'Get an overview of balance metrics, AI health scores, budgets, and recent transactions in real time.',
    img: '/screenshots/dashboard.png'
  },
  {
    title: 'Transaction Management',
    desc: 'Categorize, search, filter, and export transaction lists cleanly.',
    img: '/screenshots/transactions.png'
  },
  {
    title: 'Budget Tracking',
    desc: 'Maintain limits, prevent overspending, and see live category-specific utilization bars.',
    img: '/screenshots/budgets.png'
  },
  {
    title: 'Smart Analytics',
    desc: 'Understand spending trends across multiple months with detailed breakdown lists.',
    img: '/screenshots/analytics.png'
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

        <div className="relative rounded-2xl overflow-hidden bg-[#262626] border border-white/10 shadow-2xl mx-auto max-w-3xl" style={{ height: 'min(42vh, 380px)' }}>
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
    </section>
  );
}
