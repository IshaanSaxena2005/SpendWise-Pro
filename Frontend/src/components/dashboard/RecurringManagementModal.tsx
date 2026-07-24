import { useState, useEffect } from 'react';
import { X, Repeat2, Pause, Play, Trash2, Calendar, Clock, Edit2 } from 'lucide-react';

interface RecurringTransaction {
  id: number;
  type: 'income' | 'expense';
  amount: number;
  category_name: string | null;
  note: string | null;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  start_date: string;
  end_date: string | null;
  next_execution_date: string;
  never_ends: boolean;
  is_active: boolean;
}

interface ExecutionHistory {
  id: number;
  amount: number;
  expense_date: string;
  note: string | null;
  category_name: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function RecurringManagementModal({ isOpen, onClose }: Props) {
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [editingItem, setEditingItem] = useState<RecurringTransaction | null>(null);
  const [historyItem, setHistoryItem] = useState<RecurringTransaction | null>(null);
  const [history, setHistory] = useState<ExecutionHistory[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    amount: '',
    frequency: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'yearly',
    start_date: '',
    end_date: '',
    never_ends: true,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    fetchRecurringTransactions().then((data) => {
      if (cancelled) return;
      setRecurring(data);
    });

    fetchRecurringSummary().then((data) => {
      if (cancelled) return;
      setSummary(data);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const fetchRecurringTransactions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/recurring', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response.json();
      return result.recurring_transactions || [];
    } catch (err) {
      console.error('Error fetching recurring transactions:', err);
      return [];
    }
  };

  const fetchRecurringSummary = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/recurring/summary', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response.json();
      return result.summary || null;
    } catch (err) {
      console.error('Error fetching recurring summary:', err);
      return null;
    }
  };

