import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, BarChart2, PieChart, Activity, Target, ArrowUp, ArrowDown, Calendar, DollarSign, Zap, Award, AlertCircle, Maximize2, Minimize2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';
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
      <div className="bg-white/95 backdrop-blur-sm border border-black/10 p-3 rounded-xl shadow-xl">
        <p className="text-sm font-semibold text-black mb-2">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 text-xs font-medium">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-black/60 capitalize">{entry.name}:</span>
            <span className="text-black font-semibold">{fmt(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

const COLORS = ['#F43F5E', '#8B5CF6', '#10B981', '#F59E0B', '#3B82F6', '#EC4899'];

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
      <div className={`p-2 rounded-xl bg-white/20 backdrop-blur-sm`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
    </div>
    <div className={`text-2xl font-bold tracking-tight ${color} mb-1`}>{value}</div>
    <div className="text-[11px] text-black/50 font-medium">{sub}</div>
  </div>
);

const StatCard = ({ label, value, icon: Icon, color }: {
  label: string;
  value: React.ReactNode;
  icon: any;
  color: string;
}) => (
  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20 hover:bg-white/20 transition-all duration-200">
    <div className="flex items-center gap-3 mb-2">
      <div className="p-2 rounded-xl bg-white/20">
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <span className="text-[10px] font-bold text-white/70 tracking-wider uppercase">{label}</span>
    </div>
    <div className="text-xl font-bold text-white">{value}</div>
  </div>
);

const ConfidenceBadge = ({ confidence }: { confidence: number }) => {
  if (confidence >= 95) {
    return (
      <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-md border border-emerald-200">
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        High Confidence
      </div>
    );
  } else if (confidence >= 80) {
    return (
      <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-md border border-amber-200">
        <div className="w-2 h-2 rounded-full bg-amber-500" />
        Medium Confidence
      </div>
    );
  } else {
    return (
      <div className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-1 rounded-md border border-rose-200">
        <div className="w-2 h-2 rounded-full bg-rose-500" />
        Low Confidence
      </div>
    );
  }
};

const InsightCard = ({ icon: Icon, title, value, color }: {
  icon: any;
  title: string;
  value: React.ReactNode;
  color: string;
}) => {
  const colorMap: Record<string, string> = {
    'rose-500': 'bg-rose-50 text-rose-600',
    'emerald-500': 'bg-emerald-50 text-emerald-600',
    'violet-500': 'bg-violet-50 text-violet-600',
  };
  const colorClass = colorMap[color] || 'bg-gray-50 text-gray-600';

  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-black/5 hover:border-black/10 transition-colors">
      <div className={`p-2 rounded-lg shrink-0 ${colorClass.split(' ')[0]}`}>
        <Icon className={`w-4 h-4 ${colorClass.split(' ')[1]}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-semibold text-black/40 uppercase tracking-wider mb-0.5">{title}</div>
        <div className="text-sm font-bold text-black truncate">{value}</div>
      </div>
    </div>
  );
};

const SkeletonCard = () => (
  <div className="bg-white rounded-2xl p-5 border border-black/5 shadow-sm">
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-black/5 rounded w-1/3"></div>
      <div className="h-8 bg-black/5 rounded w-2/3"></div>
      <div className="h-3 bg-black/5 rounded w-1/4"></div>
    </div>
  </div>
);

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

  const lowestCat = categoryBreakdown.length > 0 ? categoryBreakdown[categoryBreakdown.length - 1].category : 'N/A';
  const lowestCatDisplay = categoryBreakdown.length > 0 ? (
    <span className="inline-flex items-center gap-1.5">
      <CategoryEmoji icon={getCategoryIcon(lowestCat)} />
      {lowestCat}
    </span>
  ) : 'N/A';

  const total6MonthExpenses = monthlyTrend.reduce((acc, m) => acc + m.expenses, 0);
  const avgMonthlyExpense = monthlyTrend.length > 0 ? total6MonthExpenses / monthlyTrend.length : 0;
  const currentMonthExp = monthlyTrend.length > 0 ? monthlyTrend[monthlyTrend.length - 1].expenses : 0;
  const prevMonthExp = monthlyTrend.length > 1 ? monthlyTrend[monthlyTrend.length - 2].expenses : 0;
  const expenseGrowth = prevMonthExp > 0 ? ((currentMonthExp - prevMonthExp) / prevMonthExp) * 100 : 0;

  // Calculate insights
  const avgDailySpending = avgMonthlyExpense > 0 ? avgMonthlyExpense / 30 : 0;
  const bestMonth = monthlyTrend.length > 0 ? monthlyTrend.reduce((min, m) => m.expenses < min.expenses ? m : min, monthlyTrend[0]) : null;
  const worstMonth = monthlyTrend.length > 0 ? monthlyTrend.reduce((max, m) => m.expenses > max.expenses ? m : max, monthlyTrend[0]) : null;

  // Prepare pie chart data
  const pieData = categoryBreakdown.map((item, index) => ({
    name: item.category,
    value: item.total,
    color: COLORS[index % COLORS.length],
  }));

  if (loading) {
    return (
      <div className="space-y-5 max-w-7xl mx-auto p-5">
        <div>
          <h1 className="text-xl font-semibold text-black tracking-tight">Analytics</h1>
          <p className="text-sm text-black/50">Deep dive into your financial intelligence</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-black tracking-tight">Analytics</h1>
        <p className="text-sm text-black/50 mt-1">Deep dive into your financial intelligence</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="HIGHEST SPENDING"
          value={highestCatDisplay}
          sub="Top Category"
          icon={PieChart}
          color="text-rose-600"
          gradient="from-rose-50 to-rose-100"
        />
        <KPICard
          label="AVG MONTHLY EXPENSE"
          value={fmt(avgMonthlyExpense)}
          sub="Last 6 months"
          icon={BarChart2}
          color="text-violet-600"
          gradient="from-violet-50 to-violet-100"
        />
        <KPICard
          label="EXPENSE GROWTH"
          value={`${expenseGrowth > 0 ? '+' : ''}${expenseGrowth.toFixed(1)}%`}
          sub="vs last month"
          icon={expenseGrowth > 0 ? TrendingUp : TrendingDown}
          color={expenseGrowth > 0 ? 'text-rose-600' : 'text-emerald-600'}
          gradient={expenseGrowth > 0 ? 'from-rose-50 to-rose-100' : 'from-emerald-50 to-emerald-100'}
        />
        <KPICard
          label="DATA POINTS"
          value={monthlyTrend.length}
          sub="Trend Points"
          icon={Target}
          color="text-emerald-600"
          gradient="from-emerald-50 to-emerald-100"
        />
      </div>

      {/* Monthly Trend & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly Trend Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-black/5 shadow-sm p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-black text-sm">Monthly Trend</h2>
            <div className="bg-black/5 text-[10px] font-semibold px-2 py-1 rounded-md text-black/60 uppercase tracking-wider">
              Last 6 Months
            </div>
          </div>
          {monthlyTrend.length > 0 ? (
            <div className="relative">
              {/* Floating Summary */}
              <div className="absolute top-0 left-0 z-10 bg-white/95 backdrop-blur-sm rounded-xl p-3 border border-black/10 shadow-lg">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Maximize2 className="w-3 h-3 text-rose-500" />
                    <div>
                      <div className="text-[9px] text-black/40 uppercase tracking-wider">Highest</div>
                      <div className="text-xs font-bold text-black">{worstMonth?.month || 'N/A'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Minimize2 className="w-3 h-3 text-emerald-500" />
                    <div>
                      <div className="text-[9px] text-black/40 uppercase tracking-wider">Lowest</div>
                      <div className="text-xs font-bold text-black">{bestMonth?.month || 'N/A'}</div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-black/10">
                    <div className="text-[9px] text-black/40 uppercase tracking-wider">Average</div>
                    <div className="text-xs font-bold text-black">{fmt(avgMonthlyExpense)}</div>
                  </div>
                </div>
              </div>
              
              <div className="h-96 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyTrend} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorExpense" x1="0%" y1="0%" x2="0%" y2="1%">
                        <stop offset="0%" stopColor="#F43F5E" stopOpacity={0.5} />
                        <stop offset="50%" stopColor="#F43F5E" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#F43F5E" stopOpacity={0} />
                      </linearGradient>
                      <filter id="glow">
                        <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                        <feMerge>
                          <feMergeNode in="coloredBlur"/>
                          <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                      </filter>
                    </defs>
                    <XAxis 
                      dataKey="month" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#6B7280', fontWeight: 500 }} 
                      tickMargin={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#6B7280', fontWeight: 500 }} 
                      tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                      tickMargin={10}
                    />
                    <CartesianGrid 
                      vertical={false} 
                      stroke="#E5E7EB" 
                      strokeDasharray="4 4"
                      strokeOpacity={0.5}
                    />
                    <Tooltip 
                      content={<CustomTooltip />}
                      cursor={{ stroke: '#F43F5E', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Area 
                      type="natural" 
                      dataKey="expenses" 
                      name="Expenses" 
                      stroke="#F43F5E" 
                      strokeWidth={3} 
                      fillOpacity={1} 
                      fill="url(#colorExpense)"
                      activeDot={{ 
                        r: 8, 
                        strokeWidth: 3, 
                        stroke: '#F43F5E',
                        fill: '#FFFFFF',
                        filter: 'url(#glow)'
                      }}
                      dot={(props: any) => {
                        const { cx, cy, payload, index } = props;
                        const isLast = index === monthlyTrend.length - 1;
                        const isHighest = payload.expenses === (worstMonth?.expenses || 0);
                        const isLowest = payload.expenses === (bestMonth?.expenses || 0);
                        
                        if (isLast) {
                          return (
                            <g>
                              <circle cx={cx} cy={cy} r={12} fill="#F43F5E" fillOpacity={0.2} />
                              <circle cx={cx} cy={cy} r={8} fill="#F43F5E" filter="url(#glow)" />
                              <circle cx={cx} cy={cy} r={4} fill="#FFFFFF" />
                            </g>
                          );
                        }
                        if (isHighest) {
                          return (
                            <circle cx={cx} cy={cy} r={5} fill="#F43F5E" stroke="#FFFFFF" strokeWidth={2} />
                          );
                        }
                        if (isLowest) {
                          return (
                            <circle cx={cx} cy={cy} r={5} fill="#10B981" stroke="#FFFFFF" strokeWidth={2} />
                          );
                        }
                        return null;
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="h-96 flex items-center justify-center">
              <p className="text-sm text-black/60">Not enough data to generate analytics.</p>
            </div>
          )}
        </div>

        {/* Category Breakdown */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 flex flex-col justify-between h-full">
          <h2 className="font-semibold text-black text-sm mb-2">Category Breakdown</h2>
          {pieData.length > 0 ? (
            <div className="flex-1 flex flex-col items-center justify-between">
              <div className="h-56 w-full flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2 w-full">
                {pieData.slice(0, 5).map((item, index) => (
                  <div key={index} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-black/60">{item.name}</span>
                    </div>
                    <span className="font-semibold text-black">{((item.value / total6MonthExpenses) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[320px] flex items-center justify-center">
              <p className="text-sm text-black/60">No category data available.</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Spending Forecast */}
      <div className="bg-gradient-to-br from-violet-600 to-violet-800 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-bl-full -z-10" />
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold mb-1">AI Spending Forecast</h2>
            <p className="text-xs text-white/70">Powered by machine learning</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm text-[10px] font-bold px-3 py-1.5 rounded-md uppercase tracking-wider flex items-center gap-1.5 border border-white/30">
            <Activity className="w-3 h-3" /> AI Model Active
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Predicted Spending"
            value={forecast?.predicted_spending ? fmt(forecast.predicted_spending) : '—'}
            icon={Target}
            color="text-white"
          />
          <StatCard
            label="Confidence"
            value={forecast?.confidence ? `${forecast.confidence}%` : '—'}
            icon={Award}
            color="text-white"
          />
          <StatCard
            label="Trend"
            value={forecast?.trend_direction || '—'}
            icon={TrendingUp}
            color="text-white"
          />
          <StatCard
            label="MAE"
            value={forecast?.mae ? fmt(forecast.mae) : '—'}
            icon={AlertCircle}
            color="text-white"
          />
        </div>
        {forecast && (
          <div className="mt-4 flex items-center gap-3">
            <ConfidenceBadge confidence={forecast.confidence || 0} />
            <span className="text-xs text-white/70">Based on {forecast.spending_history?.length || 0} months of historical data</span>
          </div>
        )}
      </div>

      {/* Spending Insights & Monthly Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Spending Insights */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
          <h2 className="font-semibold text-black text-sm mb-4">Spending Insights</h2>
          <div className="space-y-3">
            <InsightCard
              icon={Zap}
              title="Highest Spending Category"
              value={highestCatDisplay}
              color="rose-500"
            />
            <InsightCard
              icon={DollarSign}
              title="Lowest Spending Category"
              value={lowestCatDisplay}
              color="emerald-500"
            />
            <InsightCard
              icon={Calendar}
              title="Average Daily Spending"
              value={fmt(avgDailySpending)}
              color="violet-500"
            />
            <InsightCard
              icon={Award}
              title="Best Saving Month"
              value={bestMonth ? `${bestMonth.month} (${fmt(bestMonth.expenses)})` : 'N/A'}
              color="emerald-500"
            />
            <InsightCard
              icon={AlertCircle}
              title="Worst Spending Month"
              value={worstMonth ? `${worstMonth.month} (${fmt(worstMonth.expenses)})` : 'N/A'}
              color="rose-500"
            />
          </div>
        </div>

        {/* Monthly Comparison */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
          <h2 className="font-semibold text-black text-sm mb-4">Monthly Comparison</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-black/5 rounded-xl">
              <div>
                <div className="text-[10px] font-semibold text-black/40 uppercase tracking-wider mb-1">Current Month</div>
                <div className="text-xl font-bold text-black">{fmt(currentMonthExp)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold text-black/40 uppercase tracking-wider mb-1">Previous Month</div>
                <div className="text-xl font-bold text-black">{fmt(prevMonthExp)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-black/5 rounded-xl">
              <div>
                <div className="text-[10px] font-semibold text-black/40 uppercase tracking-wider mb-1">Difference</div>
                <div className={`text-xl font-bold ${expenseGrowth > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {expenseGrowth > 0 ? '+' : ''}{fmt(currentMonthExp - prevMonthExp)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold text-black/40 uppercase tracking-wider mb-1">Change</div>
                <div className={`text-xl font-bold flex items-center gap-1 ${expenseGrowth > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {expenseGrowth > 0 ? <ArrowUp className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />}
                  {Math.abs(expenseGrowth).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
