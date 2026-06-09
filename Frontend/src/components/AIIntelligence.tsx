import { Brain, TrendingUp, AlertCircle, Activity, Zap } from 'lucide-react';

export function AIIntelligence() {
  return (
    <section id="ai-insights" className="bg-[#1A1A1A] px-6 py-24 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-white/5 rounded-full filter blur-[120px] pointer-events-none"></div>
      
      <div className="max-w-[88rem] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 mb-6">
            <Zap className="w-4 h-4 text-white" />
            <span className="text-sm font-medium text-white">Smart Analysis Engine</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-medium text-white mb-6 leading-tight" style={{ letterSpacing: '-0.02em' }}>
            More Than Tracking. <br />
            True Financial Intelligence.
          </h2>
          <p className="text-white/60 text-lg mb-8 leading-relaxed max-w-lg">
            Our machine learning models don't just show you what you spent—they tell you what it means for your future, automatically finding ways to save.
          </p>
        </div>
        
        <div className="relative h-[600px] rounded-3xl border border-white/10 bg-[#262626] overflow-hidden p-8 flex items-center justify-center shadow-2xl">
          <div className="relative z-10 w-full max-w-md space-y-4">
            
            <div className="bg-[#1A1A1A] p-5 rounded-2xl flex items-start gap-4 border border-white/5 hover:-translate-y-1 hover:border-white/20 transition-all duration-300 shadow-lg">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0 mt-1">
                <TrendingUp className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h4 className="text-white font-medium mb-1">Spending Alert</h4>
                <p className="text-white/70 text-sm leading-relaxed">
                  Food spending increased by <span className="text-white font-semibold">18%</span> this month compared to your usual baseline.
                </p>
              </div>
            </div>

            <div className="bg-[#1A1A1A] p-5 rounded-2xl flex items-start gap-4 border border-white/5 hover:-translate-y-1 hover:border-white/20 transition-all duration-300 shadow-lg relative left-6">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 mt-1">
                <AlertCircle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h4 className="text-white font-medium mb-1">Budget Warning</h4>
                <p className="text-white/70 text-sm leading-relaxed">
                  You may exceed your entertainment budget by <span className="text-white font-semibold">₹1,200</span> by the end of the week.
                </p>
              </div>
            </div>
            
            <div className="bg-[#1A1A1A] p-5 rounded-2xl flex items-start gap-4 border border-white/5 hover:-translate-y-1 hover:border-white/20 transition-all duration-300 shadow-lg">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-1">
                <Brain className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h4 className="text-white font-medium mb-1">Forecast</h4>
                <p className="text-white/70 text-sm leading-relaxed">
                  Predicted spending next month: <span className="text-white font-semibold">₹24,500</span> based on historical recurring charges.
                </p>
              </div>
            </div>

            <div className="bg-[#1A1A1A] p-5 rounded-2xl flex items-start gap-4 border border-white/5 hover:-translate-y-1 hover:border-white/20 transition-all duration-300 shadow-lg relative left-6">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-1">
                <Activity className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h4 className="text-white font-medium mb-1">Health Update</h4>
                <p className="text-white/70 text-sm leading-relaxed">
                  Your financial health score improved by <span className="text-white font-semibold">7 points</span> due to consistent savings.
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
