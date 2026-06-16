import { useState } from 'react';
import { X, ArrowRight, Plus } from 'lucide-react';
import { addTransaction, type Transaction } from '../../lib/store';
import { useCategories } from '../../lib/categories';
import { CategoryModal } from './CategoryModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editTxn?: Transaction | null;
}

export function AddTransactionModal({ isOpen, onClose, editTxn }: Props) {
  const categories = useCategories();
  const [type, setType]     = useState<'expense' | 'income'>('expense');
  const [title, setTitle]   = useState(editTxn?.title   || '');
  const [amount, setAmount] = useState(editTxn?.amount?.toString() || '');
  const [catId, setCatId]   = useState(editTxn?.category_id?.toString() || String(categories[0]?.id || ''));
  const [date, setDate]     = useState(editTxn?.date || new Date().toISOString().split('T')[0]);
  const [notes, setNotes]   = useState(editTxn?.notes || '');
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  const selectedCatId = catId && categories.some(c => String(c.id) === catId)
    ? catId
    : String(categories[0]?.id ?? '');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addTransaction({
      title,
      type,
      category_id: parseInt(selectedCatId, 10),
      amount: parseFloat(amount),
      date,
      notes,
    });
    onClose();
    window.location.reload();
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-black">Add Transaction</h3>
            <button onClick={onClose} className="text-black/40 hover:text-black transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Type Toggle */}
          <div className="flex rounded-xl overflow-hidden border border-black/10 mb-5">
            {(['expense', 'income'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors capitalize ${
                  type === t ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-black/60 mb-1.5">Description</label>
              <input
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                placeholder="e.g. Swiggy Order"
                value={title} onChange={e => setTitle(e.target.value)} required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-black/60 mb-1.5">Amount (₹)</label>
              <input
                type="number" min="1" step="any"
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                placeholder="0"
                value={amount} onChange={e => setAmount(e.target.value)} required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-black/60">Category</label>
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Category
                </button>
              </div>
              <select
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 cursor-pointer"
                value={selectedCatId}
                onChange={e => setCatId(e.target.value)}
                required
              >
                {categories.length === 0 ? (
                  <option value="">No categories — add one first</option>
                ) : (
                  categories.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-black/60 mb-1.5">Date</label>
              <input
                type="date"
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                value={date} onChange={e => setDate(e.target.value)} required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-black/60 mb-1.5">Notes (optional)</label>
              <textarea
                rows={2}
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 resize-none"
                placeholder="Details..."
                value={notes} onChange={e => setNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-black/60 hover:bg-black/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={categories.length === 0}
                className="flex-1 py-2.5 rounded-xl bg-black text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-55"
              >
                Save <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>

      <CategoryModal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onSaved={category => setCatId(String(category.id))}
      />
    </>
  );
}
