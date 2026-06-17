import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { categoryAPI, type Category } from '../../lib/api';
import { CATEGORY_EMOJI_OPTIONS } from '../../lib/categoryIcons';

interface Props {
  onClose: () => void;
  onCreated: (category: Category) => void;
}

export function AddCategoryModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(CATEGORY_EMOJI_OPTIONS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Category name is required.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await categoryAPI.addCategory({ name: trimmed, icon });
      if (res.data.category) {
        onCreated(res.data.category);
      }
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string; errors?: { message: string }[] } } };
      const validationMsg = apiErr.response?.data?.errors?.map((e) => e.message).join(', ');
      setError(validationMsg || apiErr.response?.data?.message || 'Failed to create category.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl border border-black/5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-base font-semibold text-black">New Category</h4>
          <button type="button" onClick={onClose} className="text-black/40 hover:text-black transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-black/60 mb-1.5">Name</label>
            <input
              className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
              placeholder="e.g. Groceries"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-black/60 mb-2">Emoji</label>
            <div className="grid grid-cols-8 gap-1.5">
              {CATEGORY_EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                    icon === emoji
                      ? 'bg-black text-white scale-105 shadow-sm'
                      : 'bg-[#F5F5F5] hover:bg-black/5'
                  }`}
                  aria-label={`Select ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-600 font-medium">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-black/60 hover:bg-black/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-black text-white text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-gray-800 transition-colors disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
