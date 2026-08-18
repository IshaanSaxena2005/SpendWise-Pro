// SettingsPage component with simplified Delete Account flow
import { useState, useEffect } from 'react';
import { Bell, Database, AlertTriangle, Shield, Save, LogOut, Download, User as UserIcon, AlertCircle } from 'lucide-react';
import { expenseAPI, budgetAPI, categoryAPI, type Transaction, type Budget, type Category } from '../../lib/api';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { ProfilePhotoUploader } from './ProfilePhotoUploader';
import { formatDate } from '../../lib/dateUtils';
import { DEMO_EMAIL } from '../../lib/constants';

// Types for JSZip dynamic loading
interface JSZipInstance {
  file(name: string, content: string): JSZipInstance;
  generateAsync(options: { type: 'blob' }): Promise<Blob>;
}
interface JSZipConstructor { new (): JSZipInstance; }
type NotificationPreferences = {
  budgetAlerts: boolean;
  overspendingWarnings: boolean;
  aiForecasts: boolean;
  emailReports: boolean;
};

const defaultNotifications: NotificationPreferences = {
  budgetAlerts: true,
  overspendingWarnings: true,
  aiForecasts: true,
  emailReports: false,
};
declare global { interface Window { JSZip?: JSZipConstructor; } }
async function loadJSZip(): Promise<JSZipConstructor> {
  if (window.JSZip) return window.JSZip;
  return new Promise<JSZipConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => { if (window.JSZip) resolve(window.JSZip); else reject(new Error('JSZip failed to load')); };
    script.onerror = () => reject(new Error('JSZip script failed to load'));
    document.head.appendChild(script);
  });
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const { user: currentUser, updateUser, logout } = useAuth();
  const [email] = useState(() => currentUser?.email ?? '');
  const [name, setName] = useState(() => {
    const saved = localStorage.getItem('sw_display_name');
    return saved || currentUser?.full_name || '';
  });
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
  });
  const [saveToast, setSaveToast] = useState<'idle' | 'success' | 'error'>('idle');
  const [readOnlyMessage, setReadOnlyMessage] = useState(false);

  const isDemoUser = currentUser?.email === DEMO_EMAIL;

  // Notifications
  const [notifs, setNotifs] = useState<NotificationPreferences>(defaultNotifications);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsSaving, setNotificationsSaving] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  const [hasLocalPassword, setHasLocalPassword] = useState<boolean | null>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delete Account state
  const [deleteStep, setDeleteStep] = useState<0 | 1>(0);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Export data state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Load data
  useEffect(() => {
    const load = async () => {
      try {
        const [txRes, budRes, catRes] = await Promise.all([
          expenseAPI.getAllExpenses(),
          budgetAPI.getAllBudgets(),
          categoryAPI.getAllCategories(),
        ]);
        setTransactions(txRes.data.expenses || []);
        setBudgets(budRes.data.budgets || []);
        setCategories(catRes.data.categories || []);
      } catch (e) { console.error(e); }
    };
    load();
  }, []);

  useEffect(() => {
    const loadAccountSettings = async () => {
      try {
        const [preferencesResponse, securityResponse] = await Promise.all([
          api.get<{ success: boolean; preferences: NotificationPreferences }>('/notifications/preferences'),
          api.get<{ success: boolean; hasLocalPassword: boolean }>('/auth/account-security'),
        ]);
        setNotifs(preferencesResponse.data.preferences);
        setHasLocalPassword(securityResponse.data.hasLocalPassword);
      } catch (err) {
        console.error('Failed to load account settings:', err);
        setNotificationsError('Could not load notification preferences. Please refresh and try again.');
      } finally {
        setNotificationsLoading(false);
      }
    };
    loadAccountSettings();
  }, []);

  const handleSave = async () => {
    if (isDemoUser) {
      setReadOnlyMessage(true);
      setTimeout(() => setReadOnlyMessage(false), 3000);
      return;
    }
    try {
      if (!name.trim()) throw new Error('Name cannot be empty');
      const res = await api.put('/auth/profile', { full_name: name.trim() });
      // Server re-issues the access token cookie and returns updated user data
      if (res.data?.user) updateUser(res.data.user);
      localStorage.setItem('sw_display_name', name.trim());
      setSaveToast('success');
    } catch { setSaveToast('error'); }
    finally { setTimeout(() => setSaveToast('idle'), 3000); }
  };

  const handleNotificationChange = async (key: keyof NotificationPreferences, value: boolean) => {
    if (notificationsSaving || notifs[key] === value || isDemoUser) return;
    const previous = notifs;
    const updated = { ...previous, [key]: value };
    setNotifs(updated);
    setNotificationsSaving(true);
    setNotificationsError(null);
    try {
      const response = await api.put<{ success: boolean; preferences: NotificationPreferences }>('/notifications/preferences', updated);
      setNotifs(response.data.preferences);
    } catch (err: any) {
      setNotifs(previous);
      setNotificationsError(err?.response?.data?.message || 'Could not save notification preferences. Please try again.');
    } finally {
      setNotificationsSaving(false);
    }
  };

  const handlePasswordUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);
    if (newPassword.length < 6) return setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
    if (newPassword !== confirmNewPassword) return setPasswordMessage({ type: 'error', text: 'New password and confirmation do not match.' });
    setPasswordSaving(true);
    try {
      const response = await api.put<{ success: boolean; message: string; hasLocalPassword: boolean }>('/auth/password', {
        currentPassword: hasLocalPassword ? currentPassword : undefined,
        newPassword,
      });
      setHasLocalPassword(response.data.hasLocalPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword('');
      setPasswordMessage({ type: 'success', text: response.data.message });
      setShowPasswordForm(false);
    } catch (err: any) {
      setPasswordMessage({ type: 'error', text: err?.response?.data?.message || 'Could not update your password. Please try again.' });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (isDemoUser) {
      setDeleteLoading(false);
      setDeleteError('Demo account cannot be deleted. Create your own account to manage personal finances.');
      return;
    }
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api.delete('/auth/delete-account');
      // Server clears auth cookies; clear any remaining local preferences
      localStorage.removeItem('sw_display_name');
      localStorage.removeItem('sw_notif_read');
      await logout(); // clear AuthContext state
      window.location.href = '/?deleted=true';
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to delete account. Please try again.';
      setDeleteError(msg);
    } finally { setDeleteLoading(false); }
  };

  const exportCSV = () => {
    const rows = [
      ['Date', 'Description', 'Category', 'Amount', 'Notes'],
      ...transactions.map(t => {
        const cat = categories.find(c => c.id === t.category_id);
        return [formatDate(t.expense_date), t.note || '', cat?.name || '', t.amount, t.note];
      })
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
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
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
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

      {readOnlyMessage && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm font-medium mb-6">
          Demo mode is read-only. Create your own account to manage personal finances.
        </div>
      )}
      <div className="flex flex-col md:flex-row gap-8">
        <aside className="w-full md:w-64 shrink-0">
          <nav className="flex flex-col gap-1">
            {tabs.map(tab => (
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
        <div className="flex-1 space-y-6">
          {/* General */}
          {activeTab === 'general' && (
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 md:p-8">
              <h2 className="text-lg font-bold text-black mb-6">General Settings</h2>
              <div className="space-y-5 max-w-md">
                <div className="pb-5 border-b border-black/5">
                  <label className="block text-xs font-bold text-black/40 uppercase tracking-widest mb-3">Profile Photo</label>
                  {!isDemoUser ? (
                    <ProfilePhotoUploader userName={name || currentUser.full_name} variant="settings" />
                  ) : (
                    <div className="text-sm text-black/50 italic">Profile photo cannot be changed in demo mode</div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-black/40 uppercase tracking-widest mb-2">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    disabled={isDemoUser}
                    className="w-full bg-[#F5F5F5] border border-transparent rounded-xl px-4 py-2.5 text-sm focus:border-black/20 focus:bg-white focus:outline-none focus:ring-4 focus:ring-black/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-black/40 uppercase tracking-widest mb-2">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full bg-[#F5F5F5] border border-transparent rounded-xl px-4 py-2.5 text-sm opacity-70 cursor-not-allowed"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-black/40 uppercase tracking-widest mb-2">Currency</label>
                    <select className="w-full bg-[#F5F5F5] border border-transparent rounded-xl px-4 py-2.5 text-sm focus:border-black/20 focus:bg-white focus:outline-none focus:ring-4 focus:ring-black/5 transition-all cursor-pointer">
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-black/40 uppercase tracking-widest mb-2">Timezone</label>
                    <select
                      value={timezone}
                      onChange={e => setTimezone(e.target.value)}
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
                    disabled={isDemoUser}
                    className="flex items-center gap-2 bg-black text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" /> Save Changes
                  </button>
                  {saveToast === 'success' && <span className="text-sm font-semibold text-emerald-600 animate-pulse">✓ Saved successfully</span>}
                  {saveToast === 'error' && <span className="text-sm font-semibold text-rose-500">✗ Name cannot be empty</span>}
                </div>
              </div>
            </div>
          )}
          {/* Notifications */}
          {activeTab === 'notifications' && (
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 md:p-8">
              <h2 className="text-lg font-bold text-black mb-6">Notifications</h2>
              <div className="space-y-6">
                {notificationsError && <p className="text-xs font-medium text-rose-600">{notificationsError}</p>}
                {[{ key: 'budgetAlerts', title: 'Budget Alerts', desc: 'Get notified when you approach your budget limits' },
                  { key: 'overspendingWarnings', title: 'Overspending Warnings', desc: 'Receive alerts for unusual spending patterns' },
                  { key: 'aiForecasts', title: 'AI Forecast Summaries', desc: 'Weekly predictions and financial health updates' },
                  { key: 'emailReports', title: 'Email Reports', desc: 'Receive monthly financial summary reports via email' }].map(item => (
                  <div key={item.key} className="flex items-center justify-between py-2">
                    <div>
                      <h3 className="text-sm font-semibold text-black">{item.title}</h3>
                      <p className="text-xs text-black/50 mt-1">{item.desc}</p>
                    </div>
                    <div className="flex rounded-full bg-[#F5F5F5] border border-black/10 p-1 shrink-0" aria-label={`${item.title} preference`}>
                      {([['Yes', true], ['No', false]] as const).map(([label, value]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => handleNotificationChange(item.key as keyof NotificationPreferences, value)}
                          disabled={notificationsLoading || notificationsSaving || isDemoUser}
                          aria-pressed={notifs[item.key as keyof NotificationPreferences] === value}
                          className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${notifs[item.key as keyof NotificationPreferences] === value ? 'bg-black text-white shadow-sm' : 'text-black/55 hover:text-black'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Security */}
          {activeTab === 'security' && (
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 md:p-8">
              <h2 className="text-lg font-bold text-black mb-6">Security</h2>
              <div className="space-y-6 max-w-md">
                <div>
                  <h3 className="text-sm font-semibold text-black mb-2">{hasLocalPassword ? 'Change Password' : 'Set Password'}</h3>
                  <p className="text-xs text-black/50 mb-4">{hasLocalPassword ? 'Use your current password to choose a new one.' : 'Set a password to also sign in with your email address.'}</p>
                  {!showPasswordForm && (
                    <button onClick={() => setShowPasswordForm(true)} disabled={hasLocalPassword === null || isDemoUser} className="bg-black text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      {hasLocalPassword ? 'Update Password' : 'Set Password'}
                    </button>
                  )}
                  {showPasswordForm && (
                    <form onSubmit={handlePasswordUpdate} className="space-y-3">
                      {hasLocalPassword && <input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} placeholder="Current Password" required disabled={passwordSaving} autoComplete="current-password" className="w-full bg-[#F5F5F5] border border-transparent rounded-xl px-4 py-2.5 text-sm focus:border-black/20 focus:bg-white focus:outline-none focus:ring-4 focus:ring-black/5" />}
                      <input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="New Password" required minLength={6} disabled={passwordSaving} autoComplete="new-password" className="w-full bg-[#F5F5F5] border border-transparent rounded-xl px-4 py-2.5 text-sm focus:border-black/20 focus:bg-white focus:outline-none focus:ring-4 focus:ring-black/5" />
                      <input type="password" value={confirmNewPassword} onChange={event => setConfirmNewPassword(event.target.value)} placeholder="Confirm New Password" required minLength={6} disabled={passwordSaving} autoComplete="new-password" className="w-full bg-[#F5F5F5] border border-transparent rounded-xl px-4 py-2.5 text-sm focus:border-black/20 focus:bg-white focus:outline-none focus:ring-4 focus:ring-black/5" />
                      <div className="flex gap-3">
                        <button type="submit" disabled={passwordSaving} className="bg-black text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-gray-800 transition-colors disabled:opacity-50">{passwordSaving ? 'Saving...' : hasLocalPassword ? 'Update Password' : 'Set Password'}</button>
                        <button type="button" onClick={() => setShowPasswordForm(false)} disabled={passwordSaving} className="text-sm font-semibold px-4 py-2.5 text-black/60 hover:text-black">Cancel</button>
                      </div>
                    </form>
                  )}
                  {passwordMessage && <p className={`mt-3 text-xs font-medium ${passwordMessage.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>{passwordMessage.text}</p>}
                </div>
                <hr className="border-black/5" />
                <div>
                  <h3 className="text-sm font-semibold text-black mb-2">Active Sessions</h3>
                  <p className="text-xs text-black/50 mb-4">Manage your active sessions across devices.</p>
                  <button className="flex items-center gap-2 bg-white border border-black/10 text-black text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-black/5 transition-colors">
                    <LogOut className="w-4 h-4" /> Log out of all devices
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Data Management */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 md:p-8">
                <h2 className="text-lg font-bold text-black mb-2">Data Management</h2>
                <p className="text-sm text-black/50 mb-6">Export your data or generate comprehensive reports.</p>
                <div className="flex gap-3">
                  <button onClick={exportCSV} className="flex items-center gap-2 bg-black text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-gray-800 transition-colors shadow-sm">
                    <Download className="w-4 h-4" /> Export CSV
                  </button>
                  <button onClick={exportZIP} className="flex items-center gap-2 bg-white border border-black/10 text-black text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-black/5 transition-colors">
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
                    <p className="text-sm text-rose-700/80 mb-5">Permanently delete your account and all associated data. This action cannot be undone.</p>
                    <button 
                      onClick={() => setDeleteStep(1)} 
                      disabled={isDemoUser}
                      className="bg-rose-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-rose-700 transition-colors shadow-sm shadow-rose-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
      {/* Delete Confirmation Modal */}
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
            {deleteError && (
              <div className="mb-4 flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-xl p-3.5 text-xs text-rose-600 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDeleteStep(0)} className="flex-1 bg-[#F5F5F5] hover:bg-[#E5E5E5] text-black text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
              <button onClick={handleDeleteAccount} disabled={deleteLoading} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm shadow-rose-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2">
                {deleteLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
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
