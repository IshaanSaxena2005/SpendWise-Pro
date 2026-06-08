import { ArrowUpRight, Wallet, CreditCard, Activity, Brain, Clock, MoreHorizontal } from 'lucide-react';

export function DashboardOverview() {
  const recentTransactions = [
    { id: 1, name: 'Whole Foods Market', category: 'Groceries', amount: '-₹4,250', date: 'Today, 2:45 PM', status: 'completed' },
    { id: 2, name: 'Uber Ride', category: 'Transport', amount: '-₹450', date: 'Today, 9:15 AM', status: 'completed' },
    { id: 3, name: 'Monthly Salary', category: 'Income', amount: '+₹85,000', date: 'Yesterday', status: 'completed' },
    { id: 4, name: 'Netflix Subscription', category: 'Entertainment', amount: '-₹649', date: 'Aug 14', status: 'completed' },
  ];

  const budgets = [
    { name: 'Housing', spent: 25000, total: 30000, color: 'bg-indigo-500' },
    { name: 'Food & Dining', spent: 12500, total: 15000, color: 'bg-emerald-500' },
    { name: 'Transportation', spent: 4300, total: 5000, color: 'bg-blue-500' },
    { name: 'Entertainment', spent: 8200, total: 8000, color: 'bg-rose-500', alert: true },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-black mb-1 tracking-tight">Overview</h1>
        <p className="text-black/60 text-sm">Welcome back! Here's your financial summary.</p>
      </div>

      {/* Financial Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-black/5 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="text-black/60 text-sm font-medium">Total Net Worth</div>
            <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center">
              <Wallet className="w-4 h-4 text-black" />
            </div>
          </div>
          <div className="text-3xl font-semibold text-black mb-2">₹12,45,920</div>
          <div className="flex items-center text-emerald-600 text-sm font-medium">
            <ArrowUpRight className="w-4 h-4 mr-1" />
            +2.4% from last month
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-6 border border-black/5 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="text-black/60 text-sm font-medium">Monthly Spending</div>
            <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-black" />
            </div>
          </div>
          <div className="text-3xl font-semibold text-black mb-2">₹42,400</div>
          <div className="flex items-center text-rose-600 text-sm font-medium">
            <ArrowUpRight className="w-4 h-4 mr-1" />
            +5.1% this month
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-6 border border-black/5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="text-black/60 text-sm font-medium flex items-center gap-2">
              Financial Score
            </div>
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
              <Activity className="w-4 h-4 text-indigo-600" />
            </div>
          </div>
          <div className="text-3xl font-semibold text-black mb-2 relative z-10">845</div>
          <div className="flex items-center text-emerald-600 text-sm font-medium relative z-10">
            <ArrowUpRight className="w-4 h-4 mr-1" />
            Excellent health
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Content Area: AI Insights & Transactions */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* AI Insights Alert */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Brain className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h4 className="text-blue-900 font-medium mb-1">Smart Alert: Entertainment Budget</h4>
              <p className="text-blue-800/80 text-sm leading-relaxed">
                You've spent ₹8,200 on entertainment this month, which is ₹200 over your set limit. Based on your history, you usually spend ₹1,500 on weekend dining.
              </p>
            </div>
          </div>

          {/* Transactions */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
            <div className="p-6 border-b border-black/5 flex justify-between items-center">
              <h3 className="font-semibold text-black">Recent Transactions</h3>
              <button className="text-sm text-black/60 hover:text-black font-medium transition-colors">View All</button>
            </div>
            <div className="divide-y divide-black/5">
              {recentTransactions.map((tx) => (
                <div key={tx.id} className="p-4 px-6 flex items-center justify-between hover:bg-[#F5F5F5]/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center">
                      <Clock className="w-4 h-4 text-black/40" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-black">{tx.name}</p>
                      <div className="flex items-center gap-2 text-xs text-black/50 mt-0.5">
                        <span>{tx.category}</span>
                        <span>&bull;</span>
                        <span>{tx.date}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm font-medium ${tx.amount.startsWith('+') ? 'text-emerald-600' : 'text-black'}`}>
                      {tx.amount}
                    </span>
                    <button className="p-1 text-black/40 hover:text-black">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar: Budgets */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-black/5 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-black">Budget Tracking</h3>
              <button className="text-sm text-black/60 hover:text-black font-medium transition-colors">Edit</button>
            </div>
            
            <div className="space-y-5">
              {budgets.map((b, i) => {
                const pct = Math.min((b.spent / b.total) * 100, 100);
                return (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium text-black/80">{b.name}</span>
                      <span className="text-black/60 text-xs mt-0.5">₹{b.spent.toLocaleString()} / ₹{b.total.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-[#F5F5F5] h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${b.alert ? 'bg-rose-500' : b.color}`} 
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
