import { useState, useEffect } from 'react';
import { Brain, Flame, ShoppingBag, RefreshCw, TrendingUp, Info } from 'lucide-react';
import { expenseAPI, budgetAPI, healthAPI, analyticsAPI } from '../../lib/api';
import type { Transaction, Budget, CategoryBreakdownItem } from '../../lib/api';
import { getCategoryIcon } from '../../lib/categoryIcons';
import { CategoryEmoji } from './CategoryEmoji';

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

const generateDynamicInsights = (
  transactions: Transaction[],
  budgets: Budget[],
  categoryBreakdown: { category: string; total: number }[],
  healthScore: number
) => {
  const insights: { type: InsightType; title: string; text: string }[] = [];

  // Calculate totals
  const totalExpenses = transactions
    .filter(t => t.transaction_type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const incomeTransactions = transactions.filter(t => t.transaction_type === 'income');
  const totalIncome = incomeTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  // 1. Savings Rate Insight
  if (totalIncome > 0) {
    if (savingsRate >= 20) {
      insights.push({
        type: 'success',
        title: 'Excellent Savings Rate',
        text: `You're saving ${savingsRate.toFixed(1)}% of your income. This is above the recommended 20% threshold!`,
      });
    } else if (savingsRate >= 10) {
      insights.push({
        type: 'info',
        title: 'Moderate Savings Rate',
        text: `Your savings rate is ${savingsRate.toFixed(1)}%. Aim to increase it to 20% for better financial security.`,
      });
    } else if (savingsRate < 0) {
      insights.push({
        type: 'danger',
        title: 'Negative Savings Rate',
        text: `You're spending more than you earn by ${Math.abs(savingsRate).toFixed(1)}%. Review your expenses urgently.`,
      });
    }
  }

  // 2. Budget Adherence Insight
  if (budgets.length > 0) {
    const overBudgetCount = budgets.filter(b => {
      const spent = transactions
        .filter(t => t.category_id === b.category_id)
        .reduce((sum, t) => sum + Number(t.amount), 0);
      return spent > Number(b.amount_limit);
    }).length;

    if (overBudgetCount === 0) {
      insights.push({
        type: 'success',
        title: 'Perfect Budget Adherence',
        text: `All ${budgets.length} budgets are within limits. Great discipline in managing your spending!`,
      });
    } else if (overBudgetCount === 1) {
      insights.push({
        type: 'warning',
        title: 'Budget Exceeded',
        text: `One budget has been exceeded. Review that category to get back on track.`,
      });
    } else {
      insights.push({
        type: 'danger',
        title: 'Multiple Budgets Exceeded',
        text: `${overBudgetCount} budgets have been exceeded. Prioritize reviewing your spending habits.`,
      });
    }
  } else if (transactions.length > 0) {
    insights.push({
      type: 'warning',
      title: 'No Budgets Set',
      text: 'You have transactions but no budgets set. Create budgets to track your spending more effectively.',
    });
  }

  // 3. Highest Spending Category
  if (categoryBreakdown.length > 0) {
    const topCategory = categoryBreakdown[0];
    const totalSpending = categoryBreakdown.reduce((sum, c) => sum + c.total, 0);
    const percentage = totalSpending > 0 ? (topCategory.total / totalSpending) * 100 : 0;
    
    insights.push({
      type: 'info',
      title: 'Top Spending Category',
      text: `${getCategoryIcon(topCategory.category)} ${topCategory.category} accounts for ${percentage.toFixed(1)}% of your spending (₹${Math.round(topCategory.total).toLocaleString('en-IN')}).`,
    });
  }

  // 4. Income Stability
  if (incomeTransactions.length >= 2) {
    const monthlyIncome: Record<string, number> = {};
    incomeTransactions.forEach(t => {
      const month = t.expense_date?.substring(0, 7) || 'unknown';
      monthlyIncome[month] = (monthlyIncome[month] || 0) + Number(t.amount);
    });
    
    const incomeValues = Object.values(monthlyIncome);
    const avgIncome = incomeValues.reduce((a, b) => a + b, 0) / incomeValues.length;
    const variance = incomeValues.reduce((sum, val) => sum + Math.pow(val - avgIncome, 2), 0) / incomeValues.length;
    const cv = avgIncome > 0 ? Math.sqrt(variance) / avgIncome : 0;

    if (cv < 0.1) {
      insights.push({
        type: 'success',
        title: 'Stable Income',
        text: 'Your income is very stable month-to-month. This consistency helps with financial planning.',
      });
    } else if (cv < 0.25) {
      insights.push({
        type: 'info',
        title: 'Moderate Income Variation',
        text: 'Your income varies moderately. Consider building an emergency fund for stability.',
      });
    } else {
      insights.push({
        type: 'warning',
        title: 'Variable Income',
        text: 'Your income fluctuates significantly. Build a larger emergency buffer (3-6 months expenses).',
      });
    }
  }

  // 5. Monthly Spending Trend
  if (transactions.length >= 2) {
    const monthlySpending: Record<string, number> = {};
    transactions
      .filter(t => t.transaction_type === 'expense')
      .forEach(t => {
        const month = t.expense_date?.substring(0, 7) || 'unknown';
        monthlySpending[month] = (monthlySpending[month] || 0) + Number(t.amount);
      });

    const months = Object.keys(monthlySpending).sort();
    if (months.length >= 2) {
      const lastMonth = monthlySpending[months[months.length - 1]] || 0;
      const prevMonth = monthlySpending[months[months.length - 2]] || 0;
      const trend = prevMonth > 0 ? ((lastMonth - prevMonth) / prevMonth) * 100 : 0;

      if (trend > 10) {
        insights.push({
          type: 'warning',
          title: 'Spending Increasing',
          text: `Your spending increased by ${trend.toFixed(1)}% compared to last month. Review discretionary expenses.`,
        });
      } else if (trend < -10) {
        insights.push({
          type: 'success',
          title: 'Spending Decreased',
          text: `Great job! Your spending decreased by ${Math.abs(trend).toFixed(1)}% compared to last month.`,
        });
      } else {
        insights.push({
          type: 'info',
          title: 'Stable Spending',
          text: 'Your spending is relatively stable month-to-month, indicating good financial discipline.',
        });
      }
    }
  }

  // 6. Financial Health Score
  if (healthScore >= 80) {
    insights.push({
      type: 'success',
      title: 'Excellent Financial Health',
      text: `Your financial health score is ${healthScore}/100. Keep up the great work with budgeting and saving!`,
    });
  } else if (healthScore >= 60) {
    insights.push({
      type: 'info',
      title: 'Good Financial Health',
      text: `Your financial health score is ${healthScore}/100. Small improvements could push it to excellent.`,
    });
  } else if (healthScore >= 40) {
    insights.push({
      type: 'warning',
      title: 'Fair Financial Health',
      text: `Your financial health score is ${healthScore}/100. Focus on budget adherence and spending consistency.`,
    });
  } else {
    insights.push({
      type: 'danger',
      title: 'Financial Health Needs Attention',
      text: `Your financial health score is ${healthScore}/100. Prioritize setting budgets and tracking expenses.`,
    });
  }

  // 7. Data Volume Reminder
  if (transactions.length < 5) {
    insights.push({
      type: 'info',
      title: 'Add More Transactions',
      text: 'Add more transactions to unlock more detailed AI insights and analysis.',
    });
  }

  return insights.length > 0 ? insights.slice(0, 8) : [];
};

export function InsightsPage() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ category: string; total: number }[]>([]);
  const [aiScore, setAiScore] = useState(0);
  const [healthFactors, setHealthFactors] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setLoading(true);
        const [txRes, budRes, healthRes, catBreakdownRes] = await Promise.all([
          expenseAPI.getAllExpenses(),
          budgetAPI.getAllBudgets(),
          healthAPI.getHealthScore(),
          analyticsAPI.getCategoryBreakdown(),
        ]);

        if (cancelled) return;

        const txData = txRes.data.expenses || [];
        const budData = budRes.data.budgets || [];

        const byCategory = catBreakdownRes.data.breakdown
          ? catBreakdownRes.data.breakdown
              .map((item: CategoryBreakdownItem) => ({
                category: item.category_name,
                total: item.total_amount,
              }))
              .sort((a, b) => b.total - a.total)
          : [];

        setTransactions(txData);
        setBudgets(budData);
        setCategoryBreakdown(byCategory);
        setAiScore(healthRes.data.score || 0);
        setHealthFactors(healthRes.data.factors || null);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const insights = generateDynamicInsights(transactions, budgets, categoryBreakdown, aiScore);

  const scoreLabel = aiScore >= 80 ? 'Excellent' : aiScore >= 70 ? 'Good' : aiScore >= 50 ? 'Fair' : 'Needs Attention';
  const scoreColor = aiScore >= 80 ? 'text-emerald-600' : aiScore >= 70 ? 'text-blue-600' : aiScore >= 50 ? 'text-amber-600' : 'text-rose-500';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-black/60">Loading AI Insights...</div>
      </div>
    );
  }

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
            const Icon = style.Icon;
            return (
              <div
                key={`${ins.type}-${ins.title}-${i}`}
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
                  </div>
                </div>
              </div>
            );
          })}

          {insights.length === 0 && (
            <div className="bg-white rounded-2xl border border-black/5 p-12 text-center">
              <Info className="w-8 h-8 text-black/20 mx-auto mb-3" />
              <p className="text-sm text-black/40">
                Add more financial data to generate AI insights.
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

            <p className="text-xs text-black/40 leading-relaxed mb-4">
              Based on your budget adherence, spending consistency, and activity.
            </p>

            {/* Health Score Breakdown */}
            {healthFactors && (
              <div className="space-y-3 pt-3 border-t border-black/5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-black/60 font-medium">Budget Adherence</span>
                  <span className="text-black font-semibold">{healthFactors.budgetAdherence.score}/{healthFactors.budgetAdherence.maxScore}</span>
                </div>
                <div className="h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${(healthFactors.budgetAdherence.score / healthFactors.budgetAdherence.maxScore) * 100}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-black/60 font-medium">Spending Control</span>
                  <span className="text-black font-semibold">{healthFactors.spendingConsistency.score}/{healthFactors.spendingConsistency.maxScore}</span>
                </div>
                <div className="h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${(healthFactors.spendingConsistency.score / healthFactors.spendingConsistency.maxScore) * 100}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-black/60 font-medium">Category Balance</span>
                  <span className="text-black font-semibold">{healthFactors.categoryBalance.score}/{healthFactors.categoryBalance.maxScore}</span>
                </div>
                <div className="h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-500"
                    style={{ width: `${(healthFactors.categoryBalance.score / healthFactors.categoryBalance.maxScore) * 100}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-black/60 font-medium">Expense Activity</span>
                  <span className="text-black font-semibold">{healthFactors.expenseActivity.score}/{healthFactors.expenseActivity.maxScore}</span>
                </div>
                <div className="h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${(healthFactors.expenseActivity.score / healthFactors.expenseActivity.maxScore) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Top Spending Categories */}
          {categoryBreakdown.length > 0 && (
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-black mb-4">Top Spending Categories</h3>
              <div className="space-y-3">
                {categoryBreakdown.slice(0, 3).map((cat, i) => {
                  const total = categoryBreakdown.reduce((sum, c) => sum + c.total, 0);
                  const percentage = total > 0 ? (cat.total / total) * 100 : 0;
                  const colors = ['bg-rose-500', 'bg-amber-500', 'bg-violet-500'];
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-black/70">
                          <CategoryEmoji icon={getCategoryIcon(cat.category)} className="mr-1" />
                          {cat.category}
                        </span>
                        <span className="text-black">₹{Math.round(cat.total).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="h-2 bg-[#F5F5F5] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colors[i % colors.length]} transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
