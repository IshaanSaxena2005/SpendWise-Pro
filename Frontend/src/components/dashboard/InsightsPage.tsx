import { Brain, Flame, ShoppingBag, RefreshCw, TrendingUp, Info } from 'lucide-react';
import { getInsights, getAIScore, getTransactions, getCategories } from '../../lib/store';

type InsightType = 'danger' | 'warning' | 'success' | 'info';

interface InsightStyle {
  bg: string;
  border: string;
  dot: string;
  iconClass: string;
  Icon: React.FC<{ className?: string }>;
}

const INSIGHT_STYLES: Record<InsightType, InsightStyle> = {
  danger:  { bg: 'bg-rose-50',    border: 'border-rose-100',    dot: 'bg-rose-500',    iconClass: 'text-rose-500',    Icon: Flame },
  warning: { bg: 'bg-amber-50',   border: 'border-amber-100',   dot: 'bg-amber-400',   iconClass: 'text-amber-500',   Icon: ShoppingBag },
  success: { bg: 'bg-emerald-50', border: 'border-emerald-100', dot: 'bg-emerald-500', iconClass: 'text-emerald-600', Icon: TrendingUp },
  info:    { bg: 'bg-blue-50',    border: 'border-blue-100',    dot: 'bg-blue-500',    iconClass: 'text-blue-500',    Icon: RefreshCw },
};

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN');
}

export function InsightsPage() {
  const insights     = getInsights();
  const aiScore      = getAIScore();
  const transactions = getTransactions();
  const categories   = getCategories();

  // Top spending categories this month
  const catSpend: Record<number, number> = {};
  transactions
    .filter(t => t.type === 'expense' && t.date.startsWith('2026-06'))
    .forEach(t => {
      catSpend[t.category_id] = (catSpend[t.category_id] || 0) + t.amount;
    });
  const topCats = Object.entries(catSpend)
    .map(([id, total]) => ({ cat: categories.find(c => c.id === parseInt(id)), total }))
    .filter((x): x is { cat: NonNullable<typeof x.cat>; total: number } => !!x.cat)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const scoreLabel = aiScore >= 80 ? 'Excellent' : aiScore >= 70 ? 'Good' : aiScore >= 50 ? 'Fair' : 'Needs Attention';
  const scoreColor = aiScore >= 80 ? 'text-emerald-600' : aiScore >= 70 ? 'text-blue-600' : aiScore >= 50 ? 'text-amber-600' : 'text-rose-500';
  const ringColor  = aiScore >= 80 ? '#10B981' : aiScore >= 70 ? '#3B82F6' : aiScore >= 50 ? '#F59E0B' : '#F43F5E';

  // SVG ring — circle r=40, circumference ≈ 251.33
  const circ   = 251.33;
  const offset = circ - (aiScore / 100) * circ;

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
                className={`rounded-2xl border p-5 flex items-start gap-4 ${style.bg} ${style.border}`}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-white/60">
                  <Icon className={`w-5 h-5 ${style.iconClass}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                    <h3 className="text-sm font-semibold text-black">{ins.title}</h3>
                  </div>
                  <p className="text-sm text-black/60 leading-relaxed">{ins.text}</p>
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
            <div className="relative w-36 h-36 mx-auto mb-4">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#F5F5F5" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="40" fill="none"
                  stroke={ringColor}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-black">{aiScore}</span>
                <span className={`text-xs font-medium ${scoreColor}`}>{scoreLabel}</span>
              </div>
            </div>

            <p className="text-xs text-black/40 leading-relaxed">
              Based on your budget adherence, income diversification, and spending habits.
            </p>
          </div>

          {/* Top Spending */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-black mb-4">Top Spending (June)</h3>
            {topCats.length === 0 ? (
              <p className="text-xs text-black/40">No expense data yet.</p>
            ) : (
              <div className="space-y-3">
                {topCats.map(({ cat, total }, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                      style={{ background: cat.bg }}
                    >
                      {cat.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-black/70">{cat.name}</span>
                        <span className="text-black/50">{fmt(total)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(total / topCats[0].total) * 100}%`,
                            background: cat.color,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Tip */}
          <div className="bg-gradient-to-br from-violet-600 to-violet-800 rounded-2xl p-5 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 opacity-80" />
              <span className="text-xs font-semibold opacity-90 uppercase tracking-wider">AI Tip</span>
            </div>
            <p className="text-sm opacity-90 leading-relaxed">
              Setting a monthly savings goal of 20% of income can significantly improve your
              financial health score over time.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
