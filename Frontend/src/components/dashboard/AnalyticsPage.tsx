import { TrendingUp, TrendingDown, BarChart2, PieChart, Activity, Target } from 'lucide-react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getTransactions, getCategories, getBudgets } from '../../lib/store';

function fmt(n: number) { return '₹' + Math.floor(n).toLocaleString('en-IN'); }

interface TooltipEntry { name: string; value: number; color: string; }
interface TooltipProps { active?: boolean; payload?: TooltipEntry[]; label?: string; }

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-black/5 p-3 rounded-xl shadow-lg">
        <p className="text-sm font-semibold text-black mb-2">{label}</p>
        {payload.map((entry, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs font-medium">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-black/60 capitalize">{entry.name}:</span>
            <span className="text-black">{fmt(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

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
  const map: Record<number, number> = {};
  transactions.filter(t => t.type === 'expense' && t.date.startsWith('2026-06')).forEach(t => {
    map[t.category_id] = (map[t.category_id] || 0) + t.amount;
  });
  const byCategory = Object.entries(map)
    .map(([id, total]) => ({
      cat: categories.find(c => c.id === parseInt(id)) || { name: 'Other', icon: '❓', color: '#9CA3AF', bg: '#F3F4F6' },
      total
    }))
    .sort((a, b) => b.total - a.total);

  const highestCat = byCategory.length > 0 ? byCategory[0].cat.name : 'N/A';
  
  // KPI Calculations
  const avgMonthlyExpense = 40800; // Mocked avg of Jan-May + June
  const expenseGrowth = ((totalExpenses - 41000) / 41000) * 100; // vs May
  const totalBudget = budgets.reduce((acc, b) => acc + b.monthly_limit, 0);
  const totalSpent = budgets.reduce((acc, b) => acc + b.spent, 0);
  const budgetEfficiency = totalBudget > 0 ? ((totalBudget - totalSpent) / totalBudget) * 100 : 0;

  // Monthly Trend Data
  const trendData = [
    { month: 'Jan', income: 62000, expenses: 38000 },
    { month: 'Feb', income: 55000, expenses: 42000 },
    { month: 'Mar', income: 70000, expenses: 35000 },
    { month: 'Apr', income: 65000, expenses: 48000 },
    { month: 'May', income: 58000, expenses: 41000 },
    { month: 'Jun', income: totalIncome || 60000, expenses: totalExpenses || 45000 },
  ];

  // Forecast Data
  const forecastData = [
    { month: 'Jan', actual: 38000 },
    { month: 'Feb', actual: 42000 },
    { month: 'Mar', actual: 35000 },
    { month: 'Apr', actual: 48000 },
    { month: 'May', actual: 41000 },
    { month: 'Jun', actual: totalExpenses || 45000 },
    { month: 'Jul', forecast: 43500 }, // Predicted Next Month
  ];



  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-black tracking-tight">Analytics</h1>
        <p className="text-sm text-black/50">Deep dive into your financial intelligence</p>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'HIGHEST SPENDING', value: highestCat, sub: 'Top Category', icon: PieChart, color: 'text-rose-500' },
          { label: 'AVG MONTHLY EXPENSE', value: fmt(avgMonthlyExpense), sub: 'Last 6 months', icon: BarChart2, color: 'text-violet-600' },
          { label: 'EXPENSE GROWTH', value: `${expenseGrowth > 0 ? '+' : ''}${expenseGrowth.toFixed(1)}%`, sub: 'vs last month', icon: TrendingUp, color: expenseGrowth > 0 ? 'text-rose-500' : 'text-emerald-600' },
          { label: 'BUDGET EFFICIENCY', value: `${Math.round(budgetEfficiency)}%`, sub: 'Savings potential', icon: Target, color: 'text-emerald-600' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl p-4 border border-black/5 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-black/40 tracking-wider">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-xl font-bold tracking-tight ${color} mb-1`}>{value}</div>
            <div className="text-[11px] text-black/40 font-medium">{sub}</div>
          </div>
        ))}
      </div>

      {/* Insight Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-emerald-900">Spending Decreased</h4>
            <p className="text-xs text-emerald-700/80 font-medium mt-0.5">Discretionary spending is down by 72%.</p>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-blue-900">Income Stable</h4>
            <p className="text-xs text-blue-700/80 font-medium mt-0.5">Recurring income sources are consistent.</p>
          </div>
        </div>
        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-violet-900">Budget Adherence</h4>
            <p className="text-xs text-violet-700/80 font-medium mt-0.5">Categories are well within set limits.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Trend Line Chart */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
          <h2 className="font-semibold text-black text-sm mb-5">Monthly Trend</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={(val) => `₹${val/1000}k`} />
                <CartesianGrid vertical={false} stroke="#F3F4F6" strokeDasharray="3 3" />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Area type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" />
                <Area type="monotone" dataKey="expenses" stroke="#F43F5E" strokeWidth={2} fillOpacity={1} fill="url(#colorExpense)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Forecast Visualization */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-5 z-10">
            <div className="bg-violet-50 text-violet-600 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider flex items-center gap-1 border border-violet-100">
              <Activity className="w-3 h-3" /> AI Model Active
            </div>
          </div>
          <h2 className="font-semibold text-black text-sm mb-5">AI Spending Forecast</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={(val) => `₹${val/1000}k`} />
                <CartesianGrid vertical={false} stroke="#F3F4F6" strokeDasharray="3 3" />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="actual" name="Historical" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="forecast" name="Predicted" stroke="#C4B5FD" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 4, fill: '#8B5CF6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Budget Utilisation Table */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-black/5">
          <h2 className="font-semibold text-black text-sm">Category Budget Utilisation</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F5F5F5]/50 border-b border-black/5">
                {['Category', 'Progress', 'Spent', 'Budget', 'Status'].map(h => (
                  <th key={h} className="text-left text-[10px] font-semibold text-black/40 tracking-wider px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {budgets.map(b => {
                const cat  = categories.find(c => c.id === b.category_id) || { name: 'Other', icon: '❓', bg: '#F3F4F6' };
                const pct  = b.monthly_limit > 0 ? Math.min((b.spent / b.monthly_limit) * 100, 100) : 0;
                const over = b.spent >= b.monthly_limit;
                const barColor = pct >= 85 ? '#F43F5E' : pct >= 60 ? '#F59E0B' : '#10B981';
                
                return (
                  <tr key={b.category_id} className="hover:bg-black/[0.02] transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-black">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shadow-sm" style={{ background: cat.bg }}>{cat.icon}</div>
                        {cat.name}
                      </div>
                    </td>
                    <td className="px-5 py-3 w-1/3">
                      <div className="flex items-center gap-3">
                        <div className="w-full h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                        <span className="text-xs font-semibold text-black/50 w-8">{Math.round(pct)}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm font-semibold text-black">{fmt(b.spent)}</td>
                    <td className="px-5 py-3 text-sm text-black/50 font-medium">{fmt(b.monthly_limit)}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${
                        over ? 'bg-rose-50 text-rose-600' : pct >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {over ? 'Critical' : pct >= 60 ? 'Warning' : 'On Track'}
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
