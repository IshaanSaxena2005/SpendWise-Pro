import { useState, useEffect } from 'react';

const mockups = [
  {
    title: 'Financial Overview',
    desc: 'See all your accounts, net worth, and recent activity in one place.',
    img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop'
  },
  {
    title: 'Smart Budgets',
    desc: 'Set limits and get real-time alerts before you overspend.',
    img: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2015&auto=format&fit=crop'
  },
  {
    title: 'AI Insights',
    desc: 'Let our algorithms find hidden savings and spending trends.',
    img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop'
  }
];

export function DashboardCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % mockups.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="bg-[#1A1A1A] px-6 py-24 relative overflow-hidden">
      <div className="max-w-[88rem] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-medium text-white mb-6" style={{ letterSpacing: '-0.02em' }}>
            A Dashboard That Works For You
          </h2>
          <p className="text-white/60 text-lg max-w-2xl mx-auto">
            Experience complete financial clarity with our intuitive and powerful interface.
          </p>
        </div>

        <div className="flex justify-center gap-4 mb-12 flex-wrap">
          {mockups.map((m, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`px-6 py-3 rounded-full text-sm font-medium transition-all duration-300 ${
                active === i 
                  ? 'bg-white text-black shadow-lg shadow-white/10' 
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {m.title}
            </button>
          ))}
        </div>

        <div className="relative rounded-3xl overflow-hidden bg-[#262626] border border-white/10 shadow-2xl mx-auto max-w-5xl aspect-video transition-all duration-500">
          {mockups.map((m, i) => (
            <div 
              key={i}
              className={`absolute inset-0 transition-opacity duration-500 flex flex-col justify-end p-8 ${active === i ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A] to-transparent z-10 mix-blend-multiply opacity-80"></div>
              <img src={m.img} alt={m.title} className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-60" />
              <div className="relative z-20 max-w-md">
                <h3 className="text-2xl font-medium text-white mb-2">{m.title}</h3>
                <p className="text-white/80">{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
