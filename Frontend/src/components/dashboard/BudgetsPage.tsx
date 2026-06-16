import { useState } from 'react';
import { Target, TrendingUp, Wallet, Plus, AlertTriangle, Brain } from 'lucide-react';
import { getCategories } from '../../lib/store';
import { useBudgets, setBudgetApi } from '../../lib/budgets';

function fmt(n: number) { return '₹' + n.toLocaleString('en-IN'); }

export function BudgetsPage() {
  const categories = getCategories();
  const { budgets, refresh } = useBudgets();
  const [catId, setCatId]           = useState(String(categories[0]?.id || '1'));
  const [limit, setLimit]           = useState('');
  const [submitted, setSubmitted]   = useState(false);
  const [filter, setFilter]         = useState('All');
  const [saving, setSaving]         = useState(false);

  const totalLimit = budgets.reduce((s, b) => s + b.monthly_limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const totalLeft  = Math.max(totalLimit - totalSpent, 0);
  const overallPct = totalLimit > 0 ? Math.min((totalSpent / totalLimit) * 100, 100) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setBudgetApi(parseInt(catId, 10), parseFloat(limit));
      await refresh();
      setLimit('');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2000);
    } catch {
      alert('Failed to save budget.');
    } finally {
      setSaving(false);
    }
  };

  const filteredBudgets = budgets.filter(b => {
    const pct = b.monthly_limit > 0 ? (b.spent / b.monthly_limit) * 100 : 0;
    if (filter === 'All') return true;
    if (filter === 'On Track') return pct < 60;
    if (filter === 'Warning') return pct >= 60 && pct < 85;
    if (filter === 'Critical') return pct >= 85;
    return true;
  });

  const alerts = budgets.filter(b => b.monthly_limit > 0 && b.spent / b.monthly_limit >= 0.85);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-black tracking-tight">Budgets</h1>
        <p className="text-sm text-black/50">Set limits, stay on track</p>
      </div>

      {/* Top Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* AI Warnings */}
        <div className="lg:col-span-2">
          {alerts.length > 0 ? (
            <div className="bg-gradient-to-br from-violet-600 to-violet-900 rounded-2xl p-6 shadow-md relative overflow-hidden group h-full">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full -z-0 group-hover:scale-110 transition-transform duration-500"></div>
              <div className="flex items-center gap-2 mb-4 relative z-10">
                <Brain className="w-5 h-5 text-violet-200" />
                <h3 className="text-base font-semibold text-white tracking-tight">AI Budget Monitor</h3>
              </div>
              <div className="space-y-3 relative z-10">
                {alerts.map(b => {
                  const cat = categories.find(c => c.id === b.category_id);
                  const pct = b.monthly_limit > 0 ? (b.spent / b.monthly_limit) * 100 : 0;
                  const confidence = Math.min(Math.round(pct), 99);
                  return (
                    <div key={b.category_id} className="bg-black/20 backdrop-blur-sm rounded-xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-400" />
                        <p className="text-sm font-medium text-white">
                          <span className="font-bold text-rose-300">{cat?.name}</span> may exceed budget by {fmt(b.spent * 1.2 - b.monthly_limit)} this month.
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Utilization</div>
                        <div className="text-sm font-semibold text-white">{confidence}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-[#F5F5F5] rounded-2xl p-6 border border-black/5 h-full flex flex-col items-center justify-center text-center">
              <Target className="w-8 h-8 text-black/20 mb-3" />
              <p className="text-sm font-semibold text-black mb-1">All budgets on track</p>
              <p className="text-xs text-black/40">AI sees no immediate risks.</p>
            </div>
          )}
        </div>

        {/* Circular Budget Utilization */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 flex flex-col items-center justify-center text-center group hover:border-violet-200 transition-colors">
          <h3 className="text-sm font-semibold text-black mb-6">Overall Utilization</h3>
          <div className="relative flex items-center justify-center w-32 h-32 mb-4">
            <svg className="transform -rotate-90 w-32 h-32 drop-shadow-sm">
              <circle cx="64" cy="64" r="54" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-black/5" />
              <circle cx="64" cy="64" r="54" stroke="url(#overallGradient)" strokeWidth="12" fill="transparent" strokeDasharray={2 * Math.PI * 54} strokeDashoffset={(2 * Math.PI * 54) - ((overallPct / 100) * (2 * Math.PI * 54))} className="transition-all duration-1000 ease-out stroke-round" strokeLinecap="round" />
              <defs>
                <linearGradient id="overallGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={overallPct >= 85 ? '#F43F5E' : overallPct >= 60 ? '#F59E0B' : '#10B981'} />
                  <stop offset="100%" stopColor={overallPct >= 85 ? '#E11D48' : overallPct >= 60 ? '#D97706' : '#059669'} />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-black tracking-tight">{Math.round(overallPct)}%</span>
            </div>
          </div>
          <p className="text-xs text-black/50 font-medium">Safe to spend: <span className="text-emerald-600 font-bold">{fmt(totalLeft)}</span></p>
        </div>
      </div>

      {/* Filters & Grid */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {['All', 'On Track', 'Warning', 'Critical'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              filter === f
                ? 'bg-black text-white shadow-md'
                : 'bg-white border border-black/10 text-black/60 hover:text-black hover:border-black/20'
            }`}
          >
            {f}
          </button>
        ))}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredBudgets.map(b => {
          const cat = categories.find(c => c.id === b.category_id) || { name: 'Unknown', icon: '❓', color: '#9CA3AF', bg: '#F3F4F6' };
          const pct = b.monthly_limit > 0 ? Math.min((b.spent / b.monthly_limit) * 100, 100) : 0;
          const isOver = b.spent >= b.monthly_limit;
          const barColor = pct >= 85 ? '#F43F5E' : pct >= 60 ? '#F59E0B' : '#10B981';
          const statusText = pct >= 85 ? 'Critical' : pct >= 60 ? 'Warning' : 'On Track';
          const statusColor = pct >= 85 ? 'bg-rose-50 text-rose-600' : pct >= 60 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600';

          return (
            <div key={b.category_id} className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-sm" style={{ background: cat.bg }}>
                    {cat.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-black leading-tight">{cat.name}</p>
                    <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase ${statusColor}`}>
                      {statusText}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-black tracking-tight">{fmt(b.spent)}</p>
                  <p className="text-[11px] text-black/40 font-medium">of {fmt(b.monthly_limit)}</p>
                </div>
              </div>
              <div className="w-full h-2.5 bg-[#F5F5F5] rounded-full overflow-hidden mb-2.5">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
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
              disabled={saving}
              className="flex items-center gap-2 bg-black text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-gray-800 transition-colors shrink-0 disabled:opacity-55"
            >
              <Plus className="w-4 h-4" />
              {submitted ? 'Saved!' : saving ? 'Saving…' : 'Set Budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
