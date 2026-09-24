import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Target, TrendingUp, Wallet, Edit2, Trash2, X, Check, ArrowRight, CheckCircle2 } from 'lucide-react';
import { BUTTON_VARIANTS } from './DashboardOverview';
import { budgetAPI, categoryAPI, expenseAPI, type Budget, type Category, type Transaction } from '../../lib/api';
import { formatCategoryLabel, getCategoryIcon, getCategoryBg } from '../../lib/categoryIcons';
import { CategoryEmoji } from './CategoryEmoji';
import {
  normalizeBudgetMonth,
  computeBudgetSummary,
  computeBudgetUtilization,
  computeBudgetAlerts,
  formatBudgetCurrency,
  getBudgetBarColor,
  getBudgetBarColorHex,
  getBudgetStatus,
  isOverallBudget,
} from '../../lib/budgetUtils';
import { subscribeFinanceDataChanged, notifyFinanceDataChanged } from '../../lib/financeEvents';
import { getCurrentMonthForInput } from '../../lib/dateUtils';
import { useAuth } from '../../context/AuthContext';
import { DEMO_EMAIL } from '../../lib/constants';

export function BudgetsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [expenses, setExpenses] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [catId, setCatId] = useState('');
  const [limit, setLimit] = useState('');
  const [month, setMonth] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ catId: '', limit: '', month: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [readOnlyMessage, setReadOnlyMessage] = useState(false);

  const { user } = useAuth();
  const isDemoUser = user?.email === DEMO_EMAIL;
  const requestIdRef = useRef(0);

  // Clear state when user changes
  useEffect(() => {
    setCategories([]);
    setBudgets([]);
    setExpenses([]);
  }, [user?.id]);

  const fetchFinanceData = useCallback(async () => {
    const currentRequestId = requestIdRef.current;
    const [budRes, catRes, expRes] = await Promise.all([
      budgetAPI.getAllBudgets(),
      categoryAPI.getAllCategories(),
      expenseAPI.getAllExpenses(),
    ]);

    if (currentRequestId !== requestIdRef.current) return;

    const budgetsData = budRes.data.budgets || [];
    const categoriesData = catRes.data.categories || [];
    const expensesData = expRes.data.expenses || [];

    setBudgets(budgetsData);
    setCategories(categoriesData);
    setExpenses(expensesData);

    if (categoriesData.length > 0) {
      setCatId((prev) => prev || String(categoriesData[0].id));
    }

    setMonth((prev) => prev || getCurrentMonthForInput());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const currentRequestId = ++requestIdRef.current;

    void (async () => {
      try {
        setLoading(true);
        await fetchFinanceData();
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        if (!cancelled && currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    })();

    const unsubscribe = subscribeFinanceDataChanged(() => {
      void fetchFinanceData().catch((err) => {
        console.error('Error refreshing data:', err);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user?.id, fetchFinanceData]);

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

  const currentMonthExpenses = useMemo(
    () => expenses.filter((t) => {
      const expenseMonth = new Date(t.expense_date);
      const expenseMonthStr = `${expenseMonth.getFullYear()}-${String(expenseMonth.getMonth() + 1).padStart(2, '0')}-01`;
      return expenseMonthStr === currentMonthStr;
    }),
    [expenses, currentMonthStr]
  );

  const expenseOnly = useMemo(
    () => currentMonthExpenses.filter((t) => {
      return t.transaction_type === 'expense';
    }),
    [currentMonthExpenses]
  );

  const summary = useMemo(
    () => computeBudgetSummary(currentMonthBudgets, expenseOnly),
    [currentMonthBudgets, expenseOnly]
  );

  const alerts = useMemo(
    () => computeBudgetAlerts(currentMonthBudgets, expenseOnly, categories),
    [currentMonthBudgets, expenseOnly, categories]
  );

  // Category budgets only for the grid — the redundant "Overall" card (whose totals
  // already appear in the summary cards + Overall Utilization donut) is not repeated here.
  const categoryBudgets = useMemo(
    () => currentMonthBudgets.filter((b) => !isOverallBudget(b)),
    [currentMonthBudgets]
  );

  useEffect(() => {
    console.log('Budget alerts:', alerts);
  }, [alerts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Frontend validation
    const numLimit = Number(limit);
    if (numLimit <= 0) {
      alert('Budget amount must be greater than 0');
      return;
    }
    if (numLimit > 100000000) {
      alert('Budget amount cannot exceed ₹10 Crore');
      return;
    }
    
    if (isDemoUser) {
      setReadOnlyMessage(true);
      setTimeout(() => setReadOnlyMessage(false), 3000);
      return;
    }
    try {
      await budgetAPI.addBudget({
        category_id: catId ? Number(catId) : undefined,
        amount_limit: numLimit,
        month: normalizeBudgetMonth(month),
      });
      setLimit('');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2000);
      notifyFinanceDataChanged();
    } catch (err) {
      console.error('Error adding budget:', err);
    }
  };

  const startEdit = (budget: Budget) => {
    if (isDemoUser) {
      setReadOnlyMessage(true);
      setTimeout(() => setReadOnlyMessage(false), 3000);
      return;
    }
    setEditingId(budget.id);
    setEditError(null);
    setEditForm({
      catId: budget.category_id ? String(budget.category_id) : '',
      limit: String(budget.amount_limit ?? ''),
      month: normalizeBudgetMonth(String(budget.month)),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
    setEditForm({ catId: '', limit: '', month: '' });
  };

  const saveEdit = async (budget: Budget) => {
    const amount = Number(editForm.limit);
    const normalizedMonth = normalizeBudgetMonth(editForm.month);

    if (!normalizedMonth || !/^\d{4}-\d{2}-01$/.test(normalizedMonth)) {
      setEditError('Please select a valid month.');
      return;
    }
    if (!amount || amount <= 0) {
      setEditError('Limit must be greater than 0.');
      return;
    }

    const payload = {
      category_id: editForm.catId ? Number(editForm.catId) : undefined,
      amount_limit: amount,
      month: normalizedMonth,
    };

    try {
      setSavingEdit(true);
      setEditError(null);
      await budgetAPI.updateBudget(budget.id, payload);
      cancelEdit();
      notifyFinanceDataChanged();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string; errors?: { message: string }[] } } };
      const validationMsg = error.response?.data?.errors?.map((e) => e.message).join(', ');
      setEditError(validationMsg || error.response?.data?.message || 'Failed to save budget. Please try again.');
      console.error('Error updating budget:', err);
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteBudget = async (id: number) => {
    if (isDemoUser) {
      setReadOnlyMessage(true);
      setTimeout(() => setReadOnlyMessage(false), 3000);
      return;
    }
    if (!confirm('Are you sure you want to delete this budget?')) return;
    try {
      await budgetAPI.deleteBudget(id);
      notifyFinanceDataChanged();
    } catch (err) {
      console.error('Error deleting budget:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-black/60">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-black tracking-tight">Budgets</h1>
        <p className="text-sm text-black/50">Set limits, stay on track</p>
      </div>

      {readOnlyMessage && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm font-medium">
          Demo mode is read-only. Create your own account to manage personal finances.
        </div>
      )}

      {/* Top Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 h-full">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-semibold text-black">Budget Alerts</h2>
              {alerts.length > 0 && (
                <span className="shrink-0 text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full bg-orange-50 text-orange-600">
                  {alerts.length} Active
                </span>
              )}
            </div>
            {alerts.length > 0 ? (
              <ul className="space-y-2">
                {alerts.map((alert) => (
                  <li
                    key={alert.budgetId}
                    className={`flex items-center gap-2.5 text-sm rounded-xl px-3 py-2 ${
                      alert.severity === 'warning'
                        ? 'bg-orange-50 text-orange-800'
                        : 'bg-rose-50 text-rose-800'
                    }`}
                  >
                    <span className="shrink-0 leading-5" aria-hidden>{alert.emoji}</span>
                    <span className="flex-1 min-w-0 leading-5">
                      <span className="font-medium">{alert.label}</span>
                      <span className="text-current/70"> — {Math.round(alert.rawPct)}% used</span>
                      <span className="block text-xs opacity-70 truncate">{alert.message}</span>
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0 opacity-60" aria-hidden />
                  </li>
                ))}
              </ul>
            ) : budgets.length === 0 ? (
              <div className="flex items-center gap-3 text-left py-2">
                <Target className="w-8 h-8 text-black/20 shrink-0" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-black flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden />
                    All budgets are on track
                  </p>
                  <p className="text-xs text-black/40">Set up budgets to enable monitoring.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-left py-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500/70 shrink-0" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-emerald-600">All budgets are on track</p>
                  <p className="text-xs text-black/40">No active budget alerts.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 flex flex-col items-center justify-center text-center group hover:border-violet-200 transition-colors">
          <h3 className="text-sm font-semibold text-black mb-6">Overall Utilization</h3>
          <div className="relative flex items-center justify-center w-32 h-32 mb-4">
            <svg className="transform -rotate-90 w-32 h-32 drop-shadow-sm">
              <circle cx="64" cy="64" r="54" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-black/5" />
              <circle
                cx="64"
                cy="64"
                r="54"
                stroke="url(#budgetsGradient)"
                strokeWidth="12"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 54}
                strokeDashoffset={(2 * Math.PI * 54) - ((summary.utilizationPct / 100) * (2 * Math.PI * 54))}
                className="transition-all duration-1000 ease-out stroke-round"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="budgetsGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={getBudgetBarColorHex(summary.rawUtilizationPct)} />
                  <stop offset="100%" stopColor={getBudgetBarColorHex(summary.rawUtilizationPct)} />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-black tracking-tight">{Math.round(summary.rawUtilizationPct)}%</span>
            </div>
          </div>
          <p className="text-xs text-black/50 font-medium">
            Safe to spend: <span className="text-emerald-600 font-bold">{formatBudgetCurrency(summary.safeToSpend)}</span>
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: 'TOTAL BUDGET',
            value: formatBudgetCurrency(summary.totalBudget),
            sub: summary.usesOverallBudget ? 'Overall budget cap' : 'Sum of category budgets',
            icon: Target,
            color: 'text-black',
          },
          {
            label: 'TOTAL SPENT',
            value: formatBudgetCurrency(summary.totalSpent),
            sub: `${Math.round(summary.rawUtilizationPct)}% of limit used`,
            icon: TrendingUp,
            color: 'text-rose-500',
          },
          {
            label: 'REMAINING',
            value: formatBudgetCurrency(summary.remaining),
            sub: summary.remaining < 0 ? 'Over budget' : 'Budget minus spent',
            icon: Wallet,
            color: summary.remaining < 0 ? 'text-rose-500' : 'text-emerald-600',
          },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl p-5 border border-black/5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold text-black/40 tracking-widest">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-2xl font-semibold ${color} mb-1`}>{value}</div>
            <div className="text-[11px] text-black/40">{sub}</div>
          </div>
        ))}
      </div>

      {/* Budgets Grid (per-category budgets; totals live in the summary cards + Overall Utilization donut above) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categoryBudgets.length === 0 ? (
            <div className="col-span-2 bg-white rounded-2xl border border-black/5 shadow-sm p-8 text-center">
              <p className="text-base font-semibold text-black mb-1.5">
                {currentMonthBudgets.length > 0 ? 'No category budgets for current month' : 'No budgets found for current month'}
              </p>
              <p className="text-sm text-black/40">
                {currentMonthBudgets.length > 0
                  ? "You're tracking an Overall budget — see the summary above."
                  : 'Create a budget to start tracking spending!'}
              </p>
            </div>
          ) : (
            categoryBudgets.map((b) => {
              const cat = categories.find((c) => c.id === b.category_id) || { name: b.category_name || 'Budget' };
              const { spent, limit: budgetLimit, pct, rawPct, isOver, remaining } = computeBudgetUtilization(b, expenseOnly);
              const status = getBudgetStatus(rawPct);
              const isEditing = editingId === b.id;

            return (
              <div key={b.id} className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-black">Edit Budget</h4>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        aria-label="Cancel editing"
                        className="p-1.5 text-black/40 hover:text-black hover:bg-black/5 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-black/60 mb-1 block">Month</label>
                      <input
                        type="date"
                        value={editForm.month}
                        onChange={(e) => setEditForm({ ...editForm, month: e.target.value })}
                        className="w-full bg-[#F5F5F5] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-black/60 mb-1 block">Category</label>
                      <select
                        value={editForm.catId}
                        onChange={(e) => setEditForm({ ...editForm, catId: e.target.value })}
                        className="w-full bg-[#F5F5F5] rounded-xl px-3 py-2.5 text-sm focus:outline-none cursor-pointer"
                      >
                        <option value="">Overall</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{formatCategoryLabel(c)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-black/60 mb-1 block">Limit (₹)</label>
                      <input
                        type="number"
                        min="1"
                        value={editForm.limit}
                        onChange={(e) => setEditForm({ ...editForm, limit: e.target.value })}
                        className="w-full bg-[#F5F5F5] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                      />
                    </div>
                    {editError && (
                      <p className="text-xs text-rose-600 font-medium">{editError}</p>
                    )}
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className={`flex-1 ${BUTTON_VARIANTS.secondary}`}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingEdit}
                        onClick={() => saveEdit(b)}
                        className={`flex-1 flex items-center justify-center gap-1 px-4 py-2 disabled:opacity-60 ${BUTTON_VARIANTS.primary}`}
                      >
                        <Check className="w-4 h-4" />
                        {savingEdit ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-sm ${getCategoryBg(cat?.name)}`}>
                          <CategoryEmoji icon={getCategoryIcon(cat)} className="text-xl" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-black leading-tight">{cat.name}</p>
                          <p className="text-[11px] text-black/40">{b.month}</p>
                          <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase ${status.badgeClass}`}>
                            {status.label}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(b)}
                          disabled={isDemoUser}
                          className="p-2.5 text-black/50 hover:text-black hover:bg-black/5 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Edit"
                          aria-label="Edit budget"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteBudget(b.id)}
                          disabled={isDemoUser}
                          className="p-2.5 text-black/50 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Delete"
                          aria-label="Delete budget"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-right">
                        <p className="text-lg font-bold text-black tracking-tight">{formatBudgetCurrency(spent)}</p>
                        <p className="text-[11px] text-black/40 font-medium">of {formatBudgetCurrency(budgetLimit)}</p>
                      </div>
                    </div>
                    <div className="w-full h-2.5 bg-[#F5F5F5] rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${getBudgetBarColor(rawPct)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-black/40">
                      <span>{Math.round(rawPct)}% used</span>
                      <span className={isOver ? 'text-rose-500' : 'text-emerald-600'}>
                        {isOver
                          ? `${formatBudgetCurrency(Math.abs(remaining))} over`
                          : `${formatBudgetCurrency(remaining)} left`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Budget Form */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h2 className="font-semibold text-black text-sm mb-4">Create Budget</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <div>
            <label className="block text-xs font-medium text-black/60 mb-1.5">Category (Optional)</label>
            <select
              className="w-full bg-[#F5F5F5] rounded-xl px-3 py-2.5 text-sm focus:outline-none cursor-pointer"
              value={catId}
              onChange={(e) => setCatId(e.target.value)}
            >
              <option value="">Overall Budget</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatCategoryLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-black/60 mb-1.5">Limit (₹)</label>
            <input
              type="number"
              min="1"
              className="w-full bg-[#F5F5F5] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              placeholder="e.g. 5000"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-black/60 mb-1.5">Month</label>
            <input
              type="date"
              className="w-full bg-[#F5F5F5] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              required
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isDemoUser}
              className={`w-full sm:w-auto px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_VARIANTS.primary}`}
            >
              {submitted ? 'Saved!' : 'Set Budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
