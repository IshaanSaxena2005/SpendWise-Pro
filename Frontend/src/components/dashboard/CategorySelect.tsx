import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { Category } from '../../lib/api';
import { getCategoryIcon } from '../../lib/categoryIcons';
import { CategoryEmoji } from './CategoryEmoji';

interface Props {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  onAddCategory: () => void;
}

export function CategorySelect({ categories, value, onChange, onAddCategory }: Props) {
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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 cursor-pointer flex items-center justify-between gap-2"
      >
        <span className="flex items-center gap-2 truncate">
          {selected ? (
            <>
              <CategoryEmoji icon={getCategoryIcon(selected)} className="text-base" />
              <span className="text-black">{selected.name}</span>
            </>
          ) : (
            <span className="text-black/40">Select category</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-black/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full bg-white border border-black/10 rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-48 overflow-y-auto py-1">
            {categories.map((c) => {
              const isSelected = String(c.id) === value;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(String(c.id));
                    setOpen(false);
                  }}
                  className={`w-full px-3 py-2.5 text-sm flex items-center gap-2.5 text-left transition-colors ${
                    isSelected ? 'bg-violet-50 text-violet-700' : 'hover:bg-[#F5F5F5] text-black'
                  }`}
                >
                  <CategoryEmoji icon={getCategoryIcon(c)} className="text-base" />
                  <span>{c.name}</span>
                </button>
              );
            })}
          </div>
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
