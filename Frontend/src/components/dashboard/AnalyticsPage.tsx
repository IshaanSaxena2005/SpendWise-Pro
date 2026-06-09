import { useMemo } from 'react';
import { TrendingUp, TrendingDown, BarChart2, PieChart } from 'lucide-react';
import { getTransactions, getCategories, getBudgets } from '../../lib/store';

function fmt(n: number) { return '₹' + Math.floor(n).toLocaleString('en-IN'); }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function AnalyticsPage() {
  const transactions = getTransactions();
  const categories   = getCategories();
  const budgets      = getBudgets();

  // June 2026 summary
  const juneTxns = transactions.filter(t => t.date.startsWith('2026-06'));
  let totalIncome = 0, totalExpenses = 0;
  juneTxns.forEach(t => {
    if (t.type === 'income') totalIncome += t.amount;
    else totalExpenses += t.amount;
  });

  // Spending by category
  const byCategory = useMemo(() => {
    const map: Record<number, number> = {};
    transactions.filter(t => t.type === 'expense' && t.date.startsWith('2026-06')).forEach(t => {
      map[t.category_id] = (map[t.category_id] || 0) + t.amount;
    });
    return Object.entries(map)
      .map(([id, total]) => ({
        cat: categories.find(c => c.id === parseInt(id)) || { name: 'Other', icon: '❓', color: '#9CA3AF', bg: '#F3F4F6' },
        total
      }))
      .sort((a, b) => b.total - a.total);
  }, [transactions, categories]);

  const maxCatTotal = byCategory[0]?.total || 1;

  // Monthly trend (last 6 months - mock since data is June only)
  const monthlyIncome   = [62000, 55000, 70000, 65000, 58000, totalIncome];
  const monthlyExpenses = [38000, 42000, 35000, 48000, 41000, totalExpenses];
  const maxBar          = Math.max(...monthlyIncome, ...monthlyExpenses, 1);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-black tracking-tight">Analytics</h1>
        <p className="text-sm text-black/50">Spending trends and financial insights</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'INCOME (JUNE)',  value: fmt(totalIncome),    icon: TrendingDown, color: 'text-emerald-600' },
          { label: 'EXPENSES (JUNE)',value: fmt(totalExpenses),   icon: TrendingUp,   color: 'text-rose-500' },
          { label: 'SAVINGS RATE',   value: totalIncome > 0 ? `${Math.round(((totalIncome - totalExpenses) / totalIncome) * 100)}%` : '0%', icon: BarChart2, color: 'text-violet-600' },
          { label: 'CATEGORIES',     value: String(byCategory.length), icon: PieChart, color: 'text-black' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl p-4 border border-black/5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-black/40 tracking-wider">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-xl font-semibold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Bar Chart */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
          <h2 className="font-semibold text-black text-sm mb-5">Income vs Expenses (Last 6 months)</h2>
          <div className="flex items-end gap-3 h-40">
            {MONTHS.slice(0, 6).map((m, i) => (
              <div key={m} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end gap-1" style={{ height: '120px' }}>
                  <div
                    className="flex-1 rounded-t-md bg-emerald-400 transition-all duration-700"
                    style={{ height: `${(monthlyIncome[i] / maxBar) * 120}px` }}
                  />
                  <div
                    className="flex-1 rounded-t-md bg-rose-400 transition-all duration-700"
                    style={{ height: `${(monthlyExpenses[i] / maxBar) * 120}px` }}
                  />
                </div>
                <span className="text-[10px] text-black/40 font-medium">{m}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-5 mt-4">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-400"/><span className="text-xs text-black/50">Income</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-rose-400"/><span className="text-xs text-black/50">Expenses</span></div>
          </div>
        </div>

        {/* Spending by Category */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
          <h2 className="font-semibold text-black text-sm mb-4">Spending by Category</h2>
          {byCategory.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-black/40">No expense data</div>
          ) : (
            <div className="space-y-3">
              {byCategory.slice(0, 6).map(({ cat, total }) => {
                const pct = (total / maxCatTotal) * 100;
                return (
                  <div key={cat.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-black/70">{cat.icon} {cat.name}</span>
                      <span className="text-black/40">{fmt(total)}</span>
                    </div>
                    <div className="w-full h-2 bg-[#F5F5F5] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: cat.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Budget Utilisation */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h2 className="font-semibold text-black text-sm mb-4">Budget Utilisation</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/5">
                {['Category', 'Budget', 'Spent', 'Remaining', 'Status'].map(h => (
                  <th key={h} className="text-left text-[10px] font-semibold text-black/40 tracking-wider px-0 py-2 pr-6">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {budgets.map(b => {
                const cat  = categories.find(c => c.id === b.category_id) || { name: 'Other', icon: '❓' };
                const pct  = b.monthly_limit > 0 ? Math.round((b.spent / b.monthly_limit) * 100) : 0;
                const over = b.spent > b.monthly_limit;
                return (
                  <tr key={b.category_id}>
                    <td className="py-2.5 pr-6 text-sm font-medium text-black">{cat.icon} {cat.name}</td>
                    <td className="py-2.5 pr-6 text-sm text-black/60">{fmt(b.monthly_limit)}</td>
                    <td className="py-2.5 pr-6 text-sm text-black/60">{fmt(b.spent)}</td>
                    <td className={`py-2.5 pr-6 text-sm font-medium ${over ? 'text-rose-500' : 'text-emerald-600'}`}>
                      {over ? `-${fmt(b.spent - b.monthly_limit)}` : fmt(b.monthly_limit - b.spent)}
                    </td>
                    <td className="py-2.5">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        over ? 'bg-rose-50 text-rose-600' : pct >= 70 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {over ? 'Over' : pct >= 70 ? `${pct}% — Warning` : `${pct}% — On Track`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
