import { Brain, AlertCircle, Activity, Zap } from 'lucide-react';

export function AIIntelligence() {
  const cards = [
    {
      title: 'AI Spending Forecast',
      desc: 'Predict future expenses using machine learning.',
      icon: <Activity className="w-5 h-5 text-blue-400" />,
      bg: 'bg-blue-500/10'
    },
    {
      title: 'Budget Breach Prediction',
      desc: 'Get alerted before exceeding your monthly budget.',
      icon: <AlertCircle className="w-5 h-5 text-amber-400" />,
      bg: 'bg-amber-500/10'
    },
    {
      title: 'Anomaly Detection',
      desc: 'Detect unusual spending patterns automatically.',
      icon: <Brain className="w-5 h-5 text-rose-400" />,
      bg: 'bg-rose-500/10'
    }
  ];

  return (
    <section id="ai-insights" className="bg-[#1A1A1A] px-6 py-24 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-white/5 rounded-full filter blur-[120px] pointer-events-none"></div>
      
      <div className="max-w-[88rem] mx-auto relative z-10">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 mb-6">
            <Zap className="w-4 h-4 text-white animate-pulse" />
            <span className="text-sm font-medium text-white">Smart Analysis Engine</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-medium text-white mb-6 leading-tight" style={{ letterSpacing: '-0.02em' }}>
            True Financial Intelligence
          </h2>
          <p className="text-white/60 text-lg max-w-xl mx-auto leading-relaxed">
            Our machine learning models analyze spending patterns to keep you on track.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {cards.map((card, i) => (
            <div 
              key={i} 
              className="bg-[#262626] p-8 rounded-3xl border border-white/10 hover:-translate-y-1 hover:border-white/20 transition-all duration-300 shadow-xl flex flex-col items-start"
            >
              <div className={`w-12 h-12 rounded-2xl ${card.bg} flex items-center justify-center mb-6`}>
                {card.icon}
              </div>
              <h4 className="text-white font-semibold text-lg mb-2">{card.title}</h4>
              <p className="text-white/60 text-sm leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
