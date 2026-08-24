import { useState, useEffect, useMemo, useRef } from 'react';
import { TrendingUp, TrendingDown, CreditCard, Target, Wallet, Brain, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { expenseAPI, categoryAPI, budgetAPI, healthAPI, forecastAPI, anomalyAPI, analyticsAPI, goalsAPI, type Transaction, type Category, type Budget, type Forecast, type Anomaly, type Goal } from '../../lib/api';
import { getCategoryIcon, getCategoryBg } from '../../lib/categoryIcons';
import { CategoryEmoji } from './CategoryEmoji';
import { AddTransactionModal } from './AddTransactionModal';
import { subscribeFinanceDataChanged, notifyFinanceDataChanged } from '../../lib/financeEvents';
import { toAmount, computeBudgetUtilization } from '../../lib/budgetUtils';
import { formatDate } from '../../lib/dateUtils';
import { useAuth } from '../../context/AuthContext';

function fmt(n: number | string) {
  return '₹' + Math.floor(toAmount(n)).toLocaleString('en-IN');
}

export function DashboardOverview() {
  const { user } = useAuth();
  const [editTxn, setEditTxn] = useState<Transaction | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingForecast, setLoadingForecast] = useState<boolean>(true);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loadingAnomalies, setLoadingAnomalies] = useState<boolean>(true);
  const [aiScore, setAiScore] = useState<number>(0);
  const [dashboardSummary, setDashboardSummary] = useState<any>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const requestIdRef = useRef(0);

  // Clear state when user changes
  useEffect(() => {
    setTransactions([]);
    setBudgets([]);
    setCategories([]);
    setForecast(null);
    setAnomalies([]);
    setAiScore(0);
    setDashboardSummary(null);
    setGoals([]);
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const currentRequestId = ++requestIdRef.current;

    void (async () => {
      try {
        setLoading(true);
        const [txRes, catRes, budRes, healthRes, summaryRes] = await Promise.all([
          expenseAPI.getAllExpenses(),
          categoryAPI.getAllCategories(),
          budgetAPI.getAllBudgets(),
          healthAPI.getHealthScore(),
          analyticsAPI.getDashboardSummary(),
        ]);

        // Abort if user changed during fetch
        if (cancelled || currentRequestId !== requestIdRef.current) return;

        setTransactions(txRes.data.expenses || []);
        setCategories(catRes.data.categories || []);
        setBudgets(budRes.data.budgets || []);
        setAiScore(healthRes.data.score || 0);
        setDashboardSummary(summaryRes.data.summary || null);
        try { const gRes = await goalsAPI.getAll(); if (!cancelled && currentRequestId === requestIdRef.current) setGoals(gRes.data.goals || []); } catch { /* non-critical */ }
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        if (!cancelled && currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    return subscribeFinanceDataChanged(() => {
      // Re-fetch data on finance data changes
      let cancelled = false;
      const currentRequestId = requestIdRef.current;
      void (async () => {
        try {
          const [txRes, catRes, budRes, healthRes, summaryRes] = await Promise.all([
            expenseAPI.getAllExpenses(),
            categoryAPI.getAllCategories(),
            budgetAPI.getAllBudgets(),
            healthAPI.getHealthScore(),
            analyticsAPI.getDashboardSummary(),
          ]);
          if (!cancelled && currentRequestId === requestIdRef.current) {
            setTransactions(txRes.data.expenses || []);
            setCategories(catRes.data.categories || []);
            setBudgets(budRes.data.budgets || []);
            setAiScore(healthRes.data.score || 0);
            setDashboardSummary(summaryRes.data.summary || null);
            try {
              const gRes = await goalsAPI.getAll();
              if (!cancelled && currentRequestId === requestIdRef.current) {
                setGoals(gRes.data.goals || []);
              }
            } catch { /* non-critical */ }
          }
        } catch (err) {
          console.error('Error refreshing dashboard data:', err);
        }
      })();
      return () => { cancelled = true; };
    });
  }, []);

  // Load Forecast
  useEffect(() => {
    let cancelled = false;
    const currentRequestId = requestIdRef.current;

    void (async () => {
      try {
        setLoadingForecast(true);
        const response = await forecastAPI.getForecast();
        if (!cancelled && currentRequestId === requestIdRef.current) {
          setForecast(response.data);
        }
      } catch (error) {
        console.error('Error fetching forecast:', error);
      } finally {
        if (!cancelled && currentRequestId === requestIdRef.current) {
          setLoadingForecast(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Load Anomalies
  useEffect(() => {
    let cancelled = false;
    const currentRequestId = requestIdRef.current;

    void (async () => {
      try {
        setLoadingAnomalies(true);
        const response = await anomalyAPI.getAnomalyHistory();
        if (!cancelled && currentRequestId === requestIdRef.current) {
          setAnomalies(response.data.anomalies || []);
        }
      } catch (error) {
        console.error('Error fetching anomalies:', error);
        if (!cancelled && currentRequestId === requestIdRef.current) {
          setAnomalies([]);
        }
      } finally {
        if (!cancelled && currentRequestId === requestIdRef.current) {
          setLoadingAnomalies(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleDelete = async (id: number) => {
    if (confirm('Delete this transaction?')) {
      try {
        await expenseAPI.deleteExpense(id);
        notifyFinanceDataChanged();
      } catch (err) {
        console.error('Error deleting transaction:', err);
      }
    }
  };

  // Use dashboard summary for current month totals (consistent with Budgets/Forecast)
  const currentMonthIncome = dashboardSummary?.current_month_income || 0;
  const currentMonthExpenses = dashboardSummary?.current_month_spending || 0;
  const currentMonthBalance = dashboardSummary?.current_month_balance || 0;
  const currentMonthBudgetLeft = dashboardSummary?.budget_remaining || 0;

  // Current month filtering (same logic as BudgetsPage)
  const currentMonthStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }, []);

  const currentMonthBudgets = useMemo(
    () => budgets.filter((b) => {
      const budgetMonth = new Date(b.month);
      const budgetMonthStr = `${budgetMonth.getFullYear()}-${String(budgetMonth.getMonth() + 1).padStart(2, '0')}-01`;
      return budgetMonthStr === currentMonthStr;
    }),
    [budgets, currentMonthStr]
  );

  // Category ordering
  const categoryOrder = ['Overall', 'Food', 'Shopping', 'Entertainment', 'Travel', 'Bills', 'Medical'];

  const orderedBudgets = useMemo(() => {
    return [...currentMonthBudgets].sort((a, b) => {
      const aName = a.category_id ? categories.find((c) => c.id === a.category_id)?.name || 'Overall' : 'Overall';
      const bName = b.category_id ? categories.find((c) => c.id === b.category_id)?.name || 'Overall' : 'Overall';
      const aIndex = categoryOrder.indexOf(aName);
      const bIndex = categoryOrder.indexOf(bName);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });
  }, [currentMonthBudgets, categories]);

  // For recent transactions and budget utilization, use current month data
  const currentMonthTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const isCurrentMonth = new Date(t.expense_date).getMonth() === new Date().getMonth() &&
                            new Date(t.expense_date).getFullYear() === new Date().getFullYear();
      return isCurrentMonth;
    });
  }, [transactions]);

  const expenseOnly = useMemo(() => {
    return currentMonthTransactions.filter((t) => {
      return t.transaction_type === 'expense';
    });
  }, [currentMonthTransactions]);

  // Filter out budgets with 0 spent and 0 budget
  const activeBudgets = useMemo(() => {
    return orderedBudgets.filter((b: Budget) => {
      const { spent, limit: budgetLimit } = computeBudgetUtilization(b, expenseOnly);
      return spent > 0 || budgetLimit > 0;
    });
  }, [orderedBudgets, expenseOnly]);

  // Metric cards data - using current month totals for consistency
  const metricCards = useMemo(() => [
    { label: 'MONTHLY INCOME', value: fmt(currentMonthIncome), sub: '', icon: CreditCard, color: 'text-green-600' },
    { label: 'MONTHLY EXPENSES', value: fmt(currentMonthExpenses), sub: '', icon: TrendingDown, color: 'text-red-500' },
    { label: 'MONTHLY SAVINGS', value: fmt(currentMonthBalance), sub: '', icon: Target, color: 'text-violet-600' },
    { label: 'BUDGET LEFT', value: fmt(currentMonthBudgetLeft), sub: '', icon: Wallet, color: 'text-emerald-600' },
  ], [currentMonthIncome, currentMonthExpenses, currentMonthBalance, currentMonthBudgetLeft]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-black/60">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Page Title */}
      <div>
        <h1 className="text-xl font-semibold text-black tracking-tight">Dashboard</h1>
        <p className="text-sm text-black/50">Here's your financial overview</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {metricCards.map(({ label, value, sub, icon: Icon, color }, i) => (
          <div key={label} style={{ animationDelay: `${i * 60}ms` }} className="card-rise bg-white rounded-2xl p-5 border border-black/5 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl bg-[#F5F5F5] border border-black/5 flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
            </div>
            <span className="text-[10px] font-semibold text-black/40 tracking-widest uppercase block mb-1">{label}</span>
            <div className="text-2xl font-semibold text-black tracking-tight">{value}</div>
            {sub && <div className="text-[11px] text-black/40">{sub}</div>}
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Transactions */}
        <div style={{ animationDelay: '240ms' }} className="card-rise lg:col-span-2 bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
            <h2 className="font-semibold text-black text-sm">Recent Transactions</h2>
            <a href="/dashboard/expenses" className="text-xs text-violet-600 font-medium hover:text-violet-700 transition-colors">View all →</a>
          </div>
          <div className="divide-y divide-black/5 flex-1">
            {currentMonthTransactions.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm text-black/60">No expenses found this month. Create your first expense.</p>
              </div>
            ) : (
              currentMonthTransactions.slice(0, 8).map((t) => {
                const cat = categories.find((c) => c.id === t.category_id);
                return (
                  <div key={t.id} className="flex items-center justify-between px-5 py-3 hover:bg-[#F5F5F5]/60 transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 shadow-sm ${getCategoryBg(cat?.name)}`}>
                        <CategoryEmoji icon={getCategoryIcon(cat)} className="text-lg" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-black leading-none mb-1 group-hover:text-violet-600 transition-colors">{t.note || 'Expense'}</p>
                        <p className="text-[11px] text-black/50 font-medium">{cat?.name || 'Unknown'} <span className="opacity-50 mx-1">•</span> {formatDate(t.expense_date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {t.transaction_type === 'income' ? (
                        <span className="text-sm font-semibold tracking-tight text-green-600">
                          +{fmt(t.amount)}
                        </span>
                      ) : (
                        <span className="text-sm font-semibold tracking-tight text-gray-900">
                          -{fmt(t.amount)}
                        </span>
                      )}
                      <div className="hidden group-hover:flex items-center gap-1">
                        <button onClick={() => setEditTxn(t)} className="p-1.5 text-black/40 hover:text-black hover:bg-black/5 rounded-lg transition-colors">
                          <Brain className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(t.id)} className="p-1.5 text-black/40 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                          <ShieldAlert className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column */}
        <div style={{ animationDelay: '300ms' }} className="card-rise space-y-4">
          {/* AI Financial Health Score */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 relative overflow-hidden group hover:border-violet-200 transition-colors">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500"></div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-black text-sm">Financial Health</h2>
              <Brain className="w-4 h-4 text-violet-600" />
            </div>
            <div className="flex items-center gap-5">
              <div className="relative flex items-center justify-center w-20 h-20 shrink-0">
                <svg className="transform -rotate-90 w-20 h-20 drop-shadow-sm">
                  <circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-black/5" />
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    stroke="url(#healthGradient)"
                    strokeWidth="6"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 34}
                    strokeDashoffset={(2 * Math.PI * 34) - ((aiScore / 100) * (2 * Math.PI * 34))}
                    className="transition-all duration-1000 ease-out stroke-round"
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient id="healthGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={aiScore >= 80 ? '#10B981' : aiScore >= 60 ? '#F59E0B' : '#F43F5E'} />
                      <stop offset="100%" stopColor={aiScore >= 80 ? '#059669' : aiScore >= 60 ? '#D97706' : '#E11D48'} />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-black tracking-tight">{aiScore}</span>
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold text-black mb-0.5">
                  {aiScore >= 80 ? 'Excellent' : aiScore >= 60 ? 'Good' : 'Needs Attention'}
                </div>
                <div className="text-xs text-black/50 leading-relaxed">Your spending is well optimized.</div>
              </div>
            </div>
          </div>

          {/* AI Forecast */}
          <div className="bg-gradient-to-br from-violet-600 to-violet-800 rounded-2xl p-5 text-white shadow-md relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500"></div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium opacity-90">Next Month Forecast</span>
              <TrendingUp className="w-4 h-4 opacity-80" />
            </div>
            {loadingForecast ? (
              <div className="text-sm opacity-80">Loading forecast...</div>
            ) : forecast?.message && !forecast.predicted_spending ? (
              <div className="text-sm opacity-80">{forecast.message}</div>
            ) : (
              <>
                <div className="text-3xl font-bold mb-1 tracking-tight">
                  {forecast?.predicted_spending ? fmt(forecast.predicted_spending) : '—'}
                </div>
                <div className="text-xs font-medium opacity-80 mb-2">
                  {forecast?.is_low_confidence ? 'Low-Confidence Estimate' : 'Predicted Spending'}
                </div>
                {forecast?.is_low_confidence && (
                  <div className="text-[10px] opacity-70 mb-3">
                    Confidence: {forecast.confidence}% • {forecast.message}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-black/20 rounded-xl p-3 backdrop-blur-sm">
                    <div className="text-[10px] font-medium opacity-70 uppercase tracking-wider mb-1">Trend</div>
                    <div className="text-sm font-semibold flex items-center gap-1">
                      {forecast?.trend_direction || '—'}
                      {forecast?.trend_direction === 'Increasing' && '↗'}
                      {forecast?.trend_direction === 'Decreasing' && '↘'}
                      {forecast?.trend_direction === 'Stable' && '→'}
                    </div>
                  </div>
                  <div className="bg-black/20 rounded-xl p-3 backdrop-blur-sm">
                    <div className="text-[10px] font-medium opacity-70 uppercase tracking-wider mb-1">MAE</div>
                    <div className="text-sm font-semibold flex items-center gap-1">
                      {forecast?.mae ? fmt(forecast.mae) : '—'}
                    </div>
                  </div>
                </div>
                {forecast?.rmse && (
                  <div className="mt-3 bg-black/20 rounded-xl p-3 backdrop-blur-sm">
                    <div className="text-[10px] font-medium opacity-70 uppercase tracking-wider mb-1">RMSE</div>
                    <div className="text-sm font-semibold flex items-center gap-1">{fmt(forecast.rmse)}</div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Anomaly Alerts */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 hover:border-black/10 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-black text-sm">Anomaly Alerts</h2>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            {loadingAnomalies ? (
              <div className="text-sm text-black/50">Loading...</div>
            ) : anomalies.length === 0 ? (
              <div className="text-sm text-black/50">No unusual spending detected.</div>
            ) : (
              <div className="space-y-3">
                {anomalies.slice(0, 3).map((anomaly, idx) => (
                  <div key={idx} className="p-3 border border-amber-100 bg-amber-50 rounded-xl">
                    <div className="text-sm font-medium text-amber-900">{anomaly.title}</div>
                    <div className="text-xs text-amber-700 mt-1">{anomaly.description}</div>
                    <div className="text-[10px] text-amber-600 mt-1">{formatDate(anomaly.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Goals Progress Widget */}
          {goals.length > 0 && (
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 hover:border-black/10 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-black text-sm">Goals Progress</h2>
                <a href="/dashboard/goals" className="text-xs text-violet-600 font-medium hover:text-violet-700 transition-colors flex items-center gap-0.5">View All →</a>
              </div>
              <div className="space-y-4">
                {goals.filter(g => !g.is_completed).slice(0, 3).map(g => {
                  const p = g.target_amount > 0 ? Math.min(100, (g.saved_amount / g.target_amount) * 100) : 0;
                  const barColor = p >= 75 ? 'bg-emerald-500' : p >= 50 ? 'bg-violet-500' : p >= 25 ? 'bg-amber-500' : 'bg-rose-500';
                  return (
                    <div key={g.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="category-emoji text-base">{g.icon || '🎯'}</span>
                          <span className="text-xs font-semibold text-black/80 truncate max-w-[110px]">{g.name}</span>
                        </div>
                        <span className="text-xs font-bold text-black/60">{p.toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${p}%` }} />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-black/40">{fmt(g.saved_amount)}</span>
                        <span className="text-[10px] text-black/40">{fmt(g.target_amount)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Recs */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 hover:border-black/10 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-black text-sm">Quick Recommendations</h2>
              <Brain className="w-4 h-4 text-violet-600" />
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100/50">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-emerald-800 leading-relaxed">Great job keeping your spending in check!</p>
              </div>
            </div>
          </div>

          {/* Budget Utilization */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-black text-sm">Budget Utilization</h2>
              <a href="/dashboard/budgets" className="text-xs text-violet-600 font-medium hover:text-violet-700 transition-colors">Edit →</a>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-3">
              {activeBudgets.length === 0 ? (
                <p className="text-sm text-black/60">No budgets found for current month.</p>
              ) : (
                activeBudgets.map((b: Budget) => {
                  const cat = categories.find((c) => c.id === b.category_id);
                  const { spent, limit: budgetLimit, pct, rawPct } = computeBudgetUtilization(b, expenseOnly);
                  const barColor = rawPct < 70 ? 'bg-emerald-500' : rawPct < 90 ? 'bg-orange-500' : 'bg-rose-500';
                  return (
                    <div key={b.id} className="group cursor-pointer">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="font-semibold text-black/80 group-hover:text-black transition-colors">
                          <CategoryEmoji icon={getCategoryIcon(cat || b.category_name)} className="mr-1" />
                          {cat?.name || b.category_name || 'Overall'}
                        </span>
                        <span className="text-black/50 font-medium">
                          {fmt(spent)} <span className="opacity-40">/</span> {fmt(budgetLimit)}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-[#F5F5F5] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-black/40 mt-1 text-right">{Math.round(rawPct)}%</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editTxn && <AddTransactionModal isOpen={true} onClose={() => setEditTxn(null)} editTxn={editTxn} onTransactionChanged={() => setEditTxn(null)} />}
    </div>
  );
}
