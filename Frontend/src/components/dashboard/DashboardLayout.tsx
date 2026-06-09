import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard, Receipt, Target, BarChart2,
  Lightbulb, LogOut, Menu, X, Bell, User, Plus
} from 'lucide-react';
import { AddTransactionModal } from './AddTransactionModal';

const navItems = [
  { name: 'Dashboard',    href: '/dashboard',            icon: LayoutDashboard },
  { name: 'Transactions', href: '/dashboard/expenses',   icon: Receipt },
  { name: 'Budgets',      href: '/dashboard/budgets',    icon: Target },
  { name: 'Analytics',    href: '/dashboard/analytics',  icon: BarChart2 },
  { name: 'Insights',     href: '/dashboard/insights',   icon: Lightbulb },
];

export function DashboardLayout() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modalOpen,   setModalOpen]   = useState(false);

  const handleLogout = () => navigate('/');

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-black/5">
        <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold tracking-wider">SW</span>
        </div>
        <span className="text-base font-semibold text-black">SpendWise Pro</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ name, href, icon: Icon }) => {
          const active = location.pathname === href ||
            (href !== '/dashboard' && location.pathname.startsWith(href));
          return (
            <Link
              key={name}
              to={href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                active
                  ? 'bg-black text-white shadow-sm'
                  : 'text-black/60 hover:text-black hover:bg-black/5'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-black/5">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-black/50 hover:text-black hover:bg-black/5 w-full transition-all"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Back to Home
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-black/5 fixed inset-y-0 z-20">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 w-56 bg-white z-40 md:hidden transform transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:pl-56 flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-black/5 flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
          <button
            className="md:hidden p-2 text-black/60 hover:text-black rounded-lg"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="hidden md:block" />

          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 bg-black text-white text-sm font-medium px-3 py-1.5 rounded-full hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Transaction</span>
            </button>
            <button className="relative p-2 text-black/50 hover:text-black hover:bg-black/5 rounded-full transition-colors">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-500 rounded-full" />
            </button>
            <button className="w-8 h-8 rounded-full bg-[#F5F5F5] border border-black/10 flex items-center justify-center">
              <User className="w-4 h-4 text-black/50" />
            </button>
          </div>
        </header>

        {/* Close mobile sidebar icon inside sidebar */}
        {sidebarOpen && (
          <button
            className="fixed top-4 left-48 z-50 md:hidden p-1 text-black/60"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Page Content */}
        <div className="p-4 md:p-6 flex-1">
          <Outlet context={{ openAddModal: () => setModalOpen(true) }} />
        </div>
      </main>

      {/* Add Transaction Modal */}
      <AddTransactionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
