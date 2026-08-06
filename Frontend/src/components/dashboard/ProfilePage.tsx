import { User, Mail, Shield, Activity, CreditCard, Clock, Edit2, Key, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { expenseAPI, budgetAPI, analyticsAPI, getUser } from '../../lib/api';
import { ProfilePhotoUploader } from './ProfilePhotoUploader';
import { useState, useEffect } from 'react';
import type { Transaction, Budget } from '../../lib/api';

function fmt(n: any) { 
  const val = Number(n);
  if (isNaN(val) || !val) return '₹0';
  return '₹' + Math.floor(val).toLocaleString('en-IN'); 
}

export function ProfilePage() {
  const navigate = useNavigate();
  const user = getUser();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalIncome: 0,
    totalExpenses: 0,
    totalBalance: 0,
    activeBudgets: 0,
    transactionCount: 0,
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [txRes, budRes, analyticsRes] = await Promise.all([
          expenseAPI.getAllExpenses(),
          budgetAPI.getAllBudgets(),
          analyticsAPI.getDashboardSummary(),
        ]);
        const transactions: Transaction[] = txRes?.data?.expenses || [];
        const budgets: Budget[] = budRes?.data?.budgets || [];
        const totalExpenses = transactions.reduce((a, b) => {
          if (b.transaction_type === 'income') return a;
          return a + Number(b?.amount || 0);
        }, 0);
        setStats({
          totalIncome: 0,
          totalExpenses,
          totalBalance: Number(analyticsRes?.data?.summary?.total_spending) || 0,
          activeBudgets: budgets.length,
          transactionCount: transactions.length,
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-black/60">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-12 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-black tracking-tight">My Profile</h1>
        <p className="text-sm text-black/50">Manage your personal information and view your activity</p>
      </div>

      {/* Personal Information */}
      <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start gap-6 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-48 h-48 bg-violet-50 rounded-bl-full -z-0 group-hover:scale-110 transition-transform duration-700"></div>
        <div className="relative z-10">
          <ProfilePhotoUploader userName={user.full_name} />
        </div>
        <div className="flex-1 text-center md:text-left relative z-10">
          <h2 className="text-2xl font-bold text-black tracking-tight mb-1">{user.full_name}</h2>
          <p className="text-sm font-medium text-violet-600 mb-4 uppercase tracking-widest">{user.role}</p>
          <div className="flex flex-col md:flex-row gap-3 md:gap-6 text-sm text-black/60 font-medium">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <Mail className="w-4 h-4 text-black/40" /> {user.email}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Financial Overview */}
        <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-black tracking-tight">Financial Overview</h3>
          </div>
          <div className="space-y-5">
            <div className="flex justify-between items-end border-b border-black/5 pb-4">
              <div>
                <span className="text-[10px] font-bold text-black/40 uppercase tracking-widest block mb-1">Total Spending</span>
                <span className="text-xl font-bold text-black tracking-tight">{fmt(stats.totalExpenses)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="bg-[#F5F5F5] rounded-xl p-3 border border-black/5">
                <div className="text-lg font-bold text-black tracking-tight">{stats.activeBudgets}</div>
                <span className="text-[10px] font-bold text-black/50 uppercase tracking-widest">Budgets</span>
              </div>
              <div className="bg-[#F5F5F5] rounded-xl p-3 border border-black/5">
                <div className="text-lg font-bold text-black tracking-tight">{stats.transactionCount}</div>
                <span className="text-[10px] font-bold text-black/50 uppercase tracking-widest">Transactions</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Activity */}
          <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-black tracking-tight">Activity</h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-1">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-black">Last Login</p>
                  <p className="text-xs text-black/50 mt-0.5">Today from Windows PC</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#F5F5F5] text-black/50 flex items-center justify-center shrink-0 mt-1">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-black">Recent Activity</p>
                  <p className="text-xs text-black/50 mt-0.5">View your transaction history in Expenses page.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Account Actions */}
          <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-black tracking-tight">Account</h3>
            </div>
            <div className="space-y-3">
              <button onClick={() => navigate('/dashboard/settings')} className="w-full flex items-center justify-between p-3 rounded-xl border border-black/5 hover:bg-black/5 transition-colors group">
                <div className="flex items-center gap-3">
                  <Edit2 className="w-4 h-4 text-black/40 group-hover:text-black transition-colors" />
                  <span className="text-sm font-semibold text-black">Edit Profile</span>
                </div>
                <span className="text-xs text-black/40 group-hover:text-black/60 transition-colors">→</span>
              </button>
              <button onClick={() => navigate('/dashboard/settings')} className="w-full flex items-center justify-between p-3 rounded-xl border border-black/5 hover:bg-black/5 transition-colors group">
                <div className="flex items-center gap-3">
                  <Key className="w-4 h-4 text-black/40 group-hover:text-black transition-colors" />
                  <span className="text-sm font-semibold text-black">Change Password</span>
                </div>
                <span className="text-xs text-black/40 group-hover:text-black/60 transition-colors">→</span>
              </button>
              <button onClick={() => navigate('/')} className="w-full flex items-center justify-between p-3 rounded-xl border border-rose-100 bg-rose-50 hover:bg-rose-100 transition-colors group mt-2">
                <div className="flex items-center gap-3">
                  <LogOut className="w-4 h-4 text-rose-500" />
                  <span className="text-sm font-semibold text-rose-600">Logout</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
