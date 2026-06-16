import { useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
import type { Category } from '../../lib/store';
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_EMOJI_OPTIONS,
  createCategoryApi,
  updateCategoryApi,
} from '../../lib/categories';

interface FormProps {
  editCategory?: Category | null;
  onClose: () => void;
  onSaved?: (category: Category) => void;
}

function CategoryForm({ editCategory, onClose, onSaved }: FormProps) {
  const [name, setName] = useState(editCategory?.name ?? '');
  const [icon, setIcon] = useState(editCategory?.icon ?? '📁');
  const [color, setColor] = useState(editCategory?.color ?? CATEGORY_COLOR_OPTIONS[0].color);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Category name is required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const saved = editCategory
        ? await updateCategoryApi(editCategory.id, { name, icon, color })
        : await createCategoryApi({ name, icon, color });
      onSaved?.(saved);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to save category.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && (
        <div className="mb-4 text-xs font-medium text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-black/60 mb-1.5">Name</label>
          <input
            className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
            placeholder="e.g. Groceries"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-black/60 mb-2">Icon</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_EMOJI_OPTIONS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center border transition-colors ${
                  icon === emoji ? 'border-black bg-black/5' : 'border-black/10 hover:bg-black/5'
                }`}
                disabled={loading}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-black/60 mb-2">Color (optional)</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLOR_OPTIONS.map(opt => (
              <button
                key={opt.color}
                type="button"
                onClick={() => setColor(opt.color)}
                className={`w-8 h-8 rounded-full border-2 transition-transform ${
                  color === opt.color ? 'border-black scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: opt.color }}
                disabled={loading}
                aria-label={`Color ${opt.color}`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F5F5F5] border border-black/5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
            style={{ background: CATEGORY_COLOR_OPTIONS.find(o => o.color === color)?.bg ?? '#F3F4F6' }}
          >
            {icon}
          </div>
          <div>
            <div className="text-sm font-semibold text-black">{name || 'Preview'}</div>
            <div className="text-xs text-black/50">Category preview</div>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-black/60 hover:bg-black/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-black text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-55"
          >
            {loading ? 'Saving…' : editCategory ? 'Update' : 'Create'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </>
  );
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editCategory?: Category | null;
  onSaved?: (category: Category) => void;
}

export function CategoryModal({ isOpen, onClose, editCategory, onSaved }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-black">
            {editCategory ? 'Edit Category' : 'Add Category'}
          </h3>
          <button onClick={onClose} className="text-black/40 hover:text-black transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <CategoryForm
          key={editCategory?.id ?? 'new'}
          editCategory={editCategory}
          onClose={onClose}
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}
