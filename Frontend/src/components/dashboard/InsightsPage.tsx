import { Brain, Flame, ShoppingBag, RefreshCw, TrendingUp, Info } from 'lucide-react';
import { getInsights, getAIScore } from '../../lib/store';

type InsightType = 'danger' | 'warning' | 'success' | 'info';

interface InsightStyle {
  bg: string;
  border: string;
  dot: string;
  iconClass: string;
  Icon: React.FC<{ className?: string }>;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  confidence: number;
}

const INSIGHT_STYLES: Record<InsightType, InsightStyle> = {
  danger:  { bg: 'bg-rose-50',    border: 'border-rose-100',    dot: 'bg-rose-500',    iconClass: 'text-rose-500',    Icon: Flame,       severity: 'HIGH',   category: 'Budget Alert', confidence: 92 },
  warning: { bg: 'bg-amber-50',   border: 'border-amber-100',   dot: 'bg-amber-400',   iconClass: 'text-amber-500',   Icon: ShoppingBag, severity: 'MEDIUM', category: 'Spending Pattern', confidence: 85 },
  success: { bg: 'bg-emerald-50', border: 'border-emerald-100', dot: 'bg-emerald-500', iconClass: 'text-emerald-600', Icon: TrendingUp,  severity: 'LOW',    category: 'Forecast', confidence: 94 },
  info:    { bg: 'bg-blue-50',    border: 'border-blue-100',    dot: 'bg-blue-500',    iconClass: 'text-blue-500',    Icon: RefreshCw,   severity: 'LOW',    category: 'Anomaly Detection', confidence: 88 },
};



export function InsightsPage() {
  const insights     = getInsights();
  const aiScore      = getAIScore();

  const scoreLabel = aiScore >= 80 ? 'Excellent' : aiScore >= 70 ? 'Good' : aiScore >= 50 ? 'Fair' : 'Needs Attention';
  const scoreColor = aiScore >= 80 ? 'text-emerald-600' : aiScore >= 70 ? 'text-blue-600' : aiScore >= 50 ? 'text-amber-600' : 'text-rose-500';


  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-black tracking-tight">AI Insights</h1>
        <p className="text-sm text-black/50">Intelligent recommendations to improve your finances</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left — Insights Feed */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-black/60 uppercase tracking-wider">Recommendations</h2>

          {insights.map((ins, i) => {
            const style = INSIGHT_STYLES[ins.type as InsightType] ?? INSIGHT_STYLES.info;
            const Icon  = style.Icon;
            return (
              <div
                key={i}
                className={`rounded-2xl border p-5 flex flex-col md:flex-row items-start gap-4 ${style.bg} ${style.border} group transition-all hover:shadow-md`}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-white shadow-sm border border-black/5">
                  <Icon className={`w-5 h-5 ${style.iconClass}`} />
                </div>
                <div className="flex-1 w-full">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot} animate-pulse`} />
                      <h3 className="text-sm font-semibold text-black">{ins.title}</h3>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider uppercase">
                      <span className={`px-2 py-1 rounded-md bg-white border border-black/5 ${
                        style.severity === 'HIGH' ? 'text-rose-600' :
                        style.severity === 'MEDIUM' ? 'text-amber-600' : 'text-emerald-600'
                      }`}>
                        {style.severity}
                      </span>
                      <span className="px-2 py-1 rounded-md bg-white border border-black/5 text-black/60">
                        Confidence: {style.confidence}%
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-black/70 leading-relaxed mb-3">{ins.text}</p>
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center px-2 py-1 bg-black/5 rounded-md text-[10px] font-semibold text-black/50 uppercase tracking-widest">
                      {style.category}
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="text-[11px] font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors">
                        {style.severity === 'HIGH' ? 'Create Budget' : 'View Transactions'}
                      </button>
                      <button className="text-[11px] font-semibold text-black/40 hover:text-black/60 hover:bg-black/5 px-3 py-1.5 rounded-lg transition-colors">
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {insights.length === 0 && (
            <div className="bg-white rounded-2xl border border-black/5 p-12 text-center">
              <Info className="w-8 h-8 text-black/20 mx-auto mb-3" />
              <p className="text-sm text-black/40">
                No insights yet. Add more transactions to unlock AI analysis.
              </p>
            </div>
          )}
        </div>

        {/* Right — Score + Top Categories */}
        <div className="space-y-4">

          {/* AI Health Score Card */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-5">
              <Brain className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-semibold text-black">Financial Health Score</span>
            </div>

            {/* Animated SVG ring */}
            <div className="relative flex items-center justify-center w-36 h-36 mx-auto mb-4">
              <svg className="transform -rotate-90 w-36 h-36 drop-shadow-sm">
                <circle cx="72" cy="72" r="60" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-black/5" />
                <circle cx="72" cy="72" r="60" stroke="url(#insightsHealthGradient)" strokeWidth="10" fill="transparent" strokeDasharray={2 * Math.PI * 60} strokeDashoffset={(2 * Math.PI * 60) - ((aiScore / 100) * (2 * Math.PI * 60))} className="transition-all duration-1000 ease-out stroke-round" strokeLinecap="round" />
                <defs>
                  <linearGradient id="insightsHealthGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={aiScore >= 80 ? '#10B981' : aiScore >= 60 ? '#F59E0B' : '#F43F5E'} />
                    <stop offset="100%" stopColor={aiScore >= 80 ? '#059669' : aiScore >= 60 ? '#D97706' : '#E11D48'} />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-black tracking-tight">{aiScore}</span>
                <span className={`text-xs font-semibold uppercase tracking-wider mt-1 ${scoreColor}`}>{scoreLabel}</span>
              </div>
            </div>

            <p className="text-xs text-black/40 leading-relaxed">
              Based on your budget adherence, income diversification, and spending habits.
            </p>
          </div>

          {/* AI Tip (Moved Higher) */}
          <div className="bg-[#F5F5F5] rounded-2xl p-5 border border-black/5">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-black/40" />
              <span className="text-xs font-bold text-black/50 uppercase tracking-wider">AI Tip</span>
            </div>
            <p className="text-sm font-medium text-black/70 leading-relaxed">
              Setting a monthly savings goal of 20% of income can significantly improve your
              financial health score over time.
            </p>
          </div>

          {/* Premium AI Suggestion Card */}
          <div className="bg-gradient-to-br from-violet-600 to-violet-900 rounded-2xl p-6 shadow-md relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full -z-0 group-hover:scale-110 transition-transform duration-500"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold text-violet-200 uppercase tracking-widest border border-violet-400/30 px-2 py-1 rounded-md">
                  AI Suggestion
                </span>
                <Brain className="w-4 h-4 text-violet-300" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2 tracking-tight">Cook 3x weekly</h3>
              <p className="text-sm text-violet-100/80 leading-relaxed mb-5">
                Your restaurant spending is unusually high. Cooking at home just 3 more times a week could save you significantly.
              </p>
              <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs font-medium text-white/70">Potential Savings:</span>
                <span className="text-sm font-bold text-emerald-400 tracking-tight">₹2,400/month</span>
              </div>
            </div>
          </div>

          {/* Top Spending */}

        </div>
      </div>
    </div>
  );
}
