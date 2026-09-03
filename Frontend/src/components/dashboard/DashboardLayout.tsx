import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
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
import { notificationAPI, type Notification } from '../../lib/api';

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  
  const { user, logout } = useAuth();
  const prevUserIdRef = useRef<number | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setNotifLoading(true);
    setNotifError(null);
    try {
      const res = await notificationAPI.getAll();
      if (res.data.success) {
        const data = res.data.data || [];
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.read).length);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setNotifError('Could not load notifications');
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setNotifLoading(false);
    }
  }, [user]);

  // Chatbot launcher position — survives tab navigation (same component tree),
  // resets naturally on full page reload since useState initial is null.
  const [chatbotPos, setChatbotPos] = useState<{ top: number; left: number } | null>(null);

  // Clear and refetch notifications when user changes (login/logout/demo switch)
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    // Always clear state first when user changes
    if (currentUserId !== prevUserIdRef.current) {
      prevUserIdRef.current = currentUserId;
      setNotifications([]);
      setUnreadCount(0);
      if (currentUserId) {
        fetchNotifications();
      }
    }
  }, [user, fetchNotifications]);

  // Refresh notifications periodically (every 5 minutes)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, fetchNotifications]);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (!user) return null;

  const isDemoUser = user.email === DEMO_EMAIL;
  const isProfileOrSettings = location.pathname.includes('/profile') || location.pathname.includes('/settings');

  const bellRef = useRef<HTMLButtonElement>(null);
  const [notifPos, setNotifPos] = useState<{ top: number; right: number } | null>(null);

  const handleLogout = async () => {
    // Clear all user-specific state immediately
    setNotifications([]);
    setUnreadCount(0);
    prevUserIdRef.current = null;
    await logout(); // clears cookies server-side + clears AuthContext state
    navigate('/');
  };

  const handleOpenNotif = () => {
    if (bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setNotifPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setNotifOpen(v => !v);
  };

  const handleMarkAsRead = async (id: number) => {
    try {
      await notificationAPI.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
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
                {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />}
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
                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-xs font-medium text-violet-600 hover:text-violet-700 cursor-pointer"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="divide-y divide-black/5 max-h-[300px] overflow-y-auto">
                      {notifLoading ? (
                        <div className="p-6 text-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-violet-600 mx-auto" />
                          <p className="text-xs text-black/50 mt-2">Loading...</p>
                        </div>
                      ) : notifError ? (
                        <div className="p-6 text-center">
                          <p className="text-xs text-rose-500">{notifError}</p>
                          <button
                            onClick={fetchNotifications}
                            className="text-xs text-violet-600 hover:underline mt-2"
                          >
                            Retry
                          </button>
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="p-6 text-center">
                          <Bell className="w-8 h-8 text-black/20 mx-auto mb-2" />
                          <p className="text-sm text-black/50">No new notifications</p>
                        </div>
                      ) : (
                        notifications.map(n => (
                          <div
                            key={n.id}
                            className="p-4 hover:bg-black/5 transition-colors cursor-pointer flex gap-3"
                            onClick={() => handleMarkAsRead(n.id)}
                          >
                            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                              n.read ? 'bg-transparent border border-black/20' : 
                              n.type.includes('exceeded') ? 'bg-rose-500' : 
                              n.type.includes('warning') ? 'bg-amber-500' : 'bg-violet-500'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-black">{n.title}</p>
                              <p className="text-xs text-black/50 mt-0.5 line-clamp-2">{n.description}</p>
                              <p className="text-[10px] text-black/30 mt-1 uppercase tracking-widest">
                                {new Date(n.created_at).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
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
      <AskSpendWiseAI position={chatbotPos} onPositionChange={setChatbotPos} />
    </div>
  );
}
