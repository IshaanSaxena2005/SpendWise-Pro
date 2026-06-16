import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, CreditCard, Target, Brain, Edit2, Trash2, ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getCategories, type Transaction } from '../../lib/store';
import { useExpenses, deleteExpenseApi } from '../../lib/expenses';
import { useBudgets } from '../../lib/budgets';
import {
  getYearMonth, getPreviousYearMonth,
  computeMonthTotals, computeGrowthPercent, formatHealthRating
} from '../../lib/financeMetrics';
import { AddTransactionModal } from './AddTransactionModal';
import api from '../../lib/api';

function fmt(n: number) {
  return '₹' + Math.floor(n).toLocaleString('en-IN');
}

function shortDate(d: string) {
  const dt = new Date(d);
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()] + ' ' + dt.getDate();
}

interface HealthData {
  score: number | null;
  rating: string;
  recommendations: string[];
}


function HealthSkeleton() {
  return (
    <div className="flex items-center gap-5 animate-pulse">
      <div className="w-20 h-20 rounded-full bg-black/10 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-24 bg-black/10 rounded" />
        <div className="h-3 w-full bg-black/5 rounded" />
        <div className="h-3 w-3/4 bg-black/5 rounded" />
      </div>
    </div>
  );
}

export function DashboardOverview() {
  const [editTxn, setEditTxn] = useState<Transaction | null>(null);
  const { transactions, refresh: refreshExpenses } = useExpenses();
  const { budgets } = useBudgets();
  const categories   = getCategories();

  const [forecast, setForecast] = useState<{
    predicted_spending?: number;
    trend_direction?: string;
    mae?: number;
    rmse?: number;
    message?: string;
  } | null>(null);
  const [loadingForecast, setLoadingForecast] = useState<boolean>(true);

  const [anomalies, setAnomalies] = useState<{
    id: number;
    title: string;
    description: string;
    created_at: string;
    category_name?: string;
  }[]>([]);
  const [loadingAnomalies, setLoadingAnomalies] = useState<boolean>(true);

  const [health, setHealth] = useState<HealthData | null>(null);
  const [loadingHealth, setLoadingHealth] = useState<boolean>(true);
  const [healthError, setHealthError] = useState<boolean>(false);

  useEffect(() => {
    const fetchForecast = async () => {
      try {
        setLoadingForecast(true);
        const response = await api.get('/forecast');
        setForecast(response.data);
      } catch (error) {
        console.error('Error fetching forecast:', error);
      } finally {
        setLoadingForecast(false);
      }
    };
    fetchForecast();
  }, []);

  useEffect(() => {
    const fetchAnomalies = async () => {
      try {
        setLoadingAnomalies(true);
        const response = await api.get('/anomaly/check');
        setAnomalies(response.data.anomalies || []);
      } catch (error) {
        console.error('Error fetching anomalies:', error);
      } finally {
        setLoadingAnomalies(false);
      }
    };
    fetchAnomalies();
  }, []);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        setLoadingHealth(true);
        setHealthError(false);
        const response = await api.get('/health/score');
        if (response.data?.success) {
          setHealth({
            score: response.data.score ?? null,
            rating: response.data.rating,
            recommendations: response.data.recommendations ?? [],
          });
        } else {
          setHealthError(true);
        }
      } catch (error) {
        console.error('Error fetching health score:', error);
        setHealthError(true);
      } finally {
        setLoadingHealth(false);
      }
    };
    fetchHealth();
  }, []);

  const currentMonth = getYearMonth();
  const previousMonth = getPreviousYearMonth();

  const currentTotals = computeMonthTotals(transactions, currentMonth);
  const previousTotals = computeMonthTotals(transactions, previousMonth);

  const totalIncome = currentTotals.income;
  const totalExpenses = currentTotals.expenses;
  const totalBalance = currentTotals.balance;

  const balanceGrowth = computeGrowthPercent(currentTotals.balance, previousTotals.balance);
  const incomeGrowth = computeGrowthPercent(currentTotals.income, previousTotals.income);
  const expenseGrowth = computeGrowthPercent(currentTotals.expenses, previousTotals.expenses);

  const activeBudgets = budgets.filter(b => b.monthly_limit > 0);
  const totalLimit = activeBudgets.reduce((s, b) => s + b.monthly_limit, 0);
  const totalSpent = activeBudgets.reduce((s, b) => s + b.spent, 0);
  const budgetLeft = Math.max(totalLimit - totalSpent, 0);
  const budgetPct  = totalLimit > 0 ? Math.min((totalSpent / totalLimit) * 100, 100) : 0;
  const budgetSub = totalLimit > 0 ? `${Math.round(budgetPct)}% used` : 'Insufficient data';

  const aiScore = health?.score ?? null;
  const healthRating = healthError || !health ? 'N/A' : health.score === null ? 'Insufficient Data' : formatHealthRating(health.rating);
  const healthDescription = healthError
    ? 'Insufficient data'
    : health?.recommendations?.[0] ?? 'Insufficient data';

  const quickRecommendations = health?.recommendations?.slice(0, 2) ?? [];

  const handleDelete = async (id: number) => {
    if (confirm('Delete this transaction?')) {
      try {
        await deleteExpenseApi(id);
        await refreshExpenses();
      } catch {
        alert('Failed to delete transaction.');
      }
    }
  };

  const metricCards = [
    {
      label: 'TOTAL BALANCE',
      value: fmt(totalBalance),
      sub: balanceGrowth.display,
      subTrend: balanceGrowth.trend,
      icon: CreditCard,
      color: 'text-black',
    },
    {
      label: 'TOTAL INCOME',
      value: fmt(totalIncome),
      sub: incomeGrowth.display,
      subTrend: incomeGrowth.trend,
      icon: TrendingDown,
      color: 'text-emerald-600',
    },
    {
      label: 'TOTAL EXPENSES',
      value: fmt(totalExpenses),
      sub: expenseGrowth.display,
      subTrend: expenseGrowth.trend,
      icon: TrendingUp,
      color: 'text-rose-500',
    },
    {
      label: 'BUDGET LEFT',
      value: totalLimit > 0 ? fmt(budgetLeft) : 'N/A',
      sub: budgetSub,
      subTrend: 'neutral' as const,
      icon: Target,
      color: 'text-violet-600',
    },
  ];

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Page Title */}
      <div>
        <h1 className="text-xl font-semibold text-black tracking-tight">Dashboard</h1>
        <p className="text-sm text-black/50">Here's your financial overview</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {metricCards.map(({ label, value, sub, subTrend, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-2xl bg-[#F5F5F5] border border-black/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md ${
                subTrend === 'up' ? 'bg-emerald-50 text-emerald-600' :
                subTrend === 'down' ? 'bg-emerald-50 text-emerald-600' :
                'bg-black/5 text-black/60'
              }`}>
                {subTrend === 'up' ? '↗' : subTrend === 'down' ? '↘' : '→'} {sub}
              </span>
            </div>
            <span className="text-[10px] font-semibold text-black/40 tracking-widest uppercase block mb-1">{label}</span>
            <div className={`text-2xl font-semibold ${color} tracking-tight`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Recent Transactions */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
            <h2 className="font-semibold text-black text-sm">Recent Transactions</h2>
            <a href="/dashboard/expenses" className="text-xs text-violet-600 font-medium hover:text-violet-700 transition-colors">View all →</a>
          </div>
          <div className="divide-y divide-black/5 flex-1">
            {transactions.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-black/50">No transactions yet.</div>
            ) : transactions.slice(0, 8).map(t => {
              const cat = categories.find(c => c.id === t.category_id) || { name: 'Other', icon: '❓', color: '#9CA3AF', bg: '#F3F4F6' };
              return (
                <div key={t.id} className="flex items-center justify-between px-5 py-3 hover:bg-[#F5F5F5]/60 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 shadow-sm" style={{ background: cat.bg }}>{cat.icon}</div>
                    <div>
                      <p className="text-sm font-medium text-black leading-none mb-1 group-hover:text-violet-600 transition-colors">{t.title}</p>
                      <p className="text-[11px] text-black/50 font-medium">{cat.name} <span className="opacity-50 mx-1">•</span> {shortDate(t.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold tracking-tight ${t.type === 'income' ? 'text-emerald-600' : 'text-black'}`}>
                      {t.type === 'income' ? '+' : '-'}{fmt(t.amount)}
                    </span>
                    <div className="hidden group-hover:flex items-center gap-1">
                      <button onClick={() => setEditTxn(t)} className="p-1.5 text-black/40 hover:text-black hover:bg-black/5 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(t.id)} className="p-1.5 text-black/40 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">

          {/* AI Financial Health Score (Circular Gauge) */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 relative overflow-hidden group hover:border-violet-200 transition-colors">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500"></div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-black text-sm">Financial Health</h2>
              <Brain className="w-4 h-4 text-violet-600" />
            </div>

            {loadingHealth ? (
              <HealthSkeleton />
            ) : (
              <div className="flex items-center gap-5">
                {/* Circular Gauge */}
                <div className="relative flex items-center justify-center w-20 h-20 shrink-0">
                  <svg className="transform -rotate-90 w-20 h-20 drop-shadow-sm">
                    <circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-black/5" />
                    {aiScore !== null && (
                      <circle
                        cx="40" cy="40" r="34"
                        stroke="url(#healthGradient)"
                        strokeWidth="6"
                        fill="transparent"
                        strokeDasharray={2 * Math.PI * 34}
                        strokeDashoffset={(2 * Math.PI * 34) - ((aiScore / 100) * (2 * Math.PI * 34))}
                        className="transition-all duration-1000 ease-out stroke-round"
                        strokeLinecap="round"
                      />
                    )}
                    <defs>
                      <linearGradient id="healthGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor={aiScore !== null && aiScore >= 80 ? '#10B981' : aiScore !== null && aiScore >= 60 ? '#F59E0B' : '#F43F5E'} />
                        <stop offset="100%" stopColor={aiScore !== null && aiScore >= 80 ? '#059669' : aiScore !== null && aiScore >= 60 ? '#D97706' : '#E11D48'} />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-xl font-bold text-black tracking-tight">
                      {aiScore !== null ? aiScore : 'N/A'}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-black mb-0.5">
                    {healthRating}
                  </div>
                  <div className="text-xs text-black/50 leading-relaxed">
                    {healthDescription}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* AI Forecast Card */}
          <div className="bg-gradient-to-br from-violet-600 to-violet-800 rounded-2xl p-5 text-white shadow-md relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500"></div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium opacity-90">Next Month Forecast</span>
              <TrendingUp className="w-4 h-4 opacity-80" />
            </div>

            {loadingForecast ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-8 w-32 bg-white/20 rounded" />
                <div className="h-3 w-24 bg-white/10 rounded" />
              </div>
            ) : forecast?.message ? (
              <div className="text-sm opacity-80">{forecast.message}</div>
            ) : (
              <>
                <div className="text-3xl font-bold mb-1 tracking-tight">
                  {forecast?.predicted_spending != null ? `₹${Math.floor(forecast.predicted_spending).toLocaleString('en-IN')}` : 'N/A'}
                </div>
                <div className="text-xs font-medium opacity-80 mb-5">Predicted Spending</div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-black/20 rounded-xl p-3 backdrop-blur-sm">
                    <div className="text-[10px] font-medium opacity-70 uppercase tracking-wider mb-1">Trend</div>
                    <div className="text-sm font-semibold flex items-center gap-1">
                      {forecast?.trend_direction || 'N/A'}
                      {forecast?.trend_direction === 'Increasing' && '↗'}
                      {forecast?.trend_direction === 'Decreasing' && '↘'}
                      {forecast?.trend_direction === 'Stable' && '→'}
                    </div>
                  </div>
                  <div className="bg-black/20 rounded-xl p-3 backdrop-blur-sm">
                    <div className="text-[10px] font-medium opacity-70 uppercase tracking-wider mb-1">MAE</div>
                    <div className="text-sm font-semibold flex items-center gap-1">
                      {forecast?.mae != null ? `₹${Math.floor(forecast.mae).toLocaleString('en-IN')}` : 'N/A'}
                    </div>
                  </div>
                </div>

                {forecast?.rmse != null && (
                  <div className="mt-3 bg-black/20 rounded-xl p-3 backdrop-blur-sm">
                    <div className="text-[10px] font-medium opacity-70 uppercase tracking-wider mb-1">RMSE</div>
                    <div className="text-sm font-semibold flex items-center gap-1">
                      ₹{Math.floor(forecast.rmse).toLocaleString('en-IN')}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Anomaly Alerts Card */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 hover:border-black/10 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-black text-sm">Anomaly Alerts</h2>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            {loadingAnomalies ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-4 w-full bg-black/5 rounded" />
                <div className="h-3 w-3/4 bg-black/5 rounded" />
              </div>
            ) : anomalies.length === 0 ? (
              <div className="text-sm text-black/50">No unusual spending detected.</div>
            ) : (
              <div className="space-y-3">
                {anomalies.slice(0, 3).map((anomaly, idx) => (
                <div key={idx} className="p-3 border border-amber-100 bg-amber-50 rounded-xl">
                  <div className="text-sm font-medium text-amber-900">{anomaly.title}</div>
                  <div className="text-xs text-amber-700 mt-1">{anomaly.description}</div>
                  <div className="text-[10px] text-amber-600 mt-1">{new Date(anomaly.created_at).toLocaleDateString()}</div>
                </div>
              ))}
              </div>
            )}
          </div>

          {/* Quick AI Recommendations */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 hover:border-black/10 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-black text-sm">Quick Recommendations</h2>
              <Brain className="w-4 h-4 text-violet-600" />
            </div>
            {loadingHealth ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-16 bg-black/5 rounded-xl" />
                <div className="h-16 bg-black/5 rounded-xl" />
              </div>
            ) : quickRecommendations.length === 0 ? (
              <div className="text-sm text-black/50">Insufficient data — add transactions and budgets to get recommendations.</div>
            ) : (
              <div className="space-y-3">
                {quickRecommendations.map((text, idx) => {
                  const isWarning = /exceed|over|budget|reduce|stabilise|variation|dominates/i.test(text);
                  const Icon = isWarning ? ShieldAlert : CheckCircle2;
                  const style = isWarning
                    ? 'bg-rose-50 border-rose-100/50 text-rose-800'
                    : 'bg-emerald-50 border-emerald-100/50 text-emerald-800';
                  const iconColor = isWarning ? 'text-rose-500' : 'text-emerald-600';
                  return (
                    <div key={idx} className={`flex items-start gap-3 p-3 rounded-xl border ${style}`}>
                      <Icon className={`w-4 h-4 ${iconColor} shrink-0 mt-0.5`} />
                      <p className="text-xs font-medium leading-relaxed">{text}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Budget Tracker */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-black text-sm">Budget Utilization</h2>
              <a href="/dashboard/budgets" className="text-xs text-violet-600 font-medium hover:text-violet-700 transition-colors">Edit →</a>
            </div>
            {activeBudgets.length === 0 ? (
              <div className="text-sm text-black/50">No budgets set. <a href="/dashboard/budgets" className="text-violet-600 hover:underline">Create one →</a></div>
            ) : (
              <div className="space-y-4">
                {activeBudgets.slice(0, 3).map(b => {
                  const cat = categories.find(c => c.id === b.category_id);
                  const pct = b.monthly_limit > 0 ? Math.min((b.spent / b.monthly_limit) * 100, 100) : 0;
                  const barColor = pct >= 85 ? '#F43F5E' : pct >= 60 ? '#F59E0B' : '#10B981';
                  return (
                    <div key={b.category_id} className="group cursor-pointer">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="font-semibold text-black/80 group-hover:text-black transition-colors">{cat?.name ?? 'Unknown'}</span>
                        <span className="text-black/50 font-medium">{fmt(b.spent)} <span className="opacity-40">/</span> {fmt(b.monthly_limit)}</span>
                      </div>
                      <div className="w-full h-2 bg-[#F5F5F5] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editTxn && (
        <AddTransactionModal isOpen={true} onClose={() => setEditTxn(null)} editTxn={editTxn} onSaved={refreshExpenses} />
      )}
    </div>
  );
}
