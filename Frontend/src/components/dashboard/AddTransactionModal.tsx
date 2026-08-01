import { useState, useEffect } from 'react';
import { X, ArrowRight, Repeat2 } from 'lucide-react';
import { expenseAPI, categoryAPI, recurringAPI, type Transaction, type Category } from '../../lib/api';
import { AddCategoryModal } from './AddCategoryModal';
import { CategorySelect } from './CategorySelect';
import { notifyFinanceDataChanged } from '../../lib/financeEvents';
import { formatDateForInput, getCurrentDateForInput } from '../../lib/dateUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editTxn?: Transaction | null;
  onTransactionChanged?: () => void;
}

interface FormProps {
  editTxn?: Transaction | null;
  categories: Category[];
  catId: string;
  setCatId: (id: string) => void;
  onClose: () => void;
  onAddCategory: () => void;
  onTransactionChanged?: () => void;
}

function TransactionForm({
  editTxn,
  categories,
  catId,
  setCatId,
  onClose,
  onAddCategory,
  onTransactionChanged,
}: FormProps) {
  const [title, setTitle] = useState(() => editTxn?.note || '');
  const [amount, setAmount] = useState(() => (editTxn ? String(editTxn.amount) : ''));
  const [date, setDate] = useState(() => formatDateForInput(editTxn?.expense_date) || getCurrentDateForInput());
  const [notes, setNotes] = useState('');
  const [transactionType, setTransactionType] = useState<'expense' | 'income'>('expense');
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState('monthly');
  const [startDate, setStartDate] = useState(() => formatDateForInput(editTxn?.expense_date) || getCurrentDateForInput());
  const [endDate, setEndDate] = useState('');
  const [neverEnds, setNeverEnds] = useState(true);

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Frontend validation
    const numAmount = Number(amount);
    if (numAmount <= 0) {
      alert('Amount must be greater than 0');
      return;
    }
    if (numAmount > 100000000) {
      alert('Amount cannot exceed ₹10 Crore');
      return;
    }
    
    // Income validation with warnings
    if (transactionType === 'income' && numAmount > 2000000) {
      if (numAmount > 10000000) {
        const confirmed = confirm(`This is an unusually high monthly income (₹${(numAmount / 100000).toFixed(1)} Crore). Are you sure this is correct?`);
        if (!confirmed) return;
      } else if (numAmount > 2000000) {
        const confirmed = confirm(`This is a high monthly income (₹${(numAmount / 100000).toFixed(2)} Lakh). Please verify the amount.`);
        if (!confirmed) return;
      }
    }
    
    try {
      setLoading(true);
      
      if (isRecurring && !editTxn) {
        // Create recurring transaction
        await recurringAPI.add({
          type: transactionType,
          amount: numAmount,
          category_id: catId ? Number(catId) : undefined,
          note: notes.trim() || title,
          frequency: frequency as 'daily' | 'weekly' | 'monthly' | 'yearly',
          start_date: startDate,
          end_date: endDate || undefined,
          never_ends: neverEnds,
        });
        
        // Also create the first transaction
        await expenseAPI.addExpense({
          title,
          category_id: Number(catId),
          amount: numAmount,
          expense_date: date,
          note: notes.trim() || title,
          is_recurring: true,
        });
      } else if (editTxn) {
        await expenseAPI.updateExpense(editTxn.id, {
          title,
          category_id: Number(catId),
          amount: numAmount,
          expense_date: date,
          note: notes.trim() || title,
        });
      } else {
        await expenseAPI.addExpense({
          title,
          category_id: Number(catId),
          amount: numAmount,
          expense_date: date,
          note: notes.trim() || title,
        });
      }

      onTransactionChanged?.();
      notifyFinanceDataChanged();
      onClose();
    } catch (err) {
      console.error('Error saving transaction:', err);
      alert('Failed to save transaction. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-behavior-contain space-y-4 p-6">
        {!editTxn && (
          <div>
            <label className="block text-xs font-medium text-black/60 mb-1.5">Transaction Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTransactionType('expense')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  transactionType === 'expense' 
                    ? 'bg-rose-50 text-rose-600 border-2 border-rose-200' 
                    : 'bg-[#F5F5F5] text-black/60 border-2 border-transparent hover:bg-black/5'
                }`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setTransactionType('income')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  transactionType === 'income' 
                    ? 'bg-emerald-50 text-emerald-600 border-2 border-emerald-200' 
                    : 'bg-[#F5F5F5] text-black/60 border-2 border-transparent hover:bg-black/5'
                }`}
              >
                Income
              </button>
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-black/60 mb-1.5">Description</label>
          <input
            className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
            placeholder="e.g. Swiggy Order"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-black/60 mb-1.5">Amount (₹)</label>
          <input
            type="number"
            min="1"
            step="any"
            className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-black/60 mb-1.5">Category</label>
          <CategorySelect
            categories={categories}
            value={catId}
            onChange={setCatId}
            onAddCategory={onAddCategory}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-black/60 mb-1.5">Date</label>
          <input
            type="date"
            className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-black/60 mb-1.5">Notes (optional)</label>
          <textarea
            rows={2}
            className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 resize-none"
            placeholder="Details..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Recurring Transaction Section */}
        {!editTxn && (
          <div className="border-t border-black/10 pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-4 h-4 rounded border-black/20 text-black focus:ring-black/20"
              />
              <span className="text-sm font-medium text-black flex items-center gap-1.5">
                <Repeat2 className="w-4 h-4" />
                Make this recurring
              </span>
            </label>

            {isRecurring && (
              <div className="mt-4 space-y-3 pl-6">
                <div>
                  <label className="block text-xs font-medium text-black/60 mb-1.5">Frequency</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
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
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={neverEnds}
                      onChange={(e) => setNeverEnds(e.target.checked)}
                      className="w-4 h-4 rounded border-black/20 text-black focus:ring-black/20"
                    />
                    <span className="text-sm text-black">Never Ends</span>
                  </label>

                  {!neverEnds && (
                    <div>
                      <label className="block text-xs font-medium text-black/60 mb-1.5">End Date</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-4 border-t border-black/10 shrink-0">
        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-black/60 hover:bg-black/5 transition-colors">
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !catId}
          className="flex-1 py-2.5 rounded-xl bg-black text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-60"
        >
          {loading ? 'Saving...' : 'Save'}
          {!loading && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </form>
  );
}

export function AddTransactionModal({ isOpen, onClose, editTxn, onTransactionChanged }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [catId, setCatId] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    void categoryAPI.getAllCategories()
      .then((res) => {
        if (cancelled) return;
        const cats = res.data.categories || [];
        setCategories(cats);
        if (editTxn) {
          setCatId(String(editTxn.category_id));
        } else if (cats.length > 0) {
          setCatId(String(cats[0].id));
        } else {
          setCatId('');
        }
      })
      .catch((err) => {
        console.error('Error loading categories:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, editTxn]);

  const handleCategoryCreated = (category: Category) => {
    setCategories((prev) => {
      const exists = prev.some((c) => c.id === category.id);
      if (exists) {
        return prev.map((c) => (c.id === category.id ? category : c));
      }
      return [...prev, category].sort((a, b) => a.name.localeCompare(b.name));
    });
    setCatId(String(category.id));
    setShowAddCategory(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-md max-h-[calc(100vh-32px)] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-black/10 shrink-0">
          <h3 className="text-lg font-semibold text-black">{editTxn ? 'Edit Transaction' : 'Add Transaction'}</h3>
          <button onClick={onClose} className="text-black/40 hover:text-black transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <TransactionForm
            key={editTxn?.id ?? 'new'}
            editTxn={editTxn}
            categories={categories}
            catId={catId}
            setCatId={setCatId}
            onClose={onClose}
            onAddCategory={() => setShowAddCategory(true)}
            onTransactionChanged={onTransactionChanged}
          />
        </div>
      </div>

      {showAddCategory && (
        <AddCategoryModal
          onClose={() => setShowAddCategory(false)}
          onCreated={handleCategoryCreated}
        />
      )}
    </div>
  );
}
