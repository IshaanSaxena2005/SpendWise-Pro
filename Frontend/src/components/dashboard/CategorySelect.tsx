import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { Category } from '../../lib/api';
import { getCategoryIcon } from '../../lib/categoryIcons';
import { CategoryEmoji } from './CategoryEmoji';

interface Props {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  onAddCategory: () => void;
  /**
   * Per-option cross affordance: show an ✕ on every category row that deletes it
   * (via categoryAPI.deleteCategory) after confirmation. Omit to hide.
   */
  onDeleteCategory?: (id: number) => Promise<void>;
  /** Category currently being deleted — shows a spinner and disables its ✕. */
  deletingCategoryId?: number | null;
  /** Show a "Clear selection" row (only meaningful when an empty value is allowed). */
  allowEmpty?: boolean;
  /** Placeholder shown when nothing is selected (defaults to "Select category"). */
  emptyLabel?: string;
}

export function CategorySelect({
  categories,
  value,
  onChange,
  onAddCategory,
  onDeleteCategory,
  deletingCategoryId = null,
  allowEmpty = false,
  emptyLabel = 'Select category',
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = categories.find((c) => String(c.id) === value);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    e.preventDefault();
    void onDeleteCategory?.(id);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 cursor-pointer flex items-center justify-between gap-2 transition-all duration-200 hover:bg-black/5"
      >
        <span className="flex items-center gap-2 truncate">
          {selected ? (
            <>
              <CategoryEmoji icon={getCategoryIcon(selected)} className="text-base" />
              <span className="text-black">{selected.name}</span>
            </>
          ) : (
            <span className="text-black/40">{emptyLabel}</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-black/40 shrink-0 transition-transform duration-200 ease-out ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="dropdown-in absolute z-20 mt-1.5 w-full bg-white border border-black/10 rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-48 overflow-y-auto py-1">
            {categories.map((c) => {
              const isSelected = String(c.id) === value;
              const isDeleting = deletingCategoryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(String(c.id));
                    setOpen(false);
                  }}
                  className={`group w-full pl-3 pr-2 py-2.5 text-sm flex items-center gap-2.5 text-left transition-colors ${
                    isSelected ? 'bg-violet-50 text-violet-700' : 'hover:bg-[#F5F5F5] text-black'
                  }`}
                >
                  <CategoryEmoji icon={getCategoryIcon(c)} className="text-base" />
                  <span className="flex-1 truncate">{c.name}</span>
                  {onDeleteCategory && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete category ${c.name}`}
                      title={`Delete "${c.name}"`}
                      onClick={(e) => handleDelete(e, c.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          e.preventDefault();
                          void onDeleteCategory(c.id);
                        }
                      }}
                      className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-150 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-500 ${
                        isDeleting
                          ? 'text-rose-400 cursor-wait'
                          : 'text-black/25 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 hover:bg-rose-50 hover:text-rose-500 active:scale-90'
                      }`}
                    >
                      {isDeleting ? (
                        <span className="w-3 h-3 rounded-full border-2 border-rose-300 border-t-transparent animate-spin" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {allowEmpty && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="w-full px-3 py-2.5 text-xs font-semibold text-black/60 hover:bg-[#F5F5F5] border-t border-black/5 flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-600"
            >
              <X className="w-3.5 h-3.5" />
              Clear selection
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAddCategory();
            }}
            className="w-full px-3 py-2.5 text-xs font-semibold text-violet-600 hover:bg-violet-50 border-t border-black/5 flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add New Category
          </button>
        </div>
      )}
    </div>
  );
}
