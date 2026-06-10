import { useState, useEffect } from 'react';

const mockups = [
  {
    title: 'Financial Dashboard',
    desc: 'Get an overview of balance metrics, AI health scores, budgets, and recent transactions in real time.',
    // Data/analytics overview dashboard
    img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop'
  },
  {
    title: 'Transaction Management',
    desc: 'Categorize, search, filter, and export transaction lists cleanly.',
    // Receipt / payment / expense tracking
    img: 'https://images.unsplash.com/photo-1556742111-a301076d9d18?q=80&w=2070&auto=format&fit=crop'
  },
  {
    title: 'Budget Tracking',
    desc: 'Maintain limits, prevent overspending, and see live category-specific utilization bars.',
    // Budget planning / savings / financial goal
    img: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?q=80&w=2072&auto=format&fit=crop'
  },
  {
    title: 'Smart Analytics',
    desc: 'Understand spending trends across multiple months with detailed breakdown lists.',
    // Charts, graphs, financial data analysis
    img: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2015&auto=format&fit=crop'
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
    <section id="preview" className="bg-[#1A1A1A] px-6 py-12 relative overflow-hidden">
      <div className="max-w-[88rem] mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-medium text-white mb-3" style={{ letterSpacing: '-0.02em' }}>
            A Dashboard That Works For You
          </h2>
          <p className="text-white/60 text-base max-w-2xl mx-auto">
            Experience complete financial clarity with our intuitive and powerful interface.
          </p>
        </div>

        <div className="flex justify-center gap-3 mb-6 flex-wrap">
          {mockups.map((m, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                active === i
                  ? 'bg-white text-black shadow-lg shadow-white/10'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
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
              className={`absolute inset-0 transition-opacity duration-500 flex flex-col justify-end p-6 ${active === i ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A] to-transparent z-10 mix-blend-multiply opacity-80"></div>
              <img src={m.img} alt={m.title} className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-60" />
              <div className="relative z-20 max-w-md">
                <h3 className="text-xl font-medium text-white mb-1">{m.title}</h3>
                <p className="text-white/75 text-sm">{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
