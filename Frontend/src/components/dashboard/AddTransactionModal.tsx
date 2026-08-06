import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ArrowRight, Repeat2 } from 'lucide-react';
import { expenseAPI, categoryAPI, recurringAPI, goalsAPI, aiAPI, type Transaction, type Category, type Goal } from '../../lib/api';
import { AddCategoryModal } from './AddCategoryModal';
import { CategorySelect } from './CategorySelect';
import { notifyFinanceDataChanged } from '../../lib/financeEvents';
import { formatDateForInput, getCurrentDateForInput } from '../../lib/dateUtils';
import {
  memoizedDetectCategory,
  preloadKeywordCache,
  getConfidenceLevel,
  levenshteinDistance,
  type CategoryDetectionResult,
  type ConfidenceLevel,
} from '../../lib/categoryMatcher';
import { getCategoryIcon } from '../../lib/categoryIcons';
import { CategoryEmoji } from './CategoryEmoji';

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

const DEBOUNCE_MS = 300;
// Auto-select when confidence >= 85; auto-select + badge at 70-84; suggestion only < 70
const AUTO_SELECT_THRESHOLD = 85;
const SHOW_BADGE_THRESHOLD = 70;

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const config: Record<ConfidenceLevel, { emoji: string; label: string; classes: string }> = {
    High: {
      emoji: '🟢',
      label: 'High Confidence',
      classes: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    },
    Medium: {
      emoji: '🟡',
      label: 'Medium Confidence',
      classes: 'text-amber-700 bg-amber-50 border-amber-100',
    },
    Low: {
      emoji: '⚪',
      label: 'Low Confidence',
      classes: 'text-gray-600 bg-gray-50 border-gray-200',
    },
  };
  const c = config[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.classes}`}
    >
      <span>{c.emoji}</span>
      {c.label}
    </span>
  );
}

function getSourceLabel(source: CategoryDetectionResult['source']): string {
  switch (source) {
    case 'learning': return 'Learned from your history';
    case 'embedding': return 'Detected using AI Similarity';
    case 'ai': return 'Detected using Gemini AI';
    case 'keyword': return 'Detected using Keywords';
    default: return 'Detected automatically';
  }
}

function AutoDetectedCard({
  detection,
  category,
  isSuggestionOnly,
}: {
  detection: CategoryDetectionResult;
  category: Category | undefined;
  isSuggestionOnly?: boolean;
}) {
  if (!detection.categoryId || !detection.categoryName) return null;

  const level = detection.confidenceLevel;
  const displayCategory = category ?? { name: detection.categoryName, icon: undefined };
  const sourceLabel = getSourceLabel(detection.source);

  if (isSuggestionOnly) {
    // Low confidence: just show a suggestion pill — don't auto-select
    return (
      <div className="mt-2 px-3 py-2 rounded-xl border border-gray-100 bg-gray-50 flex items-center gap-2">
        <span className="text-xs text-gray-500">Suggested:</span>
        <CategoryEmoji icon={getCategoryIcon(displayCategory)} className="text-sm" />
        <span className="text-xs font-medium text-gray-700">{detection.categoryName}</span>
        <span className="ml-auto text-xs text-gray-400">{detection.confidence}%</span>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">✨</span>
          <span className="text-xs font-semibold text-violet-700">
            {detection.confidence >= AUTO_SELECT_THRESHOLD ? 'AI Smart Detection' : '✨ AI detected'}
          </span>
        </div>
        <span className="text-xs font-bold text-violet-700">{detection.confidence}%</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CategoryEmoji icon={getCategoryIcon(displayCategory)} className="text-base" />
          <span className="text-sm font-medium text-black">{detection.categoryName}</span>
        </div>
        <ConfidenceBadge level={level} />
      </div>
      <div className="mt-1.5 text-xs text-violet-500/80">{sourceLabel}</div>
    </div>
  );
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
  const [transactionType, setTransactionType] = useState<'expense' | 'income'>(() => {
    if (editTxn?.transaction_type === 'income') return 'income';
    if (editTxn?.transaction_type === 'expense') return 'expense';
    return 'expense';
  });
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState('monthly');
  const [startDate, setStartDate] = useState(() => formatDateForInput(editTxn?.expense_date) || getCurrentDateForInput());
  const [endDate, setEndDate] = useState('');
  const [neverEnds, setNeverEnds] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalId, setGoalId] = useState(() => editTxn?.goal_id ? String(editTxn.goal_id) : '');

  const [loading, setLoading] = useState(false);

  const [detection, setDetection] = useState<CategoryDetectionResult | null>(null);
  const [detectLoading, setDetectLoading] = useState(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiRequestRef = useRef<number>(0);
  // Use refs to avoid stale closures in async callbacks
  const isUserLockedRef = useRef(Boolean(editTxn));
  const detectionRef = useRef<CategoryDetectionResult | null>(null);

  useEffect(() => {
    preloadKeywordCache();
  }, []);

  useEffect(() => {
    goalsAPI.getAll()
      .then(res => {
        setGoals(res.data.goals || []);
      })
      .catch(err => console.error('Error fetching goals:', err));
  }, []);

  const handleCategoryNameToId = useCallback(
    (categoryName: string | null): number | null => {
      if (!categoryName) return null;
      const target = categoryName.trim().toLowerCase();
      const exact = categories.find((c) => c.name.trim().toLowerCase() === target);
      if (exact) return exact.id;
      for (const cat of categories) {
        const cn = cat.name.trim().toLowerCase();
        if (cn.includes(target) || target.includes(cn)) return cat.id;
        const sim =
          target.length >= 4 && cn.length >= 4
            ? 1 - levenshteinDistance(cn, target) / Math.max(cn.length, target.length)
            : 0;
        if (sim >= 0.7) return cat.id;
      }
      return null;
    },
    [categories],
  );

  const applyDetectionToCatId = useCallback(
    (result: CategoryDetectionResult) => {
      if (isUserLockedRef.current) return;
      if (result.categoryId) {
        setCatId(String(result.categoryId));
      }
    },
    [setCatId],
  );

  const runDetection = useCallback(
    async (description: string) => {
      if (isUserLockedRef.current) return;
      if (!description || !description.trim()) {
        setDetection(null);
        detectionRef.current = null;
        return;
      }

      // Step 1: Instantly apply local keyword result as a low-latency preview
      const localResult = memoizedDetectCategory(description, categories);
      if (localResult.confidence >= SHOW_BADGE_THRESHOLD) {
        setDetection(localResult);
        detectionRef.current = localResult;
        if (localResult.confidence >= AUTO_SELECT_THRESHOLD) {
          applyDetectionToCatId(localResult);
        }
      }

      // Step 2: Call backend (which now checks user learning DB + aliases + AI)
      setDetectLoading(true);
      const requestId = ++aiRequestRef.current;
      try {
        const resp = await aiAPI.categorize(description);
        if (requestId !== aiRequestRef.current) return;
        if (!resp?.data?.success) return;

        const { category, confidence, source, matched_text } = resp.data;
        if (!category) return;

        const resolvedId = handleCategoryNameToId(category);
        if (!resolvedId) return;

        const finalConfidence = Number(confidence) || 0;
        const apiResult: CategoryDetectionResult = {
          categoryId: resolvedId,
          categoryName: category,
          confidence: finalConfidence,
          matchedKeyword: resp.data.matchedKeyword || null,
          matched_text: matched_text || null,
          source: source || 'ai',
          confidenceLevel: getConfidenceLevel(finalConfidence),
        };

        const currentDetection = detectionRef.current;
        // Always prefer backend result if it's at least as confident
        if (!currentDetection || finalConfidence >= currentDetection.confidence) {
          setDetection(apiResult);
          detectionRef.current = apiResult;
          // Apply auto-selection based on confidence rules
          if (finalConfidence >= SHOW_BADGE_THRESHOLD) {
            applyDetectionToCatId(apiResult);
          }
        }
      } catch (err) {
        void err;
      } finally {
        if (requestId === aiRequestRef.current) {
          setDetectLoading(false);
        }
      }
    },
    [
      categories,
      applyDetectionToCatId,
      handleCategoryNameToId,
    ],
  );

  const onTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        void runDetection(value);
      }, DEBOUNCE_MS);
    },
    [runDetection],
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleUserCategoryChange = useCallback(
    (id: string) => {
      isUserLockedRef.current = true;
      setDetection(null);       // clear badge when user overrides
      detectionRef.current = null;
      setCatId(id);
    },
    [setCatId],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const numAmount = Number(amount);
    if (numAmount <= 0) {
      alert('Amount must be greater than 0');
      return;
    }
    if (numAmount > 100000000) {
      alert('Amount cannot exceed ₹10 Crore');
      return;
    }
    
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
      
      if (isRecurring) {
        await recurringAPI.add({
          type: transactionType,
          amount: numAmount,
          category_id: Number(catId),
          note: notes.trim() || title,
          frequency: frequency as 'daily' | 'weekly' | 'monthly' | 'yearly',
          start_date: startDate,
          end_date: endDate || undefined,
          never_ends: neverEnds,
        });
        
        await expenseAPI.addExpense({
          title,
          category_id: Number(catId),
          amount: numAmount,
          expense_date: date,
          note: notes.trim() || title,
          is_recurring: true,
          goal_id: goalId ? Number(goalId) : null,
          transaction_type: transactionType,
        });
      } else if (editTxn) {
        await expenseAPI.updateExpense(editTxn.id, {
          title,
          category_id: Number(catId),
          amount: numAmount,
          expense_date: date,
          note: notes.trim() || title,
          goal_id: goalId ? Number(goalId) : null,
          transaction_type: transactionType,
        });
      } else {
        await expenseAPI.addExpense({
          title,
          category_id: Number(catId),
          amount: numAmount,
          expense_date: date,
          note: notes.trim() || title,
          goal_id: goalId ? Number(goalId) : null,
          transaction_type: transactionType,
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

  const detectedCategory = detection?.categoryId
    ? categories.find((c) => c.id === detection.categoryId)
    : undefined;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-behavior-contain space-y-4 p-6">
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
        <div>
          <label className="block text-xs font-medium text-black/60 mb-1.5">Description</label>
          <input
            className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
            placeholder="e.g. Swiggy Order"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
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
            onChange={handleUserCategoryChange}
            onAddCategory={onAddCategory}
          />
          {detection && !editTxn && (
            <AutoDetectedCard
              detection={detection}
              category={detectedCategory}
              isSuggestionOnly={detection.confidence < SHOW_BADGE_THRESHOLD}
            />
          )}
          {detectLoading && !detection && !editTxn && (
            <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
              <span className="text-xs text-gray-500">Detecting category…</span>
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-black/60 mb-1.5">Link to Financial Goal (Optional)</label>
          <select
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 bg-white border border-black/5"
          >
            <option value="">None (Don't link to a goal)</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.icon} {g.title} ({Math.round(g.progress_percentage || 0)}%)
              </option>
            ))}
          </select>
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
