import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, PieChart, CreditCard, Activity, Settings, Bell, Search, User } from 'lucide-react';

export function DashboardLayout() {
  const location = useLocation();

  const navigation = [
    { name: 'Overview', href: '/dashboard', icon: <Home className="w-5 h-5" /> },
    { name: 'Analytics', href: '#', icon: <PieChart className="w-5 h-5" /> },
    { name: 'Transactions', href: '#', icon: <CreditCard className="w-5 h-5" /> },
    { name: 'Budgets', href: '#', icon: <Activity className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-black/5 hidden md:flex flex-col fixed inset-y-0 z-20">
        <div className="p-6 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
            <span className="text-white text-sm font-bold tracking-wider">SW</span>
          </div>
          <span className="text-xl font-semibold text-black">SpendWise Pro</span>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                  isActive 
                    ? 'bg-[#F5F5F5] text-black' 
                    : 'text-black/60 hover:text-black hover:bg-[#F5F5F5]/50'
                }`}
              >
                {item.icon}
                {item.name}
              </Link>
            )
          })}
        </nav>
        
        <div className="p-4 border-t border-black/5">
          <Link to="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-black/60 hover:text-black hover:bg-[#F5F5F5]/50 transition-colors">
            <Settings className="w-5 h-5" />
            Settings
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:pl-64 flex flex-col min-h-screen">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-black/5 flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
              <input 
                type="text" 
                placeholder="Search transactions..."
                className="w-full bg-[#F5F5F5] border-transparent rounded-full pl-10 pr-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:bg-white transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-black/60 hover:text-black hover:bg-[#F5F5F5] rounded-full transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-2 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>
            </button>
            <button className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center border border-black/10">
              <User className="w-4 h-4 text-black/60" />
            </button>
          </div>
        </header>
        
        {/* Page Content */}
        <div className="p-6 lg:p-8 flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
