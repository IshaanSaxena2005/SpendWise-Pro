import { useEffect, useRef } from 'react';
import { Key, Receipt, Target, BarChart3, BrainCircuit, ShieldAlert } from 'lucide-react';

export function ProjectHighlights() {
  const cards = [
    {
      title: 'JWT Authentication',
      desc: 'Secure user login and protected routes.',
      icon: <Key className="w-5 h-5 text-black" />
    },
    {
      title: 'Expense Management',
      desc: 'Create, update, delete, and manage transactions.',
      icon: <Receipt className="w-5 h-5 text-black" />
    },
    {
      title: 'Budget Management',
      desc: 'Monitor category budgets and spending limits.',
      icon: <Target className="w-5 h-5 text-black" />
    },
    {
      title: 'Financial Health Score',
      desc: 'Evaluate overall financial discipline.',
      icon: <BarChart3 className="w-5 h-5 text-black" />
    },
    {
      title: 'AI Spending Forecast',
      desc: 'Predict future expenses using machine learning.',
      icon: <BrainCircuit className="w-5 h-5 text-black" />
    },
    {
      title: 'Anomaly Detection',
      desc: 'Detect unusual spending patterns automatically.',
      icon: <ShieldAlert className="w-5 h-5 text-black" />
    }
  ];

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cardEls = containerRef.current?.querySelectorAll('.reveal-card');
    if (!cardEls) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const delay = parseInt(el.dataset.delay || '0');
            setTimeout(() => {
              el.classList.add('is-visible');
            }, delay);
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.12 }
    );

    cardEls.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);

  return (
    <section className="bg-white px-6 py-24 border-b border-black/5">
      <div className="max-w-[1400px] mx-auto">
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-medium text-black mb-4" style={{ letterSpacing: '-0.02em' }}>
            Project Highlights
          </h2>
          <p className="text-black/60 text-lg">
            Core features engineered for stability, scale, and performance.
          </p>
        </div>

        <div ref={containerRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {cards.map((card, i) => (
            <div
              key={i}
              data-delay={String(i * 90)}
              className="reveal-card bg-[#F5F5F5] rounded-3xl p-8 border border-black/5 hover:border-black/20 hover:shadow-lg hover:-translate-y-1.5 transition-all duration-300 flex flex-col items-start cursor-default"
            >
              <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center mb-6 shadow-sm border border-black/5 transition-transform duration-300 hover:scale-110">
                {card.icon}
              </div>
              <h3 className="font-semibold text-black text-lg mb-2">{card.title}</h3>
              <p className="text-black/50 text-sm leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
