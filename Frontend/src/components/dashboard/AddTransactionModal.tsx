import { useState, useEffect } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { expenseAPI, categoryAPI, type Transaction, type Category } from '../../lib/api';
import { AddCategoryModal } from './AddCategoryModal';
import { CategorySelect } from './CategorySelect';
import { notifyFinanceDataChanged } from '../../lib/financeEvents';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editTxn?: Transaction | null;
  onTransactionChanged?: () => void;
}

function getDefaultDate() {
  return new Date().toISOString().split('T')[0];
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
  const [date, setDate] = useState(() => editTxn?.expense_date || getDefaultDate());
  const [notes, setNotes] = useState(() => editTxn?.note || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (editTxn) {
        await expenseAPI.updateExpense(editTxn.id, {
          title,
          category_id: Number(catId),
          amount: Number(amount),
          expense_date: date,
          note: notes || title,
        });
      } else {
        await expenseAPI.addExpense({
          title,
          category_id: Number(catId),
          amount: Number(amount),
          expense_date: date,
          note: notes || title,
        });
      }
      onTransactionChanged?.();
      notifyFinanceDataChanged();
      onClose();
    } catch (err) {
      console.error('Error saving transaction:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
      <div className="flex gap-3 pt-1">
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
      <div className="relative bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-black">{editTxn ? 'Edit Transaction' : 'Add Transaction'}</h3>
          <button onClick={onClose} className="text-black/40 hover:text-black transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

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

      {showAddCategory && (
        <AddCategoryModal
          onClose={() => setShowAddCategory(false)}
          onCreated={handleCategoryCreated}
        />
      )}
    </div>
  );
}
