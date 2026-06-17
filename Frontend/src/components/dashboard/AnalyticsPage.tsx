import { useState, useEffect } from 'react';
import { TrendingUp, BarChart2, PieChart, Activity, Target } from 'lucide-react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
  forecastAPI,
  analyticsAPI,
  type Forecast,
  type CategoryBreakdownItem,
  type MonthlyTrendItem,
} from '../../lib/api';
import { getCategoryIcon } from '../../lib/categoryIcons';
import { CategoryEmoji } from './CategoryEmoji';

function fmt(n: number) { return '₹' + Math.floor(n).toLocaleString('en-IN'); }

interface TooltipEntry { name: string; value: number; color: string; }
interface TooltipProps { active?: boolean; payload?: TooltipEntry[]; label?: string; }

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-black/5 p-3 rounded-xl shadow-lg">
        <p className="text-sm font-semibold text-black mb-2">{label}</p>
        {payload.map((entry, index) => (
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
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ category: string; total: number }[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<{ month: string; expenses: number }[]>([]);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setLoading(true);
        const [forecastRes, catBreakdownRes, trendRes] = await Promise.all([
          forecastAPI.getForecast(),
          analyticsAPI.getCategoryBreakdown(),
          analyticsAPI.getMonthlyTrend(),
        ]);

        if (cancelled) return;

        setForecast(forecastRes.data);

        const byCategory = catBreakdownRes.data.breakdown
          ? catBreakdownRes.data.breakdown
              .map((item: CategoryBreakdownItem) => ({
                category: item.category_name,
                total: item.total_amount,
              }))
              .sort((a, b) => b.total - a.total)
          : [];
        setCategoryBreakdown(byCategory);

        const trend = trendRes.data.trend
          ? trendRes.data.trend.map((item: MonthlyTrendItem) => ({
              month: item.month,
              expenses: item.total_amount,
            }))
          : [];
        setMonthlyTrend(trend);
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Calculate KPIs
  const highestCat = categoryBreakdown.length > 0 ? categoryBreakdown[0].category : 'N/A';
  const highestCatDisplay = categoryBreakdown.length > 0 ? (
    <span className="inline-flex items-center gap-1.5">
      <CategoryEmoji icon={getCategoryIcon(highestCat)} />
      {highestCat}
    </span>
  ) : 'N/A';

  const total6MonthExpenses = monthlyTrend.reduce((acc, m) => acc + m.expenses, 0);
  const avgMonthlyExpense = monthlyTrend.length > 0 ? total6MonthExpenses / monthlyTrend.length : 0;
  const currentMonthExp = monthlyTrend.length > 0 ? monthlyTrend[monthlyTrend.length - 1].expenses : 0;
  const prevMonthExp = monthlyTrend.length > 1 ? monthlyTrend[monthlyTrend.length - 2].expenses : 0;
  const expenseGrowth = prevMonthExp > 0 ? ((currentMonthExp - prevMonthExp) / prevMonthExp) * 100 : 0;

  // Build forecast data array
  const forecastData = forecast?.spending_history ? [
    ...forecast.spending_history.map((amount, index) => {
      const d = new Date();
      d.setMonth(d.getMonth() - ((forecast.spending_history!.length - 1) - index));
      const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
      return { month: monthName, actual: amount };
    }),
    {
      month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][new Date().getMonth() + 1],
      forecast: forecast.predicted_spending,
    },
  ] : [];

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
        <h1 className="text-xl font-semibold text-black tracking-tight">Analytics</h1>
        <p className="text-sm text-black/50">Deep dive into your financial intelligence</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'HIGHEST SPENDING', value: highestCatDisplay, sub: 'Top Category', icon: PieChart, color: 'text-rose-500' },
          { label: 'AVG MONTHLY EXPENSE', value: fmt(avgMonthlyExpense), sub: 'Last 6 months', icon: BarChart2, color: 'text-violet-600' },
          { label: 'EXPENSE GROWTH', value: `${expenseGrowth > 0 ? '+' : ''}${expenseGrowth.toFixed(1)}%`, sub: 'vs last month', icon: TrendingUp, color: expenseGrowth > 0 ? 'text-rose-500' : 'text-emerald-600' },
          { label: 'DATA POINTS', value: monthlyTrend.length, sub: 'Trend Points', icon: Target, color: 'text-emerald-600' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl p-4 border border-black/5 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-black/40 tracking-wider">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-xl font-bold tracking-tight ${color} mb-1`}>{value}</div>
            <div className="text-[11px] text-black/40">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Trend Chart */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
          <h2 className="font-semibold text-black text-sm mb-5">Monthly Trend</h2>
          {monthlyTrend.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorExpense" x1="0%" y1="0%" x2="0%" y2="1%">
                      <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#F43F5E" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={(val) => `₹${val / 1000}k`} />
                  <CartesianGrid vertical={false} stroke="#F3F4F6" strokeDasharray="3 3" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#F43F5E" strokeWidth={2} fillOpacity={1} fill="url(#colorExpense)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center">
              <p className="text-sm text-black/60">Not enough data to generate analytics.</p>
            </div>
          )}
        </div>

        {/* Forecast Chart */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-5 z-10">
            <div className="bg-violet-50 text-violet-600 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider flex items-center gap-1 border border-violet-100">
              <Activity className="w-3 h-3" /> AI Model Active
            </div>
          </div>
          <h2 className="font-semibold text-black text-sm mb-5">AI Spending Forecast</h2>
          {forecastData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={(val) => `₹${val / 1000}k`} />
                  <CartesianGrid vertical={false} stroke="#F3F4F6" strokeDasharray="3 3" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Line type="monotone" dataKey="actual" name="Historical" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="forecast" name="Predicted" stroke="#C4B5FD" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 4, fill: '#8B5CF6' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center">
              <p className="text-sm text-black/60">{forecast?.message || 'Not enough data to generate forecast.'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
