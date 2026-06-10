import { useEffect, useRef } from 'react';

export function About() {
  const steps = [
    { num: '01', title: 'Add Expenses', desc: 'Track daily spending across categories.' },
    { num: '02', title: 'Set Budgets', desc: 'Define monthly limits and financial goals.' },
    { num: '03', title: 'Analyze Spending', desc: 'Visualize trends and spending behavior.' },
    { num: '04', title: 'AI Predictions', desc: 'Forecast future expenses using machine learning.' },
    { num: '05', title: 'Smart Insights', desc: 'Receive recommendations and anomaly alerts.' }
  ];

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cards = containerRef.current?.querySelectorAll('.reveal-card');
    if (!cards) return;

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
      { threshold: 0.15 }
    );

    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="about" className="bg-white px-6 py-24 border-y border-black/5">
      <div className="max-w-[1400px] mx-auto">
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-medium text-black mb-4" style={{ letterSpacing: '-0.02em' }}>
            How SpendWise Works
          </h2>
          <p className="text-black/60 text-lg">
            Transform raw financial data into actionable intelligence.
          </p>
        </div>

        {/* Horizontal Timeline / Process flow */}
        <div ref={containerRef} className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {steps.map((step, i) => (
            <div
              key={i}
              data-delay={String(i * 110)}
              className="reveal-card bg-[#F5F5F5] rounded-3xl p-8 border border-black/5 hover:border-black/20 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col items-start relative overflow-hidden cursor-default"
            >
              <div className="absolute top-4 right-6 text-7xl font-extrabold text-black/5 select-none">
                {step.num}
              </div>
              <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center font-bold text-sm mb-6 transition-transform duration-300 group-hover:scale-110">
                {step.num}
              </div>
              <h3 className="font-semibold text-black text-lg mb-2 z-10">{step.title}</h3>
              <p className="text-black/50 text-sm leading-relaxed z-10">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
