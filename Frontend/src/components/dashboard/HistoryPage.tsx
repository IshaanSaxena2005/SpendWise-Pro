import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  TrendingUp, Activity, ArrowUp, ArrowDown, Download, Eye, X, Award, AlertCircle,
  Plus, Edit2, Trash2
} from 'lucide-react';
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell
} from 'recharts';
import { analyticsAPI, expenseAPI, type Transaction } from '../../lib/api';
import { toCSV, downloadCSV } from '../../lib/csvExport';
import { useAuth } from '../../context/AuthContext';
import { subscribeFinanceDataChanged, notifyFinanceDataChanged } from '../../lib/financeEvents';
import { BUTTON_VARIANTS } from './DashboardOverview';
import { AddTransactionModal } from './AddTransactionModal';
import { DEMO_EMAIL } from '../../lib/constants';

const COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1'];

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function fmt(n: number) {
  return '₹' + Math.floor(n).toLocaleString('en-IN');
}

interface TooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur-sm border border-black/10 p-3 rounded-xl shadow-xl">
        <p className="text-sm font-semibold text-black mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs font-medium">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
            <span className="text-black/60 capitalize">{entry.name}:</span>
            <span className="text-black font-semibold">{fmt(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

/**
 * Month transaction-management modal.
 *
 * Opened from the "View" button of a Monthly History Table row and scoped to
 * that exact row's month (YYYY-MM key comes from the clicked row, never from
 * a global month state). Rendered via a portal to document.body so
 * `position: fixed` is viewport-relative (the dashboard's `.page-enter`
 * wrapper keeps a transform applied, which would otherwise become the
 * containing block and misplace the modal). Full CRUD over the month's
 * transactions: Add/Edit reuse AddTransactionModal, Delete reuses the
 * existing expense API — every mutation notifies financeEvents, and the
 * transaction list is derived from the page's live dataset so all totals,
 * the Monthly History Table, charts and KPIs refresh together.
 */
interface MonthlyRow {
  month: string;
  income: number;
  expenses: number;
  transactionsCount: number;
  transactions: Transaction[];
}

function MonthlyTransactionsModal({ monthKey, monthlyRow, isDemoUser, deletingId, isChildModalOpen, onAdd, onEdit, onDelete, onClose }: {
  monthKey: string;
  monthlyRow: MonthlyRow | null;
  isDemoUser: boolean;
  deletingId: number | null;
  /** True while AddTransactionModal is stacked on top — suspend backdrop/Escape dismissal. */
  isChildModalOpen: boolean;
  onAdd: () => void;
  onEdit: (txn: Transaction, anchorRect: DOMRect | null) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}) {
  const monthLabel = (() => {
    const parts = monthKey.split('-');
    return `${monthNames[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
  })();

  // Live from the page dataset — updates automatically after every mutation.
  const transactions = useMemo(() => {
    const list = monthlyRow?.transactions ?? [];
    return [...list].sort((a, b) => {
      const da = new Date(a.expense_date).getTime();
      const db = new Date(b.expense_date).getTime();
      return db - da || (b.id ?? 0) - (a.id ?? 0);
    });
  }, [monthlyRow]);

  const income = monthlyRow?.income ?? 0;
  const expenses = monthlyRow?.expenses ?? 0;

  // Lock body scroll while open and restore it on close.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, []);

  // Close on Escape — but not while the Add/Edit modal is stacked on top.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isChildModalOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isChildModalOpen]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
        onClick={() => { if (!isChildModalOpen) onClose(); }}
      />
      <div className="relative w-[min(1100px,calc(100vw-32px))] max-h-[85vh] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-black/10 pointer-events-auto modal-panel-in">

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-black text-base truncate">{monthLabel} Transactions</h3>
            <p className="text-[11px] text-black/50 mt-0.5">
              {transactions.length} transaction{transactions.length === 1 ? '' : 's'} • Income {fmt(income)} • Expenses {fmt(expenses)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onAdd}
              disabled={isDemoUser}
              className={`flex items-center gap-1.5 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_VARIANTS.primary}`}
            >
              <Plus className="w-4 h-4" />
              Add Transaction
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg hover:bg-black/5 text-black/60 hover:text-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body — scrollable month transaction table */}
        {transactions.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-black/[0.02]">
                <tr className="border-b border-black/5 text-[10px] font-bold text-black/60 tracking-wider uppercase">
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 text-xs text-black/80 font-medium">
                {transactions.map((t) => {
                  const isIncome = t.transaction_type === 'income';
                  return (
                    <tr key={t.id} className="hover:bg-black/[0.01] transition-colors">
                      <td className="px-6 py-3 text-black/70 whitespace-nowrap">
                        {new Date(t.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-3 text-black font-semibold capitalize max-w-[280px] truncate">{t.note || t.category_name || 'Transaction'}</td>
                      <td className="px-6 py-3 capitalize">{t.category_name || '—'}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                          {isIncome ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                          {t.transaction_type}
                        </span>
                      </td>
                      <td className={`px-6 py-3 text-right font-bold ${isIncome ? 'text-emerald-600' : 'text-black'}`}>
                        {isIncome ? '+' : '-'}{fmt(Number(t.amount))}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => onEdit(t, (e.currentTarget.closest('tr') as HTMLTableRowElement | null)?.getBoundingClientRect() ?? null)}
                            disabled={isDemoUser}
                            className="p-2.5 text-black/50 hover:text-black hover:bg-black/5 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Edit"
                            aria-label="Edit transaction"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(t.id)}
                            disabled={isDemoUser || deletingId === t.id}
                            className="p-2.5 text-black/50 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Delete"
                            aria-label="Delete transaction"
                          >
                            <Trash2 className={`w-4 h-4 ${deletingId === t.id ? 'animate-pulse' : ''}`} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto flex flex-col items-center justify-center text-center p-10">
            <p className="text-sm font-semibold text-black">No transactions this month</p>
            <p className="text-xs text-black/40 mt-1 mb-4">Add one to start tracking {monthLabel}.</p>
            <button
              type="button"
              onClick={onAdd}
              disabled={isDemoUser}
              className={`flex items-center gap-1.5 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_VARIANTS.primary}`}
            >
              <Plus className="w-4 h-4" />
              Add Transaction
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

const KPICard = ({ label, value, sub, icon: Icon, color, gradient }: {
  label: string;
  value: React.ReactNode;
  sub: string;
  icon: any;
  color: string;
  gradient: string;
}) => (
  <div className={`bg-gradient-to-br ${gradient} rounded-2xl p-5 border border-black/5 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group`}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-[10px] font-bold text-black/50 tracking-widest uppercase">{label}</span>
      <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
    </div>
    <div className={`text-2xl font-bold tracking-tight ${color} mb-1`}>{value}</div>
    <div className="text-[11px] text-black/50 font-medium">{sub}</div>
  </div>
);

export function HistoryPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const requestIdRef = useRef(0);

  // Filters
  const [period, setPeriod] = useState<'all_time' | 'this_month' | 'last_3_months' | 'last_6_months' | 'this_year'>('all_time');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  // Month transaction-management modal — month key comes from the clicked
  // Monthly History Table row, never from the page's filter state.
  const [detailMonthKey, setDetailMonthKey] = useState<string | null>(null);
  const [detailAddOpen, setDetailAddOpen] = useState(false);
  const [editTxn, setEditTxn] = useState<Transaction | null>(null);
  const [editAnchorRect, setEditAnchorRect] = useState<DOMRect | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [readOnlyMessage, setReadOnlyMessage] = useState(false);

  const isDemoUser = user?.email === DEMO_EMAIL;

  // Clear state when user changes
  useEffect(() => {
    setExpenses([]);
    setBudgets([]);
    setError(null);
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const currentRequestId = ++requestIdRef.current;

    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await analyticsAPI.getFinancialHistory();
        if (cancelled || currentRequestId !== requestIdRef.current) return;
        if (res.data.success) {
          setExpenses(res.data.expenses);
          setBudgets(res.data.budgets);
        } else {
          setError('Failed to load history data');
        }
      } catch (err: any) {
        if (!cancelled && currentRequestId === requestIdRef.current) {
          setError(err.message || 'An error occurred while fetching data');
        }
      } finally {
        if (!cancelled && currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    };
    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Historical transaction management re-uses the same dataset as the rest of
  // the page — refetch it whenever any add/edit/delete lands (Transactions
  // page, dashboard modal, or this page) so every view stays in sync.
  const fetchFinanceData = useCallback(() => {
    const currentRequestId = ++requestIdRef.current;
    void analyticsAPI.getFinancialHistory()
      .then((res) => {
        if (currentRequestId !== requestIdRef.current) return;
        if (res.data.success) {
          setExpenses(res.data.expenses);
          setBudgets(res.data.budgets);
          setError(null);
        }
      })
      .catch((err) => {
        console.error('Error refreshing history data:', err);
      });
  }, []);

  useEffect(() => {
    return subscribeFinanceDataChanged(fetchFinanceData);
  }, [fetchFinanceData]);

  // ── Historical transaction CRUD (reuses the existing transaction APIs) ──
  const handleDeleteTransaction = async (id: number) => {
    if (isDemoUser) {
      setReadOnlyMessage(true);
      setTimeout(() => setReadOnlyMessage(false), 3000);
      return;
    }
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    try {
      setDeletingId(id);
      await expenseAPI.deleteExpense(id);
      notifyFinanceDataChanged();
    } catch (err) {
      console.error('Error deleting transaction:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const startEditTransaction = (txn: Transaction, anchorRect: DOMRect | null) => {
    if (isDemoUser) {
      setReadOnlyMessage(true);
      setTimeout(() => setReadOnlyMessage(false), 3000);
      return;
    }
    setEditAnchorRect(anchorRect);
    setEditTxn(txn);
  };

  // Compute unique years and months from the dataset
  const years = Array.from(new Set(expenses.map(e => new Date(e.expense_date).getFullYear().toString()))).sort((a, b) => b.localeCompare(a));
  
  const months = Array.from(new Set(expenses.map(e => {
    const date = new Date(e.expense_date);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }))).sort((a, b) => b.localeCompare(a));

  // Period filtration helper for months
  const isMonthInPeriod = (mStr: string) => {
    const parts = mStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed
    const mDate = new Date(year, month, 1);
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    if (period === 'this_month') {
      return year === currentYear && month === currentMonth;
    }
    if (period === 'last_3_months') {
      const cutDate = new Date(currentYear, currentMonth - 2, 1);
      return mDate >= cutDate;
    }
    if (period === 'last_6_months') {
      const cutDate = new Date(currentYear, currentMonth - 5, 1);
      return mDate >= cutDate;
    }
    if (period === 'this_year') {
      return year === currentYear;
    }
    return true;
  };

  // Determine if months match the current year/period
  const displayedMonthsOptions = months.filter(m => {
    if (!isMonthInPeriod(m)) return false;
    if (selectedYear !== 'all') {
      return m.startsWith(selectedYear);
    }
    return true;
  });

  // Period filtration for transactions
  const isTransactionInPeriod = (t: any) => {
    const date = new Date(t.expense_date);
    const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return isMonthInPeriod(monthStr);
  };

  // Main filtration of data
  const filteredExpenses = expenses.filter(e => {
    const date = new Date(e.expense_date);
    // Period filter
    if (!isTransactionInPeriod(e)) return false;
    // Year filter (disabled/overridden on Period filter if necessary, but we combine them)
    if (selectedYear !== 'all' && date.getFullYear().toString() !== selectedYear) return false;
    // Month filter
    if (period !== 'this_month' && selectedMonth !== 'all') {
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthStr !== selectedMonth) return false;
    }
    return true;
  });

  // Calculate monthly aggregates
  const monthlyDataMap: { [key: string]: {
    month: string;
    income: number;
    expenses: number;
    transactionsCount: number;
    budget: number;
    categorySpending: { [key: string]: number };
    transactions: any[];
  }} = {};

  // Initialize all months found in the filtered ranges
  filteredExpenses.forEach(e => {
    const d = new Date(e.expense_date);
    const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyDataMap[mStr]) {
      monthlyDataMap[mStr] = {
        month: mStr,
        income: 0,
        expenses: 0,
        transactionsCount: 0,
        budget: 0,
        categorySpending: {},
        transactions: []
      };
    }

    const isIncome = e.transaction_type === 'income';
    if (isIncome) {
      monthlyDataMap[mStr].income += Number(e.amount);
    } else {
      monthlyDataMap[mStr].expenses += Number(e.amount);
      monthlyDataMap[mStr].categorySpending[e.category_name] = (monthlyDataMap[mStr].categorySpending[e.category_name] || 0) + Number(e.amount);
    }
    monthlyDataMap[mStr].transactionsCount += 1;
    monthlyDataMap[mStr].transactions.push(e);
  });

  // Merge budgets
  budgets.forEach(b => {
    const mStr = b.month.substring(0, 7); // '2026-07-01' -> '2026-07'
    if (monthlyDataMap[mStr]) {
      monthlyDataMap[mStr].budget = Number(b.amount_limit);
    }
  });

  // Convert monthly data map to array, newest first
  const monthlyHistoryRows = Object.values(monthlyDataMap).sort((a, b) => b.month.localeCompare(a.month)).map(row => {
    const budgetRemaining = row.budget > 0 ? row.budget - row.expenses : null;
    const savings = row.income - row.expenses;
    return {
      ...row,
      savings,
      budgetRemaining
    };
  });

  // Lifetime summaries of the selected/filtered period
  const totalIncome = filteredExpenses
    .filter(e => e.transaction_type === 'income')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const totalExpenses = filteredExpenses
    .filter(e => e.transaction_type === 'expense')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const netSavings = totalIncome - totalExpenses;
  const totalTransactions = filteredExpenses.length;
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

  // Additional lifetime stats
  const activeMonths = monthlyHistoryRows.length;
  const averageMonthlyExpenses = activeMonths > 0 ? totalExpenses / activeMonths : 0;
  const averageMonthlySavings = activeMonths > 0 ? netSavings / activeMonths : 0;

  let highestExpenseMonth = { month: '—', value: 0 };
  let highestIncomeMonth = { month: '—', value: 0 };
  let bestSavingMonth = { month: '—', value: -Infinity };
  let worstSavingMonth = { month: '—', value: Infinity };

  monthlyHistoryRows.forEach(r => {
    const dateFormatted = () => {
      const parts = r.month.split('-');
      const y = parts[0];
      const mIdx = parseInt(parts[1], 10) - 1;
      return `${monthNames[mIdx]} ${y}`;
    };
    const displayMonth = dateFormatted();

    if (r.expenses > highestExpenseMonth.value) {
      highestExpenseMonth = { month: displayMonth, value: r.expenses };
    }
    if (r.income > highestIncomeMonth.value) {
      highestIncomeMonth = { month: displayMonth, value: r.income };
    }
    if (r.savings > bestSavingMonth.value) {
      bestSavingMonth = { month: displayMonth, value: r.savings };
    }
    if (r.savings < worstSavingMonth.value) {
      worstSavingMonth = { month: displayMonth, value: r.savings };
    }
  });

  // Adjust worst saving month defaults if no items
  if (worstSavingMonth.value === Infinity) worstSavingMonth.value = 0;
  if (bestSavingMonth.value === -Infinity) bestSavingMonth.value = 0;

  const getActiveFilterLabel = () => {
    if (period === 'this_month') {
      const now = new Date();
      return `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    }
    if (selectedMonth !== 'all') {
      const parts = selectedMonth.split('-');
      return `${monthNames[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
    }
    if (period === 'last_3_months') return 'Last 3 Months';
    if (period === 'last_6_months') return 'Last 6 Months';
    if (period === 'this_year') return `${new Date().getFullYear()}`;
    if (selectedYear !== 'all') return selectedYear;
    return 'All Time';
  };
  const activeFilterLabel = getActiveFilterLabel();

  // Category analysis across the filtered period
  const categorySpendingMap: { [key: string]: number } = {};
  filteredExpenses
    .filter(e => e.transaction_type === 'expense')
    .forEach(e => {
      categorySpendingMap[e.category_name] = (categorySpendingMap[e.category_name] || 0) + Number(e.amount);
    });

  const categoryBreakdown = Object.entries(categorySpendingMap)
    .map(([name, value]) => ({
      name,
      value,
      percentage: totalExpenses > 0 ? (value / totalExpenses) * 100 : 0
    }))
    .sort((a, b) => b.value - a.value);

  // Charts mapping
  const chartData = [...monthlyHistoryRows].reverse().map(r => {
    const parts = r.month.split('-');
    const mLabel = monthNames[parseInt(parts[1], 10) - 1].substring(0, 3) + ' ' + parts[0].substring(2);
    return {
      monthLabel: mLabel,
      income: r.income,
      expenses: r.expenses,
      savings: r.savings
    };
  });

  // Export CSV — uses shared csvExport utility
  const handleExportCSV = () => {
    if (monthlyHistoryRows.length === 0) return;

    const header = ['Month', 'Income', 'Expenses', 'Savings', 'Transactions', 'Budget Limit', 'Budget Remaining'];
    const rows = monthlyHistoryRows.map(row => {
      const parts = row.month.split('-');
      const monthLabel = `${monthNames[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
      return [
        monthLabel,
        row.income,
        row.expenses,
        row.savings,
        row.transactionsCount,
        row.budget > 0 ? row.budget : '',
        row.budgetRemaining != null ? row.budgetRemaining : '',
      ];
    });

    const csv = toCSV(header, rows);
    downloadCSV('spendwise-monthly-history.csv', csv);
  };

  // Per-month Export CSV — exports ONLY the transactions for that month,
  // mirroring the Transactions/Expenses tab export columns.
  const handleExportMonthCSV = (row: { month: string; transactions: Transaction[] }) => {
    if (!row.transactions || row.transactions.length === 0) return;

    const parts = row.month.split('-');
    const monthName = monthNames[parseInt(parts[1], 10) - 1].toLowerCase();
    const header = ['Date', 'Description', 'Category', 'Amount', 'Notes'];
    const rows = row.transactions.map((t) => [
      new Date(t.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      t.note || 'Transaction',
      t.category_name || '',
      t.amount,
      t.note,
    ]);

    const csv = toCSV(header, rows);
    downloadCSV(`spendwise-transactions-${monthName}-${parts[0]}.csv`, csv);
  };

  const handlePeriodChange = (val: typeof period) => {
    setPeriod(val);
    setSelectedMonth('all');
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
        <h3 className="text-lg font-semibold text-black mb-2">Failed to load financial history</h3>
        <p className="text-sm text-black/60 mb-6">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Sticky Filters Header */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md rounded-2xl border border-black/5 shadow-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">History & Reports</h1>
          <p className="text-xs text-black/60">Lifetime overview and deep financial insights</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Period Dropdown */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold text-black/40 uppercase tracking-widest">Period</span>
            <select
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value as any)}
              className="bg-black/5 border border-black/5 text-xs font-semibold rounded-xl px-3 py-2 text-black/80 focus:outline-none focus:ring-2 focus:ring-violet-600/30"
            >
              <option value="all_time">All Time</option>
              <option value="this_month">This Month</option>
              <option value="last_3_months">Last 3 Months</option>
              <option value="last_6_months">Last 6 Months</option>
              <option value="this_year">This Year</option>
            </select>
          </div>

          {/* Year Dropdown */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold text-black/40 uppercase tracking-widest">Year</span>
            <select
              value={selectedYear}
              disabled={period === 'this_month'}
              onChange={(e) => {
                setSelectedYear(e.target.value);
                setSelectedMonth('all');
              }}
              className="bg-black/5 border border-black/5 text-xs font-semibold rounded-xl px-3 py-2 text-black/80 focus:outline-none focus:ring-2 focus:ring-violet-600/30 disabled:opacity-50"
            >
              <option value="all">All Years</option>
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Month Dropdown */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold text-black/40 uppercase tracking-widest">Month</span>
            <select
              value={selectedMonth}
              disabled={period === 'this_month'}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-black/5 border border-black/5 text-xs font-semibold rounded-xl px-3 py-2 text-black/80 focus:outline-none focus:ring-2 focus:ring-violet-600/30 disabled:opacity-50"
            >
              <option value="all">All Months</option>
              {displayedMonthsOptions.map(m => {
                const parts = m.split('-');
                const lbl = `${monthNames[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
                return (
                  <option key={m} value={m}>{lbl}</option>
                );
              })}
            </select>
          </div>

        </div>
      </div>

      {readOnlyMessage && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm font-medium">
          Demo mode is read-only. Create your own account to manage personal finances.
        </div>
      )}

      {/* Hero Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          label="Total Income"
          value={fmt(totalIncome)}
          sub="Filtered earnings"
          icon={ArrowUp}
          color="text-emerald-600"
          gradient="from-emerald-50 to-emerald-100"
        />
        <KPICard
          label="Total Expenses"
          value={fmt(totalExpenses)}
          sub="Filtered spendings"
          icon={ArrowDown}
          color="text-rose-600"
          gradient="from-rose-50 to-rose-100"
        />
        <KPICard
          label="Net Savings"
          value={fmt(netSavings)}
          sub="Income - Expenses"
          icon={TrendingUp}
          color="text-violet-600"
          gradient="from-violet-50 to-violet-100"
        />
        <KPICard
          label="Transactions"
          value={totalTransactions}
          sub="Total record count"
          icon={Activity}
          color="text-blue-600"
          gradient="from-blue-50 to-blue-100"
        />
        <KPICard
          label="Savings Rate"
          value={`${savingsRate.toFixed(1)}%`}
          sub="Savings over Income"
          icon={Award}
          color="text-amber-600"
          gradient="from-amber-50 to-amber-100"
        />
      </div>

      {/* Detailed Highlights Summaries */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-xl border border-black/5 shadow-sm">
          <div className="text-[10px] text-black/50 font-bold uppercase tracking-wider">Highest Income</div>
          <div className="text-sm font-bold text-black mt-1 leading-tight">{highestIncomeMonth.month}</div>
          <div className="text-xs font-semibold text-emerald-600 mt-0.5">{highestIncomeMonth.value > 0 ? fmt(highestIncomeMonth.value) : '—'}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-black/5 shadow-sm">
          <div className="text-[10px] text-black/50 font-bold uppercase tracking-wider">Highest Expense</div>
          <div className="text-sm font-bold text-black mt-1 leading-tight">{highestExpenseMonth.month}</div>
          <div className="text-xs font-semibold text-rose-600 mt-0.5">{highestExpenseMonth.value > 0 ? fmt(highestExpenseMonth.value) : '—'}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-black/5 shadow-sm">
          <div className="text-[10px] text-black/50 font-bold uppercase tracking-wider">Best Saving</div>
          <div className="text-sm font-bold text-black mt-1 leading-tight">{bestSavingMonth.month}</div>
          <div className="text-xs font-semibold text-emerald-600 mt-0.5">{bestSavingMonth.value > 0 ? fmt(bestSavingMonth.value) : '—'}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-black/5 shadow-sm">
          <div className="text-[10px] text-black/50 font-bold uppercase tracking-wider">Worst Saving</div>
          <div className="text-sm font-bold text-black mt-1 leading-tight">{worstSavingMonth.month}</div>
          <div className="text-xs font-semibold text-rose-600 mt-0.5">{worstSavingMonth.value !== 0 ? fmt(worstSavingMonth.value) : '—'}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-black/5 shadow-sm">
          <div className="text-[10px] text-black/50 font-bold uppercase tracking-wider">Avg Monthly Exp</div>
          <div className="text-sm font-bold text-black mt-1 leading-tight">Average / month</div>
          <div className="text-xs font-semibold text-black/70 mt-0.5">{fmt(averageMonthlyExpenses)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-black/5 shadow-sm">
          <div className="text-[10px] text-black/50 font-bold uppercase tracking-wider">Avg Monthly Save</div>
          <div className="text-sm font-bold text-black mt-1 leading-tight">Average / month</div>
          <div className="text-xs font-semibold text-black/70 mt-0.5">{fmt(averageMonthlySavings)}</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Performance (Income vs Expense) */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 flex flex-col h-96">
          <h2 className="font-semibold text-black text-sm mb-4">Monthly Performance</h2>
          {chartData.length > 0 ? (
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="income" name="Income" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-black/60">No monthly data available</p>
            </div>
          )}
        </div>

        {/* Savings Trend */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 flex flex-col h-96">
          <h3 className="font-semibold text-black text-sm mb-4">Savings Trend</h3>
          {chartData.length > 0 ? (
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="savings" name="Net Savings" stroke="#8B5CF6" strokeWidth={2} fillOpacity={1} fill="url(#colorSavings)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-black/60">No monthly data available</p>
            </div>
          )}
        </div>

        {/* Category Analysis */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 flex flex-col h-96">
          <div className="mb-4">
            <h3 className="font-semibold text-black text-sm">Category Breakdown - {activeFilterLabel}</h3>
            <p className="text-xs text-black/50 font-medium">Aggregated from the selected period</p>
          </div>
          {categoryBreakdown.length > 0 ? (
            <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-6 w-full h-full">
              <div className="w-44 h-44 shrink-0 flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={categoryBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {categoryBreakdown.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 w-full space-y-2 max-h-60 overflow-y-auto pr-1">
                {categoryBreakdown.slice(0, 6).map((item, index) => (
                  <div key={index} className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-black/60 capitalize truncate">{item.name}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="font-semibold text-black block">{fmt(item.value)}</span>
                      <span className="text-[10px] text-black/40 font-medium">{item.percentage.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-black/60">No category breakdown data available</p>
            </div>
          )}
        </div>

        {/* Spending Trend Line */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 flex flex-col h-96">
          <h3 className="font-semibold text-black text-sm mb-4">Spending Trend Line</h3>
          {chartData.length > 0 ? (
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#EF4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 1 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-black/60">No monthly data available</p>
            </div>
          )}
        </div>
      </div>

      {/* Monthly History Table */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-black text-sm">Monthly History Table</h2>
          <button
            onClick={handleExportCSV}
            disabled={monthlyHistoryRows.length === 0}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs rounded-xl px-4 py-2.5 shadow-md shadow-violet-600/10 hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
        {monthlyHistoryRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black/[0.02] border-b border-black/5 text-[10px] font-bold text-black/60 tracking-wider uppercase">
                  <th className="px-5 py-3.5">Details</th>
                  <th className="px-5 py-3.5">Month</th>
                  <th className="px-5 py-3.5 text-right">Income</th>
                  <th className="px-5 py-3.5 text-right">Expenses</th>
                  <th className="px-5 py-3.5 text-right">Savings</th>
                  <th className="px-5 py-3.5 text-center">Transactions</th>
                  <th className="px-5 py-3.5 text-right">Budget Limit</th>
                  <th className="px-5 py-3.5 text-right">Budget Remaining</th>
                  <th className="px-5 py-3.5 text-right">Export</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 text-xs text-black/80 font-medium">
                {monthlyHistoryRows.map((row, index) => {
                  const parts = row.month.split('-');
                  const monthLabel = `${monthNames[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
                  return (
                    <tr key={index} className="hover:bg-black/[0.01] transition-colors">
                      <td className="px-5 py-3">
                        <button
                          onClick={() => setDetailMonthKey(row.month)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black text-white hover:bg-black/85 text-xs font-bold transition-all"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </button>
                      </td>
                      <td className="px-5 py-3 text-black font-semibold">{monthLabel}</td>
                      <td className="px-5 py-3 text-right text-emerald-600 font-bold">{fmt(row.income)}</td>
                      <td className="px-5 py-3 text-right text-rose-600 font-bold">{fmt(row.expenses)}</td>
                      <td className={`px-5 py-3 text-right font-bold ${row.savings >= 0 ? 'text-violet-600' : 'text-rose-600'}`}>
                        {fmt(row.savings)}
                      </td>
                      <td className="px-5 py-3 text-center text-black/60 font-semibold">{row.transactionsCount}</td>
                      <td className="px-5 py-3 text-right text-black/70 font-semibold">
                        {row.budget > 0 ? fmt(row.budget) : '—'}
                      </td>
                      <td className={`px-5 py-3 text-right font-semibold ${row.budgetRemaining !== null ? (row.budgetRemaining >= 0 ? 'text-emerald-600' : 'text-rose-600') : 'text-black/40'}`}>
                        {row.budgetRemaining !== null ? fmt(row.budgetRemaining) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleExportMonthCSV(row)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                        >
                          <Download className="w-3 h-3" />
                          Export CSV
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-sm text-black/60">No history rows match your filters.</p>
          </div>
        )}

      </div>

      {/* Month transaction-management modal — month comes from the clicked row */}
      {detailMonthKey && (
        <MonthlyTransactionsModal
          monthKey={detailMonthKey}
          monthlyRow={monthlyHistoryRows.find((r) => r.month === detailMonthKey) ?? null}
          isDemoUser={isDemoUser}
          deletingId={deletingId}
          isChildModalOpen={!!editTxn}
          onAdd={() => setDetailAddOpen(true)}
          onEdit={(txn, anchorRect) => startEditTransaction(txn, anchorRect)}
          onDelete={handleDeleteTransaction}
          onClose={() => setDetailMonthKey(null)}
        />
      )}

      {/* Add Transaction opened from the month modal — date defaults to that month */}
      {detailAddOpen && detailMonthKey && (
        <AddTransactionModal
          isOpen={true}
          onClose={() => setDetailAddOpen(false)}
          defaultDate={`${detailMonthKey}-01`}
          onTransactionChanged={notifyFinanceDataChanged}
        />
      )}

      {/* Edit Transaction — opens from the month modal; closes both when done */}
      {editTxn && (
        <AddTransactionModal
          isOpen={true}
          onClose={() => {
            setEditTxn(null);
            setEditAnchorRect(null);
          }}
          editTxn={editTxn}
          anchorRect={editAnchorRect}
          onTransactionChanged={notifyFinanceDataChanged}
        />
      )}
    </div>
  );
}
