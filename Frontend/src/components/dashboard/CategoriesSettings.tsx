import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useCategories, deleteCategoryApi } from '../../lib/categories';
import type { Category } from '../../lib/store';
import { CategoryModal } from './CategoryModal';

export function CategoriesSettings() {
  const categories = useCategories();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
    setError(null);
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    setModalOpen(true);
    setError(null);
  };

  const handleDelete = async (category: Category) => {
    if (!confirm(`Delete category "${category.name}"?`)) return;
    setDeletingId(category.id);
    setError(null);
    try {
      await deleteCategoryApi(category.id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to delete category.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-black">Categories</h2>
          <p className="text-sm text-black/50 mt-1">Manage categories used in transactions and budgets</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 bg-black text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      </div>

      {error && (
        <div className="mb-4 text-xs font-medium text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {categories.length === 0 ? (
        <div className="text-center py-12 text-sm text-black/50">
          No categories yet. Add your first category to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map(category => (
            <div
              key={category.id}
              className="flex items-center justify-between p-3 rounded-xl border border-black/5 hover:bg-black/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                  style={{ background: category.bg }}
                >
                  {category.icon}
                </div>
                <div>
                  <div className="text-sm font-semibold text-black">{category.name}</div>
                  <div className="text-xs text-black/40">{category.color}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEdit(category)}
                  className="p-2 text-black/40 hover:text-black hover:bg-black/5 rounded-lg transition-colors"
                  aria-label={`Edit ${category.name}`}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(category)}
                  disabled={deletingId === category.id}
                  className="p-2 text-black/40 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                  aria-label={`Delete ${category.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CategoryModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editCategory={editing}
      />
    </div>
  );
}
