import { useState } from 'react';
import { Target, TrendingUp, Wallet, Plus, AlertTriangle } from 'lucide-react';
import { getBudgets, getCategories, setBudget } from '../../lib/store';

function fmt(n: number) { return '₹' + n.toLocaleString('en-IN'); }

export function BudgetsPage() {
  const categories = getCategories();
  const [budgets, setBudgets]       = useState(getBudgets());
  const [catId, setCatId]           = useState(String(categories[0]?.id || '1'));
  const [limit, setLimit]           = useState('');
  const [submitted, setSubmitted]   = useState(false);

  const totalLimit = budgets.reduce((s, b) => s + b.monthly_limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const totalLeft  = Math.max(totalLimit - totalSpent, 0);
  const overallPct = totalLimit > 0 ? Math.min((totalSpent / totalLimit) * 100, 100) : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBudget(parseInt(catId, 10), parseFloat(limit));
    setBudgets(getBudgets());
    setLimit('');
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-black tracking-tight">Budgets</h1>
        <p className="text-sm text-black/50">Set limits, stay on track</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'TOTAL BUDGET', value: fmt(totalLimit), sub: 'Allocated across categories', icon: Target, color: 'text-black' },
          { label: 'TOTAL SPENT',  value: fmt(totalSpent), sub: `${Math.round(overallPct)}% of limit used`, icon: TrendingUp, color: 'text-rose-500' },
          { label: 'REMAINING',    value: fmt(totalLeft),  sub: 'Safe to spend',              icon: Wallet, color: 'text-emerald-600' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl p-5 border border-black/5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold text-black/40 tracking-wider">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-2xl font-semibold ${color} mb-1`}>{value}</div>
            <div className="text-[11px] text-black/40">{sub}</div>
          </div>
        ))}
      </div>

      {/* Budget Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {budgets.map(b => {
          const cat = categories.find(c => c.id === b.category_id) || { name: 'Unknown', icon: '❓', color: '#9CA3AF', bg: '#F3F4F6' };
          const pct = b.monthly_limit > 0 ? Math.min((b.spent / b.monthly_limit) * 100, 100) : 0;
          const isOver = b.spent > b.monthly_limit;
          const barColor = isOver ? '#F43F5E' : pct >= 70 ? '#F59E0B' : '#8B5CF6';

          return (
            <div key={b.category_id} className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: cat.bg }}>
                    {cat.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-black">{cat.name}</p>
                    {isOver && (
                      <div className="flex items-center gap-1 text-rose-500 text-[10px] font-medium mt-0.5">
                        <AlertTriangle className="w-3 h-3" /> Over budget!
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-base font-semibold text-black">{fmt(b.spent)}</p>
                  <p className="text-[11px] text-black/40">of {fmt(b.monthly_limit)}</p>
                </div>
              </div>
              <div className="w-full h-2 bg-[#F5F5F5] rounded-full overflow-hidden mb-2">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: barColor }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-black/40">
                <span>{Math.round(pct)}% used</span>
                <span className={isOver ? 'text-rose-500' : 'text-emerald-600'}>
                  {isOver ? `-${fmt(b.spent - b.monthly_limit)} over` : `${fmt(b.monthly_limit - b.spent)} left`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Set Budget Form */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h2 className="font-semibold text-black text-sm mb-4">Allocate Category Budget</h2>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-black/50 mb-1.5">Category</label>
              <select
                className="w-full bg-[#F5F5F5] rounded-xl px-3 py-2.5 text-sm focus:outline-none cursor-pointer"
                value={catId} onChange={e => setCatId(e.target.value)} required
              >
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-medium text-black/50 mb-1.5">Monthly Limit (₹)</label>
              <input
                type="number" min="1"
                className="w-full bg-[#F5F5F5] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                placeholder="e.g. 5000"
                value={limit} onChange={e => setLimit(e.target.value)} required
              />
            </div>
            <button
              type="submit"
              className="flex items-center gap-2 bg-black text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-gray-800 transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              {submitted ? 'Saved!' : 'Set Budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
