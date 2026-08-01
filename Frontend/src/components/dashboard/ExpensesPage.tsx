import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Download, Edit2, Trash2, ChevronLeft, ChevronRight, Receipt, Plus, Repeat2 } from 'lucide-react';
import { expenseAPI, categoryAPI, analyticsAPI, recurringAPI, type Transaction, type Category } from '../../lib/api';
import { formatCategoryLabel, getCategoryIcon, getCategoryBadgeClasses } from '../../lib/categoryIcons';
import { CategoryEmoji } from './CategoryEmoji';
import { AddTransactionModal } from './AddTransactionModal';
import { RecurringManagementModal } from './RecurringManagementModal';
import { subscribeFinanceDataChanged, notifyFinanceDataChanged } from '../../lib/financeEvents';
import { toAmount } from '../../lib/budgetUtils';
import { formatDate } from '../../lib/dateUtils';
import { getUser } from '../../lib/auth';
import { DEMO_EMAIL } from '../../lib/constants';

const PAGE_SIZE = 30;

const INCOME_CATEGORIES = ['Salary', 'Freelance'];

function fmt(n: number) { return '₹' + Math.floor(toAmount(n)).toLocaleString('en-IN'); }

export function ExpensesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [dateTo, setDateTo] = useState(() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
  });
  const [page, setPage] = useState(1);
  const [editTxn, setEditTxn] = useState<Transaction | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [readOnlyMessage, setReadOnlyMessage] = useState(false);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [upcomingRecurring, setUpcomingRecurring] = useState<any[]>([]);

  const user = getUser();
  const isDemoUser = user?.email === DEMO_EMAIL;

  const fetchFinanceData = useCallback(async () => {
    const [txRes, catRes, summaryRes] = await Promise.all([
      expenseAPI.getAllExpenses(),
      categoryAPI.getAllCategories(),
      analyticsAPI.getDashboardSummary(),
    ]);
    setTransactions(txRes.data.expenses || []);
    setCategories(catRes.data.categories || []);
    setDashboardSummary(summaryRes.data.summary || null);
  }, []);

  const fetchUpcomingRecurring = useCallback(async () => {
    try {
      const res = await recurringAPI.getAll();
      const allRecurring = res.data.recurring_transactions || [];
      
      // Filter for active recurring transactions
      const activeRecurring = allRecurring.filter((r: any) => r.is_active);
      
      // Sort by next execution date and take first 5
      const upcoming = activeRecurring
        .sort((a: any, b: any) => new Date(a.next_execution_date).getTime() - new Date(b.next_execution_date).getTime())
        .slice(0, 5);
      
      setUpcomingRecurring(upcoming);
    } catch (err) {
      console.error('Error fetching upcoming recurring:', err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setLoading(true);
        await fetchFinanceData();
        await fetchUpcomingRecurring();
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    const unsubscribe = subscribeFinanceDataChanged(() => {
      void fetchFinanceData().catch((err) => {
        console.error('Error refreshing data:', err);
      });
      void fetchUpcomingRecurring().catch((err) => {
        console.error('Error refreshing recurring:', err);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [fetchFinanceData, fetchUpcomingRecurring]);

  // --- Filtering ---
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const matchSearch = !search || (t.note || '').toLowerCase().includes(search.toLowerCase());
      const matchCat = catFilter === 'all' || t.category_id === Number(catFilter);
      const matchFrom = !dateFrom || t.expense_date >= dateFrom;
      const matchTo = !dateTo || t.expense_date <= dateTo;
      return matchSearch && matchCat && matchFrom && matchTo;
    });
  }, [transactions, search, catFilter, dateFrom, dateTo]);

  // For summary cards, only use date filters (not search/category) to match Dashboard
  const summaryFiltered = useMemo(() => {
    return transactions.filter((t) => {
      const matchFrom = !dateFrom || t.expense_date >= dateFrom;
      const matchTo = !dateTo || t.expense_date <= dateTo;
      return matchFrom && matchTo;
    });
  }, [transactions, dateFrom, dateTo]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = async (id: number) => {
    if (isDemoUser) {
      setReadOnlyMessage(true);
      setTimeout(() => setReadOnlyMessage(false), 3000);
      return;
    }
    if (confirm('Delete this transaction?')) {
      try {
        await expenseAPI.deleteExpense(id);
        notifyFinanceDataChanged();
      } catch (err) {
        console.error('Error deleting transaction:', err);
      }
    }
  };

  const exportCSV = () => {
    const rows = [
      ['Date', 'Description', 'Category', 'Amount', 'Notes'],
      ...filtered.map((t) => {
        const cat = categories.find((c) => c.id === t.category_id);
        return [formatDate(t.expense_date), t.note || 'Expense', cat?.name || '', t.amount, t.note];
      }),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'transactions.csv';
    a.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-black/60">Loading...</div>
      </div>
    );
  }

  const handleAdd = () => {
    if (isDemoUser) {
      setReadOnlyMessage(true);
      setTimeout(() => setReadOnlyMessage(false), 3000);
      return;
    }
    setModalOpen(true);
  };

  const handleEdit = (txn: Transaction) => {
    if (isDemoUser) {
      setReadOnlyMessage(true);
      setTimeout(() => setReadOnlyMessage(false), 3000);
      return;
    }
    setEditTxn(txn);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-black tracking-tight">Transactions</h1>
          <p className="text-sm text-black/50">Manage and track every transaction</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRecurringModalOpen(true)}
            className="flex items-center gap-2 border border-black/10 text-black px-4 py-2 rounded-xl text-sm font-medium hover:bg-black/5 transition-colors"
          >
            <Repeat2 className="w-4 h-4" /> Manage Recurring
          </button>
          <button
            onClick={handleAdd}
            disabled={isDemoUser}
            className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      {readOnlyMessage && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm font-medium">
          Demo mode is read-only. Create your own account to manage personal finances.
        </div>
      )}

      {/* Upcoming Recurring Section */}
      {upcomingRecurring.length > 0 && (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Repeat2 className="w-4 h-4 text-black/60" />
              <h3 className="text-sm font-semibold text-black">Upcoming Recurring</h3>
            </div>
            <button
              onClick={() => setRecurringModalOpen(true)}
              className="text-xs font-medium text-black/60 hover:text-black transition-colors"
            >
              View all
            </button>
          </div>
          <div className="space-y-2">
            {upcomingRecurring.map((item) => {
              const nextDate = new Date(item.next_execution_date);
              const today = new Date();
              const diffDays = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              let timeLabel = '';
              if (diffDays === 0) timeLabel = 'Today';
              else if (diffDays === 1) timeLabel = 'Tomorrow';
              else if (diffDays < 7) timeLabel = `In ${diffDays} days`;
              else timeLabel = formatDate(item.next_execution_date);

              return (
                <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#F5F5F5]">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.type === 'income' ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                      <Repeat2 className={`w-4 h-4 ${item.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-black">{item.category_name || item.note || 'Transaction'}</div>
                      <div className="text-xs text-black/60">{item.frequency}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${item.type === 'income' ? 'text-emerald-600' : 'text-black'}`}>
                      {item.type === 'income' ? '+' : '-'}₹{item.amount.toLocaleString('en-IN')}
                    </div>
                    <div className="text-xs text-black/40">{timeLabel}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/30" />
            <input
              className="w-full bg-[#F5F5F5] rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              placeholder="Search transactions..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm focus:outline-none cursor-pointer min-w-[140px]"
            value={catFilter}
            onChange={(e) => {
              setCatFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {formatCategoryLabel(c)}
              </option>
            ))}
          </select>
          <div className="flex items-center bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm">
            <span className="text-black/40 mr-2 text-xs font-medium">From</span>
            <input
              type="date"
              className="bg-transparent focus:outline-none"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="flex items-center bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm">
            <span className="text-black/40 mr-2 text-xs font-medium">To</span>
            <input
              type="date"
              className="bg-transparent focus:outline-none"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <button
            onClick={exportCSV}
            className="group flex items-center gap-1.5 bg-black/5 border border-transparent text-black text-sm font-medium px-4 py-2 rounded-xl hover:bg-black hover:text-white hover:scale-105 transition-all duration-300 shadow-sm hover:shadow-md active:scale-95"
          >
            <Download className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'TRANSACTIONS THIS MONTH', value: summaryFiltered.length, color: 'text-black' },
          {
            label: 'EXPENSES THIS MONTH',
            value: fmt(dashboardSummary?.current_month_spending || 0),
            color: 'text-rose-500',
          },
          {
            label: 'INCOME THIS MONTH',
            value: fmt(dashboardSummary?.current_month_income || 0),
            color: 'text-green-600',
          },
          {
            label: 'MONTHLY SAVINGS',
            value: (() => {
              const income = dashboardSummary?.current_month_income || 0;
              const expense = dashboardSummary?.current_month_spending || 0;
              const net = income - expense;
              return (net >= 0 ? '+' : '-') + fmt(Math.abs(net));
            })(),
            color: (() => {
              const income = dashboardSummary?.current_month_income || 0;
              const expense = dashboardSummary?.current_month_spending || 0;
              return income - expense >= 0 ? 'text-violet-600' : 'text-rose-500';
            })(),
          },
        ].map((card, idx) => (
          <div
            key={idx}
            className="bg-white rounded-2xl p-4 border border-black/5 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
          >
            <span className="text-[10px] font-semibold text-black/40 tracking-wider mb-2 block">{card.label}</span>
            <div className={`text-xl font-bold tracking-tight ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-md shadow-sm">
              <tr className="border-b border-black/5">
                {['Date', 'Description', 'Category', 'Amount', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[10px] font-bold text-black/50 tracking-widest uppercase px-5 py-3.5"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-20">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-[#F5F5F5] rounded-2xl flex items-center justify-center mb-4 border border-black/5">
                        <Receipt className="w-8 h-8 text-black/20" />
                      </div>
                      <p className="text-base font-semibold text-black mb-1.5">No transactions found</p>
                      <p className="text-sm text-black/40 max-w-[300px] leading-relaxed mx-auto">
                        No expenses found. Add your first expense.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((t) => {
                  const cat = categories.find((c) => c.id === t.category_id);
                  return (
                    <tr key={t.id} className="hover:bg-[#F5F5F5]/50 transition-colors group">
                      <td className="px-5 py-3 text-sm text-black/50">{formatDate(t.expense_date)}</td>
                      <td className="px-5 py-3 text-sm font-medium text-black">
                        <div className="flex items-center gap-2">
                          <CategoryEmoji icon={getCategoryIcon(cat)} className="mr-1.5" />
                          {t.note || 'Expense'}
                          {!!(t as any).is_recurring && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 border border-violet-100">
                              <Repeat2 className="w-3 h-3" />
                              Recurring
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${getCategoryBadgeClasses(cat?.name)}`}
                        >
                          <CategoryEmoji icon={getCategoryIcon(cat)} />
                          {cat?.name || 'Unknown'}
                        </span>
                      </td>
                      <td
                        className={`px-5 py-3 text-sm font-semibold ${
                          INCOME_CATEGORIES.includes(cat?.name ?? '') ? 'text-green-600' : 'text-gray-900'
                        }`}
                      >
                        {INCOME_CATEGORIES.includes(cat?.name ?? '') ? '+' : '-'}{fmt(t.amount)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(t)}
                            disabled={isDemoUser}
                            className="p-1.5 text-black/40 hover:text-black hover:bg-black/5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            disabled={isDemoUser}
                            className="p-1.5 text-black/40 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-black/5">
            <span className="text-xs text-black/40">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg text-black/40 hover:text-black disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                    p === page ? 'bg-black text-white' : 'text-black/50 hover:bg-black/5'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg text-black/40 hover:text-black disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <AddTransactionModal
        isOpen={modalOpen || !!editTxn}
        onClose={() => {
          setModalOpen(false);
          setEditTxn(null);
        }}
        editTxn={editTxn}
        onTransactionChanged={notifyFinanceDataChanged}
      />

      <RecurringManagementModal
        isOpen={recurringModalOpen}
        onClose={() => setRecurringModalOpen(false)}
      />
    </div>
  );
}