  const handlePause = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/recurring/${id}/pause`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setRecurring((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: false } : r)));
    } catch (err) {
      console.error('Error pausing recurring transaction:', err);
      alert('Failed to pause recurring transaction');
    }
  };

  const handleResume = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/recurring/${id}/resume`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setRecurring((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: true } : r)));
    } catch (err) {
      console.error('Error resuming recurring transaction:', err);
      alert('Failed to resume recurring transaction');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this recurring transaction?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/recurring/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setRecurring((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Error deleting recurring transaction:', err);
      alert('Failed to delete recurring transaction');
    }
  };

  const handleEdit = (item: RecurringTransaction) => {
    setEditingItem(item);
    setEditForm({
      amount: String(item.amount),
      frequency: item.frequency,
      start_date: item.start_date,
      end_date: item.end_date || '',
      never_ends: item.never_ends,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    
    try {
      setSavingEdit(true);
      const token = localStorage.getItem('token');
      
      await fetch(`/api/recurring/${editingItem.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Number(editForm.amount),
          frequency: editForm.frequency,
          start_date: editForm.start_date,
          end_date: editForm.end_date || null,
          never_ends: editForm.never_ends,
        }),
      });
      
      // Refresh the list
      const data = await fetchRecurringTransactions();
      setRecurring(data);
      setEditingItem(null);
    } catch (err) {
      console.error('Error updating recurring transaction:', err);
      alert('Failed to update recurring transaction');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setEditForm({
      amount: '',
      frequency: 'monthly',
      start_date: '',
      end_date: '',
      never_ends: true,
    });
  };

  const handleViewHistory = async (item: RecurringTransaction) => {
    try {
      setHistoryItem(item);
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/recurring/${item.id}/history`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response.json();
      setHistory(result.history || []);
    } catch (err) {
      console.error('Error fetching execution history:', err);
      alert('Failed to fetch execution history');
    }
  };

  const handleCloseHistory = () => {
    setHistoryItem(null);
    setHistory([]);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getFrequencyLabel = (freq: string) => {
    const labels: Record<string, string> = {
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      yearly: 'Yearly',
    };
    return labels[freq] || freq;
  };

  const activeRecurring = recurring.filter((r) => r.is_active);
  const pausedRecurring = recurring.filter((r) => !r.is_active);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[calc(100vh-32px)] overflow-hidden shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-black/10 shrink-0">
          <div className="flex items-center gap-2">
            <Repeat2 className="w-5 h-5 text-black" />
            <h3 className="text-lg font-semibold text-black">Manage Recurring Transactions</h3>
          </div>
          <button onClick={onClose} className="text-black/40 hover:text-black transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-behavior-contain p-5">
          {recurring.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Repeat2 className="w-12 h-12 text-black/20 mb-3" />
              <p className="text-sm text-black/60">No recurring transactions yet</p>
              <p className="text-xs text-black/40 mt-1">Create a recurring transaction from the add transaction modal</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Metrics */}
              {summary && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#F5F5F5] rounded-xl p-4">
                    <div className="text-xs text-black/60 mb-1">Monthly Expenses</div>
                    <div className="text-lg font-bold text-black">₹{summary.monthlyExpenses?.toLocaleString('en-IN') || 0}</div>
                  </div>
                  <div className="bg-[#F5F5F5] rounded-xl p-4">
                    <div className="text-xs text-black/60 mb-1">Monthly Income</div>
                    <div className="text-lg font-bold text-emerald-600">₹{summary.monthlyIncome?.toLocaleString('en-IN') || 0}</div>
                  </div>
                  <div className="bg-[#F5F5F5] rounded-xl p-4">
                    <div className="text-xs text-black/60 mb-1">Net Cash Flow</div>
                    <div className={`text-lg font-bold ${(summary.netCashFlow || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {(summary.netCashFlow || 0) >= 0 ? '+' : ''}₹{(summary.netCashFlow || 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="bg-[#F5F5F5] rounded-xl p-4">
                    <div className="text-xs text-black/60 mb-1">Active Recurring</div>
                    <div className="text-lg font-bold text-black">{summary.activeCount || 0}</div>
                  </div>
                </div>
              )}

              {/* Active Recurring */}
              {activeRecurring.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-black/40 uppercase tracking-wider mb-3">Active ({activeRecurring.length})</h4>
                  <div className="space-y-3">
                    {activeRecurring.map((item) => (
                      <RecurringCard
                        key={item.id}
                        item={item}
                        onPause={() => handlePause(item.id)}
                        onResume={() => handleResume(item.id)}
                        onDelete={() => handleDelete(item.id)}
                        onEdit={() => handleEdit(item)}
                        onViewHistory={() => handleViewHistory(item)}
                        formatDate={formatDate}
                        getFrequencyLabel={getFrequencyLabel}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Paused Recurring */}
              {pausedRecurring.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-black/40 uppercase tracking-wider mb-3">Paused ({pausedRecurring.length})</h4>
                  <div className="space-y-3">
                    {pausedRecurring.map((item) => (
                      <RecurringCard
                        key={item.id}
                        item={item}
                        onPause={() => handlePause(item.id)}
                        onResume={() => handleResume(item.id)}
                        onDelete={() => handleDelete(item.id)}
                        onEdit={() => handleEdit(item)}
                        onViewHistory={() => handleViewHistory(item)}
                        formatDate={formatDate}
                        getFrequencyLabel={getFrequencyLabel}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Edit Form Modal */}
        {editingItem && (
          <div className="absolute inset-0 bg-white z-10 flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-black/10">
              <h3 className="text-lg font-semibold text-black">Edit Recurring Transaction</h3>
              <button onClick={handleCancelEdit} className="text-black/40 hover:text-black transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-black/60 mb-1.5">Amount</label>
                <input
                  type="number"
                  value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                  className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-black/60 mb-1.5">Frequency</label>
                <select
                  value={editForm.frequency}
                  onChange={(e) => setEditForm({ ...editForm, frequency: e.target.value as 'daily' | 'weekly' | 'monthly' | 'yearly' })}
                  className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-black/60 mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={editForm.start_date}
                  onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                  className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={editForm.never_ends}
                    onChange={(e) => setEditForm({ ...editForm, never_ends: e.target.checked })}
                    className="w-4 h-4 rounded border-black/20 text-black focus:ring-black/20"
                  />
                  <span className="text-sm text-black">Never Ends</span>
                </label>
                {!editForm.never_ends && (
                  <div>
                    <label className="block text-xs font-medium text-black/60 mb-1.5">End Date</label>
                    <input
                      type="date"
                      value={editForm.end_date}
                      onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                      className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-black/10">
              <button
                onClick={handleCancelEdit}
                className="flex-1 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-black/60 hover:bg-black/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="flex-1 py-2.5 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* History View Modal */}
        {historyItem && (
          <div className="absolute inset-0 bg-white z-10 flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-black/10">
              <h3 className="text-lg font-semibold text-black">Execution History</h3>
              <button onClick={handleCloseHistory} className="text-black/40 hover:text-black transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="w-12 h-12 text-black/20 mb-3" />
                  <p className="text-sm text-black/60">No execution history yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((item) => (
                    <div key={item.id} className="p-4 rounded-xl border border-black/10 bg-[#F5F5F5]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-black">{formatDate(item.expense_date)}</div>
                        <div className="text-sm font-bold text-black">₹{item.amount.toLocaleString('en-IN')}</div>
                      </div>
                      {item.category_name && (
                        <div className="text-xs text-black/60">{item.category_name}</div>
                      )}
                      {item.note && (
                        <div className="text-xs text-black/40 mt-1">{item.note}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface RecurringCardProps {
  item: RecurringTransaction;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onEdit: (item: RecurringTransaction) => void;
  onViewHistory: (item: RecurringTransaction) => void;
  formatDate: (date: string) => string;
  getFrequencyLabel: (freq: string) => string;
}

function RecurringCard({ item, onPause, onResume, onDelete, onEdit, onViewHistory, formatDate, getFrequencyLabel }: RecurringCardProps) {
  return (
    <div className={`p-4 rounded-xl border ${item.is_active ? 'border-black/10 bg-white' : 'border-black/5 bg-black/[0.02]'} hover:border-black/20 transition-colors`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${item.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              {item.type}
            </span>
            {!item.is_active && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-600">
                Paused
              </span>
            )}
          </div>
          <div className="text-lg font-bold text-black">₹{item.amount.toLocaleString('en-IN')}</div>
          {item.category_name && (
            <div className="text-sm text-black/60">{item.category_name}</div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onViewHistory(item)}
            className="p-2 rounded-lg hover:bg-black/5 text-black/60 hover:text-black transition-colors"
            title="View History"
          >
            <Clock className="w-4 h-4" />
          </button>
          <button
            onClick={() => onEdit(item)}
            className="p-2 rounded-lg hover:bg-black/5 text-black/60 hover:text-black transition-colors"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          {item.is_active ? (
            <button
              onClick={onPause}
              className="p-2 rounded-lg hover:bg-black/5 text-black/60 hover:text-black transition-colors"
              title="Pause"
            >
              <Pause className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onResume}
              className="p-2 rounded-lg hover:bg-black/5 text-black/60 hover:text-black transition-colors"
              title="Resume"
            >
              <Play className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-2 rounded-lg hover:bg-rose-50 text-black/40 hover:text-rose-600 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-black/60">
          <Clock className="w-3.5 h-3.5" />
          <span>{getFrequencyLabel(item.frequency)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-black/60">
          <Calendar className="w-3.5 h-3.5" />
          <span>Next: {formatDate(item.next_execution_date)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-black/60">
          <span>Start: {formatDate(item.start_date)}</span>
        </div>
        {!item.never_ends && item.end_date && (
          <div className="flex items-center gap-1.5 text-black/60">
            <span>End: {formatDate(item.end_date)}</span>
          </div>
        )}
        {item.never_ends && (
          <div className="flex items-center gap-1.5 text-black/60">
            <span>Never ends</span>
          </div>
        )}
      </div>
    </div>
  );
}
