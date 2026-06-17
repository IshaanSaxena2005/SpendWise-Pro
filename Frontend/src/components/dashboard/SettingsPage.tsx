import { useState, useEffect } from 'react';
import { Bell, Shield, Database, AlertTriangle, Save, LogOut, Download, Eye, EyeOff, User as UserIcon, X, AlertCircle } from 'lucide-react';
import { getUser, expenseAPI, budgetAPI, categoryAPI, type Transaction, type Budget, type Category } from '../../lib/api';
import api from '../../lib/api';
import { ProfilePhotoUploader } from './ProfilePhotoUploader';

interface JSZipInstance {
  file(name: string, content: string): JSZipInstance;
  generateAsync(options: { type: 'blob' }): Promise<Blob>;
}

interface JSZipConstructor {
  new (): JSZipInstance;
}

declare global {
  interface Window {
    JSZip?: JSZipConstructor;
  }
}

async function loadJSZip(): Promise<JSZipConstructor> {
  if (window.JSZip) {
    return window.JSZip;
  }

  return new Promise<JSZipConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => {
      if (window.JSZip) {
        resolve(window.JSZip);
      } else {
        reject(new Error('JSZip failed to load'));
      }
    };
    script.onerror = () => reject(new Error('JSZip script failed to load'));
    document.head.appendChild(script);
  });
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const currentUser = getUser();
  const [email, setEmail] = useState(() => currentUser.email);
  const [name, setName] = useState(() => {
    const savedName = localStorage.getItem('sw_display_name');
    return savedName || currentUser.full_name;
  });
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  });
  const [saveToast, setSaveToast] = useState<'idle' | 'success' | 'error'>('idle');

  // Security State
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // Notifications State
  const [notifs, setNotifs] = useState(() => {
    const savedNotifs = localStorage.getItem('notifications');
    if (savedNotifs) {
      try {
        return JSON.parse(savedNotifs);
      } catch {
        // ignore
      }
    }
    return {
      budgetAlerts: true,
      overspendingWarnings: true,
      aiForecasts: true,
      emailReports: false
    };
  });

  // Delete Account State
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Data for export
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [txRes, budRes, catRes] = await Promise.all([
          expenseAPI.getAllExpenses(),
          budgetAPI.getAllBudgets(),
          categoryAPI.getAllCategories(),
        ]);
        setTransactions(txRes.data.expenses || []);
        setBudgets(budRes.data.budgets || []);
        setCategories(catRes.data.categories || []);
      } catch (err) {
        console.error(err);
      }
    };
    loadData();
  }, []);

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError('Please enter your password.');
      return;
    }
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api.delete('/auth/delete-account', { data: { password: deletePassword } });
      localStorage.clear();
      window.location.href = '/?deleted=true';
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setDeleteError(error.response?.data?.message || 'Failed to delete account. Please try again.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleNotifToggle = (key: keyof typeof notifs) => {
    const updated = { ...notifs, [key]: !notifs[key] };
    setNotifs(updated);
    localStorage.setItem('notifications', JSON.stringify(updated));
  };

  const handleSave = async () => {
    try {
      if (!name.trim()) throw new Error('Name cannot be empty');
      const res = await api.put('/auth/profile', { full_name: name.trim() });
      if (res.data?.token) {
        localStorage.setItem('token', res.data.token);
      }
      localStorage.setItem('sw_display_name', name.trim());
      setSaveToast('success');
    } catch {
      setSaveToast('error');
    } finally {
      setTimeout(() => setSaveToast('idle'), 3000);
    }
  };

  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { label: '', color: 'bg-transparent' };
    if (pwd.length < 6) return { label: 'Weak', color: 'bg-rose-500 text-white' };
    if (pwd.length >= 8 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) return { label: 'Strong', color: 'bg-emerald-500 text-white' };
    return { label: 'Medium', color: 'bg-amber-500 text-white' };
  };

  const pwdStrength = getPasswordStrength(newPwd);

  const exportCSV = () => {
    const rows = [
      ['Date', 'Description', 'Category', 'Amount', 'Notes'],
      ...transactions.map((t) => {
        const cat = categories.find((c) => c.id === t.category_id);
        return [t.expense_date, t.note || '', cat?.name || '', t.amount, t.note];
      })
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'transactions.csv';
    a.click();
  };

  const exportZIP = async () => {
    const JSZip = await loadJSZip();

    const zip = new JSZip();
    zip.file('transactions.json', JSON.stringify(transactions, null, 2));
    zip.file('budgets.json', JSON.stringify(budgets, null, 2));
    zip.file('categories.json', JSON.stringify(categories, null, 2));
    zip.file('profile.json', JSON.stringify({ name, email, timezone }, null, 2));

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spendwise_archive.zip';
    a.click();
  };

  const tabs = [
    { id: 'general', label: 'General', icon: UserIcon },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'data', label: 'Data Management', icon: Database },
  ];

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-black tracking-tight">Settings</h1>
        <p className="text-sm text-black/50">Manage your preferences and account settings</p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <aside className="w-full md:w-64 shrink-0">
          <nav className="flex flex-col gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${activeTab === tab.id ? 'bg-black text-white shadow-sm' : 'text-black/60 hover:text-black hover:bg-black/5'}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 space-y-6">
          {activeTab === 'general' && (
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 md:p-8">
              <h2 className="text-lg font-bold text-black mb-6">General Settings</h2>
              <div className="space-y-5 max-w-md">
                <div className="pb-5 border-b border-black/5">
                  <label className="block text-xs font-bold text-black/40 uppercase tracking-widest mb-3">Profile Photo</label>
                  <ProfilePhotoUploader userName={name || currentUser.full_name} variant="settings" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-black/40 uppercase tracking-widest mb-2">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#F5F5F5] border border-transparent rounded-xl px-4 py-2.5 text-sm focus:border-black/20 focus:bg-white focus:outline-none focus:ring-4 focus:ring-black/5 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-black/40 uppercase tracking-widest mb-2">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled
                    className="w-full bg-[#F5F5F5] border border-transparent rounded-xl px-4 py-2.5 text-sm opacity-70 cursor-not-allowed"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-black/40 uppercase tracking-widest mb-2">Currency</label>
                    <select
                      className="w-full bg-[#F5F5F5] border border-transparent rounded-xl px-4 py-2.5 text-sm focus:border-black/20 focus:bg-white focus:outline-none focus:ring-4 focus:ring-black/5 transition-all cursor-pointer"
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-black/40 uppercase tracking-widest mb-2">Timezone</label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full bg-[#F5F5F5] border border-transparent rounded-xl px-4 py-2.5 text-sm focus:border-black/20 focus:bg-white focus:outline-none focus:ring-4 focus:ring-black/5 transition-all cursor-pointer"
                    >
                      <option value={timezone}>{timezone} (Auto-detected)</option>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">America/New_York</option>
                      <option value="Europe/London">Europe/London</option>
                      <option value="Asia/Tokyo">Asia/Tokyo</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-6">
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 bg-black text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-gray-800 transition-colors"
                  >
                    <Save className="w-4 h-4" /> Save Changes
                  </button>
                  {saveToast === 'success' && (
                    <span className="text-sm font-semibold text-emerald-600 animate-pulse">✓ Saved successfully</span>
                  )}
                  {saveToast === 'error' && (
                    <span className="text-sm font-semibold text-rose-500">✗ Name cannot be empty</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 md:p-8">
              <h2 className="text-lg font-bold text-black mb-6">Notifications</h2>
              <div className="space-y-6">
                {[
                  { key: 'budgetAlerts', title: 'Budget Alerts', desc: 'Get notified when you approach your budget limits' },
                  { key: 'overspendingWarnings', title: 'Overspending Warnings', desc: 'Receive alerts for unusual spending patterns' },
                  { key: 'aiForecasts', title: 'AI Forecast Summaries', desc: 'Weekly predictions and financial health updates' },
                  { key: 'emailReports', title: 'Email Reports', desc: 'Receive monthly financial summary reports via email' },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-4 py-2 cursor-pointer"
                    onClick={() => handleNotifToggle(item.key as keyof typeof notifs)}
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-black">{item.title}</h3>
                      <p className="text-xs text-black/50 mt-1">{item.desc}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={notifs[item.key as keyof typeof notifs]}
                        readOnly
                      />
                      <div className="w-11 h-6 bg-[#F5F5F5] border border-black/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-black/10 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 md:p-8">
              <h2 className="text-lg font-bold text-black mb-6">Security</h2>
              <div className="space-y-6 max-w-md">
                <div>
                  <h3 className="text-sm font-semibold text-black mb-4">Change Password</h3>
                  <div className="space-y-4">
                    <div className="relative">
                      <input
                        type={showCurrent ? 'text' : 'password'}
                        value={currentPwd}
                        onChange={(e) => setCurrentPwd(e.target.value)}
                        placeholder="Current Password"
                        className="w-full bg-[#F5F5F5] border border-transparent rounded-xl pl-4 pr-10 py-2.5 text-sm focus:border-black/20 focus:bg-white focus:outline-none focus:ring-4 focus:ring-black/5 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrent(!showCurrent)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40 hover:text-black"
                      >
                        {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showNew ? 'text' : 'password'}
                        value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                        placeholder="New Password"
                        className="w-full bg-[#F5F5F5] border border-transparent rounded-xl pl-4 pr-10 py-2.5 text-sm focus:border-black/20 focus:bg-white focus:outline-none focus:ring-4 focus:ring-black/5 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew(!showNew)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40 hover:text-black"
                      >
                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {newPwd && (
                      <div className="flex items-center gap-2 mt-1 px-1">
                        <div className="flex-1 h-1 bg-[#F5F5F5] rounded-full overflow-hidden">
                          <div className={`h-full ${pwdStrength.color} transition-all`} style={{ width: pwdStrength.label === 'Strong' ? '100%' : pwdStrength.label === 'Medium' ? '66%' : '33%' }}></div>
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${pwdStrength.label === 'Weak' ? 'text-rose-500' : pwdStrength.label === 'Medium' ? 'text-amber-500' : 'text-emerald-500'}`}>{pwdStrength.label}</span>
                      </div>
                    )}
                    <div className="relative">
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPwd}
                        onChange={(e) => setConfirmPwd(e.target.value)}
                        placeholder="Confirm New Password"
                        className="w-full bg-[#F5F5F5] border border-transparent rounded-xl pl-4 pr-10 py-2.5 text-sm focus:border-black/20 focus:bg-white focus:outline-none focus:ring-4 focus:ring-black/5 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40 hover:text-black"
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button
                      className="bg-black text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-gray-800 transition-colors"
                    >
                      Update Password
                    </button>
                  </div>
                </div>

                <hr className="border-black/5" />

                <div>
                  <h3 className="text-sm font-semibold text-black mb-2">Active Sessions</h3>
                  <p className="text-xs text-black/50 mb-4">Manage your active sessions across devices.</p>
                  <button
                    className="flex items-center gap-2 bg-white border border-black/10 text-black text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-black/5 transition-colors"
                  >
                    <LogOut className="w-4 h-4" /> Log out of all devices
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 md:p-8">
                <h2 className="text-lg font-bold text-black mb-2">Data Management</h2>
                <p className="text-sm text-black/50 mb-6">Export your data or generate comprehensive reports.</p>
                <div className="flex gap-3">
                  <button
                    onClick={exportCSV}
                    className="flex items-center gap-2 bg-black text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-gray-800 transition-colors shadow-sm"
                  >
                    <Download className="w-4 h-4" /> Export CSV
                  </button>
                  <button
                    onClick={exportZIP}
                    className="flex items-center gap-2 bg-white border border-black/10 text-black text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-black/5 transition-colors"
                  >
                    <Database className="w-4 h-4" /> Download Full Archive
                  </button>
                </div>
              </div>

              <div className="bg-rose-50 rounded-2xl border border-rose-100 shadow-sm p-6 md:p-8">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-rose-900 mb-1">Danger Zone</h2>
                    <p className="text-sm text-rose-700/80 mb-5">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                    <button
                      onClick={() => setDeleteStep(1)}
                      className="bg-rose-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-rose-700 transition-colors shadow-sm shadow-rose-600/20"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Account Modal Step 1 */}
      {deleteStep === 1 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteStep(0)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-center text-black mb-2">Delete Account?</h2>
            <p className="text-center text-black/60 mb-6 text-sm">
              Are you sure you want to permanently delete your account? This action cannot be undone and all your data will be lost.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteStep(0)}
                className="flex-1 bg-[#F5F5F5] hover:bg-[#E5E5E5] text-black text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setDeleteStep(2)}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm shadow-rose-600/20"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal Step 2 */}
      {deleteStep === 2 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!deleteLoading ? () => { setDeleteStep(0); setDeletePassword(''); setDeleteError(null); } : undefined} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <button
              onClick={() => { setDeleteStep(0); setDeletePassword(''); setDeleteError(null); }}
              disabled={deleteLoading}
              className="absolute top-6 right-6 text-black/40 hover:text-black transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-black mb-2">Confirm Identity</h2>
            <p className="text-black/60 mb-6 text-sm">
              Please enter your password to confirm account deletion.
            </p>

            {deleteError && (
              <div className="mb-4 flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-xl p-3.5 text-xs text-rose-600 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="relative mb-6">
              <input
                type={showDeletePassword ? 'text' : 'password'}
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Current Password"
                className="w-full bg-[#F5F5F5] border border-transparent rounded-xl pl-4 pr-10 py-3 text-sm focus:border-black/20 focus:bg-white focus:outline-none focus:ring-4 focus:ring-black/5 transition-all"
                disabled={deleteLoading}
              />
              <button
                type="button"
                onClick={() => setShowDeletePassword(!showDeletePassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40 hover:text-black"
              >
                {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteStep(0); setDeletePassword(''); setDeleteError(null); }}
                disabled={deleteLoading}
                className="flex-1 bg-[#F5F5F5] hover:bg-[#E5E5E5] text-black text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading || !deletePassword}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm shadow-rose-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
              >
                {deleteLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deleting...
                  </>
                ) : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
