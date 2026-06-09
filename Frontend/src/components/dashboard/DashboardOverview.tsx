import { useState } from 'react';
import { TrendingUp, TrendingDown, CreditCard, Target, Brain, Edit2, Trash2 } from 'lucide-react';
import {
  getTransactions, getBudgets, getCategories, getInsights, getAIScore,
  deleteTransaction, type Transaction
} from '../../lib/store';
import { AddTransactionModal } from './AddTransactionModal';

function fmt(n: number) {
  return '₹' + Math.floor(n).toLocaleString('en-IN');
}

function shortDate(d: string) {
  const dt = new Date(d);
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()] + ' ' + dt.getDate();
}

export function DashboardOverview() {
  const [editTxn, setEditTxn] = useState<Transaction | null>(null);
  const transactions = getTransactions();
  const budgets      = getBudgets();
  const categories   = getCategories();
  const insights     = getInsights();
  const aiScore      = getAIScore();

  const juneTxns = transactions.filter(t => t.date.startsWith('2026-06'));
  let totalIncome = 0, totalExpenses = 0;
  juneTxns.forEach(t => {
    if (t.type === 'income') totalIncome += t.amount;
    else totalExpenses += t.amount;
  });
  const totalBalance = totalIncome - totalExpenses;

  const activeBudgets = budgets.filter(b => b.monthly_limit > 0);
  const totalLimit = activeBudgets.reduce((s, b) => s + b.monthly_limit, 0);
  const totalSpent = activeBudgets.reduce((s, b) => s + b.spent, 0);
  const budgetLeft = Math.max(totalLimit - totalSpent, 0);
  const budgetPct  = totalLimit > 0 ? Math.min((totalSpent / totalLimit) * 100, 100) : 0;

  const handleDelete = (id: number) => {
    if (confirm('Delete this transaction?')) {
      deleteTransaction(id);
      window.location.reload();
    }
  };

  const insightColors: Record<string, string> = {
    danger: 'bg-rose-500', warning: 'bg-amber-400', success: 'bg-emerald-500', info: 'bg-blue-500'
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Page Title */}
      <div>
        <h1 className="text-xl font-semibold text-black tracking-tight">Dashboard</h1>
        <p className="text-sm text-black/50">Here's your financial overview</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: 'TOTAL BALANCE', value: fmt(totalBalance), sub: '+8% vs last month', icon: CreditCard, color: 'text-black' },
          { label: 'TOTAL INCOME',  value: fmt(totalIncome),  sub: 'Salary + freelance',  icon: TrendingDown, color: 'text-emerald-600' },
          { label: 'TOTAL EXPENSES',value: fmt(totalExpenses),sub: '+12% vs last month',  icon: TrendingUp,   color: 'text-rose-500' },
          { label: 'BUDGET LEFT',   value: fmt(budgetLeft),   sub: `${Math.round(budgetPct)}% used`, icon: Target, color: 'text-violet-600' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl p-4 border border-black/5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold text-black/40 tracking-wider">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-xl font-semibold ${color} mb-1`}>{value}</div>
            <div className="text-[11px] text-black/40">{sub}</div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Recent Transactions */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
            <h2 className="font-semibold text-black text-sm">Recent Transactions</h2>
            <a href="/dashboard/expenses" className="text-xs text-violet-600 font-medium hover:underline">View all →</a>
          </div>
          <div className="divide-y divide-black/5">
            {transactions.slice(0, 8).map(t => {
              const cat = categories.find(c => c.id === t.category_id) || { name: 'Other', icon: '❓', color: '#9CA3AF', bg: '#F3F4F6' };
              return (
                <div key={t.id} className="flex items-center justify-between px-5 py-3 hover:bg-[#F5F5F5]/50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0" style={{ background: cat.bg }}>{cat.icon}</div>
                    <div>
                      <p className="text-sm font-medium text-black leading-none mb-0.5">{t.title}</p>
                      <p className="text-[11px] text-black/40">{cat.name} · {shortDate(t.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${t.type === 'income' ? 'text-emerald-600' : 'text-black'}`}>
                      {t.type === 'income' ? '+' : '-'}{fmt(t.amount)}
                    </span>
                    <div className="hidden group-hover:flex items-center gap-1">
                      <button onClick={() => setEditTxn(t)} className="p-1 text-black/30 hover:text-black rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(t.id)} className="p-1 text-black/30 hover:text-rose-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Budget Tracker */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-black text-sm">Budget Tracker</h2>
              <a href="/dashboard/budgets" className="text-xs text-violet-600 font-medium hover:underline">Edit →</a>
            </div>
            <div className="space-y-3">
              {budgets.slice(0, 4).map(b => {
                const cat = categories.find(c => c.id === b.category_id);
                const pct = b.monthly_limit > 0 ? Math.min((b.spent / b.monthly_limit) * 100, 100) : 0;
                const barColor = pct >= 100 ? '#F43F5E' : pct >= 70 ? '#F59E0B' : '#8B5CF6';
                return (
                  <div key={b.category_id}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-medium text-black/70">{cat?.name}</span>
                      <span className="text-black/40">{fmt(b.spent)} / {fmt(b.monthly_limit)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Health Score */}
          <div className="bg-gradient-to-br from-violet-600 to-violet-800 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium opacity-90">AI Financial Health</span>
              <Brain className="w-4 h-4 opacity-80" />
            </div>
            <div className="text-4xl font-bold mb-1">{aiScore}</div>
            <div className="text-xs opacity-70 mb-4">
              {aiScore >= 80 ? 'Excellent' : aiScore >= 70 ? 'Good' : aiScore >= 50 ? 'Fair' : 'Needs Attention'}
            </div>
            <div className="space-y-2">
              {insights.slice(0, 2).map((ins, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${insightColors[ins.type] || 'bg-white'}`} />
                  <div>
                    <p className="text-xs font-medium opacity-90">{ins.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editTxn && (
        <AddTransactionModal isOpen={true} onClose={() => setEditTxn(null)} editTxn={editTxn} />
      )}
    </div>
  );
}
