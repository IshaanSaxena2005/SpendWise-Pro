import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import {
  LayoutDashboard, Receipt, Target, BarChart2,
  Lightbulb, LogOut, Menu, X, Bell, Plus, Settings, History
} from 'lucide-react';
import { AddTransactionModal } from './AddTransactionModal';
import { AskSpendWiseAI } from './AskSpendWiseAI';
import { useAuth } from '../../context/AuthContext';
import type { AuthUser } from '../../context/AuthContext';
import { AvatarCircle } from './ProfilePhotoUploader';
import { AVATAR_UPDATED_EVENT, fetchProfileAvatar } from '../../lib/avatar';
import { DEMO_EMAIL } from '../../lib/constants';

const navItems = [
  { name: 'Dashboard',    href: '/dashboard',            icon: LayoutDashboard },
  { name: 'Transactions', href: '/dashboard/expenses',   icon: Receipt },
  { name: 'Budgets',      href: '/dashboard/budgets',    icon: Target },
  { name: 'Analytics',   href: '/dashboard/analytics',  icon: BarChart2 },
  { name: 'History',      href: '/dashboard/history',    icon: History },
  { name: 'Insights',     href: '/dashboard/insights',   icon: Lightbulb },
  { name: 'Goals',        href: '/dashboard/goals',      icon: Target },
];

interface SidebarProps {
  user: AuthUser;
  pathname: string;
  onNavClick: () => void;
  onLogout: () => void;
}

function SidebarContent({ user, pathname, onNavClick, onLogout }: SidebarProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const fetchAvatar = async () => {
    try {
      const url = await fetchProfileAvatar();
      setAvatarUrl(url);
    } catch {
      setAvatarUrl(null);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAvatar();

    const handleAvatarUpdated = (event: Event) => {
      setAvatarUrl(
        (event as CustomEvent<{ url: string | null }>).detail.url
      );
    };

    window.addEventListener(AVATAR_UPDATED_EVENT, handleAvatarUpdated);

    return () => {
      window.removeEventListener(AVATAR_UPDATED_EVENT, handleAvatarUpdated);
    };
  }, [user.email]); // Re-fetch when user's email changes (i.e., new login)

  return (
    <div className="sidebar-motion flex flex-col h-full">
      {/* Logo */}
      <Link
        to="/dashboard"
        onClick={onNavClick}
        className="group flex items-center gap-4 px-5 py-5 border-b border-black/5"
      >
        <div className="w-12 h-12 rounded-lg shadow-sm border border-black/5 flex items-center justify-center overflow-hidden shrink-0 transition-all duration-200 ease-out group-hover:shadow-md group-hover:scale-105">
          <img
            src="/logo2.png"
            alt="SpendWise Pro"
            className="w-full h-full object-contain"
          />
        </div>

        <span className="text-lg font-extrabold text-black tracking-tight whitespace-nowrap transition-colors duration-200 group-hover:text-violet-600">
          SpendWise Pro
        </span>
      </Link>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ name, href, icon: Icon }) => {
          const active = pathname === href ||
            (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={name}
              to={href}
              onClick={onNavClick}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ease-out ${
                active
                  ? 'bg-black text-white shadow-md shadow-black/10'
                  : 'text-black/60 hover:text-black hover:bg-black/5 hover:translate-x-1'
              }`}
            >
              {/* Active-page indicator bar */}
              <span
                className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-violet-400 transition-all duration-200 ease-out ${
                  active ? 'h-5 opacity-100' : 'h-0 opacity-0'
                }`}
              />
              <Icon className="w-4 h-4 shrink-0 transition-transform duration-200 ease-out group-hover:scale-110" />
              {name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-black/5 flex flex-col gap-1">
        <Link
          to="/dashboard/settings"
          onClick={onNavClick}
          className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ease-out ${
            pathname.includes('/settings')
              ? 'bg-black text-white shadow-md shadow-black/10'
              : 'text-black/60 hover:text-black hover:bg-black/5 hover:translate-x-1'
          }`}
        >
          <span
            className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-violet-400 transition-all duration-200 ease-out ${
              pathname.includes('/settings') ? 'h-5 opacity-100' : 'h-0 opacity-0'
            }`}
          />
          <Settings className="w-4 h-4 shrink-0 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:rotate-45" />
          Settings
        </Link>

        <div className="h-px bg-black/5 my-2 mx-2" />

        {/* User Profile Mini */}
        <Link to="/dashboard/profile" onClick={onNavClick} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-black/5 hover:-translate-y-0.5 transition-all duration-200 ease-out cursor-pointer group">
          <AvatarCircle userName={user.full_name} avatarUrl={avatarUrl} size="sm" className="transition-all duration-200 group-hover:border-black/20 group-hover:scale-105" />
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-semibold text-black leading-tight truncate group-hover:text-violet-600 transition-colors">{user.full_name}</span>
            <span className="text-[11px] text-black/50 font-medium truncate">{user.role}</span>
          </div>
        </Link>

        <button
          onClick={onLogout}
          className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-500 hover:text-rose-600 hover:bg-rose-50 hover:translate-x-1 w-full transition-all duration-200 ease-out mt-1"
        >
          <LogOut className="w-4 h-4 shrink-0 transition-transform duration-200 ease-out group-hover:scale-110" />
          Logout
        </button>
      </div>
    </div>
  );
}

export function DashboardLayout() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [hasUnread,   setHasUnread]   = useState(() => {
    return localStorage.getItem('sw_notif_read') !== 'true';
  });
  
  const { user, logout } = useAuth();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (!user) return null;

  const isDemoUser = user.email === DEMO_EMAIL;
  const isProfileOrSettings = location.pathname.includes('/profile') || location.pathname.includes('/settings');

  const bellRef = useRef<HTMLButtonElement>(null);
  const [notifPos, setNotifPos] = useState<{ top: number; right: number } | null>(null);

  const handleLogout = async () => {
    await logout(); // clears cookies server-side + clears AuthContext state
    navigate('/');
  };

  const handleOpenNotif = () => {
    if (bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setNotifPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setNotifOpen(v => !v);
    if (!notifOpen) {
      setHasUnread(false);
      localStorage.setItem('sw_notif_read', 'true');
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-black/5 fixed inset-y-0 z-20">
        <SidebarContent
          user={user}
          pathname={location.pathname}
          onNavClick={() => setSidebarOpen(false)}
          onLogout={handleLogout}
        />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 w-56 bg-white z-40 md:hidden transform transition-transform duration-[250ms] ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent
          user={user}
          pathname={location.pathname}
          onNavClick={() => setSidebarOpen(false)}
          onLogout={handleLogout}
        />
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:pl-56 flex flex-col min-h-screen">
        <header className="h-16 bg-white border-b border-black/5 flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
          <div className="flex items-center gap-4 flex-1">
            <button
              className="md:hidden p-2 text-black/60 hover:text-black rounded-lg transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden md:block flex-1" />
          </div>

          <div className="flex items-center gap-3 md:gap-4 relative">
            {isDemoUser && (
              <div className="hidden sm:flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                Demo Mode (Read-only)
              </div>
            )}
            {!isProfileOrSettings && !isDemoUser && (
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-1.5 bg-black text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-gray-800 hover-lift transition-colors shadow-sm hover:shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Transaction</span>
              </button>
            )}
            {!isProfileOrSettings && <div className="w-px h-6 bg-black/10 hidden sm:block mx-1"></div>}
            
            <div className="relative">
              <button
                ref={bellRef}
                onClick={handleOpenNotif}
                className="relative p-2 text-black/50 hover:text-black hover:bg-black/5 rounded-full transition-colors"
              >
                <Bell className="w-5 h-5" />
                {hasUnread && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />}
              </button>

              {/* Notification Dropdown — rendered via portal so it always floats above every page element */}
              {notifOpen && notifPos && createPortal(
                <>
                  <div className="fixed inset-0 z-[9998]" onClick={() => setNotifOpen(false)} />
                  <div
                    className="fixed w-80 bg-white rounded-2xl shadow-xl border border-black/5 z-[9999] overflow-hidden"
                    style={{ top: notifPos.top, right: notifPos.right }}
                  >
                    <div className="px-4 py-3 border-b border-black/5 flex justify-between items-center">
                      <span className="font-semibold text-black text-sm">Notifications</span>
                      <span className="text-xs font-medium text-violet-600 cursor-pointer">Mark all read</span>
                    </div>
                    <div className="divide-y divide-black/5 max-h-[300px] overflow-y-auto">
                      <div className="p-4 hover:bg-black/5 transition-colors cursor-pointer flex gap-3">
                        <div className="w-2 h-2 bg-rose-500 rounded-full mt-1.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-black">Budget Warning</p>
                          <p className="text-xs text-black/50 mt-0.5">Shopping is approaching 90% of its limit.</p>
                          <p className="text-[10px] text-black/30 mt-1 uppercase tracking-widest">2 hours ago</p>
                        </div>
                      </div>
                      <div className="p-4 hover:bg-black/5 transition-colors cursor-pointer flex gap-3">
                        <div className="w-2 h-2 bg-violet-500 rounded-full mt-1.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-black">New AI Insight Available</p>
                          <p className="text-xs text-black/50 mt-0.5">We found a new way for you to save ₹2,400.</p>
                          <p className="text-[10px] text-black/30 mt-1 uppercase tracking-widest">5 hours ago</p>
                        </div>
                      </div>
                      <div className="p-4 hover:bg-black/5 transition-colors cursor-pointer flex gap-3">
                        <div className="w-2 h-2 bg-transparent rounded-full mt-1.5 shrink-0 border border-black/20" />
                        <div>
                          <p className="text-sm font-medium text-black">Monthly Report Ready</p>
                          <p className="text-xs text-black/50 mt-0.5">Your financial summary for May is ready to view.</p>
                          <p className="text-[10px] text-black/30 mt-1 uppercase tracking-widest">1 day ago</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>,
                document.body,
              )}
            </div>
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
        <div key={location.pathname} className="p-4 md:p-6 flex-1 page-enter">
          <Outlet context={{ openAddModal: () => setModalOpen(true) }} />
        </div>
      </main>

      {/* Add Transaction Modal */}
      <AddTransactionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />

      {/* Floating AI Chatbot */}
      <AskSpendWiseAI />
    </div>
  );
}
