// ─── SpendWise Pro — Data Store ──────────────────────────────────────────────
// TypeScript port of data.js.  All pages read from / write to localStorage via
// this module so state stays consistent across route changes.

export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  bg: string;
}

export interface Transaction {
  id: number;
  title: string;
  type: 'income' | 'expense';
  category_id: number;
  amount: number;
  date: string;
  notes: string;
}

export interface Budget {
  category_id: number;
  monthly_limit: number;
  spent: number;
}

const KEYS = {
  USER:         'sw_user',
  CATEGORIES:   'sw_categories',
  TRANSACTIONS: 'sw_transactions',
  BUDGETS:      'sw_budgets',
  MONTHLY_DATA: 'sw_monthly_data',
  STORE_VERSION: 'sw_store_version',
};

const STORE_VERSION = '2';

/** Default category templates (icons/colors only — no financial amounts). */
const DEFAULT_CATEGORIES: Category[] = [
  { id: 1, name: 'Food',          icon: '🍔', color: '#F59E0B', bg: '#FEF3C7' },
  { id: 2, name: 'Travel',        icon: '🚕', color: '#7C3AED', bg: '#EDE9FE' },
  { id: 3, name: 'Shopping',      icon: '🛍️', color: '#EC4899', bg: '#FCE7F3' },
  { id: 4, name: 'Bills',         icon: '💡', color: '#3B82F6', bg: '#DBEAFE' },
  { id: 5, name: 'Health',        icon: '💊', color: '#10B981', bg: '#D1FAE5' },
  { id: 6, name: 'Entertainment', icon: '🎬', color: '#F97316', bg: '#FFEDD5' },
  { id: 7, name: 'Salary',        icon: '💼', color: '#059669', bg: '#D1FAE5' },
  { id: 8, name: 'Freelance',     icon: '💻', color: '#8B5CF6', bg: '#EDE9FE' },
];

// ─── Bootstrap localStorage ──────────────────────────────────────────────────
function initLS() {
  const storedVersion = localStorage.getItem(KEYS.STORE_VERSION);

  if (storedVersion !== STORE_VERSION) {
    localStorage.setItem(KEYS.TRANSACTIONS, '[]');
    localStorage.setItem(KEYS.BUDGETS, '[]');
    localStorage.removeItem('sw_insights');
    localStorage.removeItem('sw_score');
    localStorage.setItem(KEYS.STORE_VERSION, STORE_VERSION);
  }

  if (!localStorage.getItem(KEYS.CATEGORIES)) {
    localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
  }
  if (!localStorage.getItem(KEYS.TRANSACTIONS)) {
    localStorage.setItem(KEYS.TRANSACTIONS, '[]');
  }
  if (!localStorage.getItem(KEYS.BUDGETS)) {
    localStorage.setItem(KEYS.BUDGETS, '[]');
  }
}
initLS();

// ─── Recalculate spent per budget category ───────────────────────────────────
export function recalculate() {
  const txns: Transaction[] = JSON.parse(localStorage.getItem(KEYS.TRANSACTIONS) || '[]');
  const budgets: Budget[]   = JSON.parse(localStorage.getItem(KEYS.BUDGETS)      || '[]');

  budgets.forEach(b => (b.spent = 0));
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  txns.filter(t => t.type === 'expense' && t.date.startsWith(currentMonth)).forEach(t => {
    const b = budgets.find(b => b.category_id === t.category_id);
    if (b) b.spent += t.amount;
  });

  localStorage.setItem(KEYS.BUDGETS, JSON.stringify(budgets));
}

// ─── Public accessors ─────────────────────────────────────────────────────────
export const getCategories   = (): Category[]    => JSON.parse(localStorage.getItem(KEYS.CATEGORIES)   || '[]');
export const getTransactions = (): Transaction[] => JSON.parse(localStorage.getItem(KEYS.TRANSACTIONS) || '[]');
export const getBudgets      = (): Budget[]      => JSON.parse(localStorage.getItem(KEYS.BUDGETS)      || '[]');

export function setCategories(categories: Category[]) {
  localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(categories));
}

// ─── Mutations ────────────────────────────────────────────────────────────────
export function addTransaction(t: Omit<Transaction, 'id'>): Transaction {
  const txns = getTransactions();
  const newT  = { ...t, id: Date.now() };
  txns.unshift(newT);
  localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(txns));
  recalculate();
  return newT;
}

export function updateTransaction(id: number, fields: Partial<Transaction>) {
  const txns = getTransactions().map(t => t.id === id ? { ...t, ...fields } : t);
  localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(txns));
  recalculate();
}

export function deleteTransaction(id: number) {
  const txns = getTransactions().filter(t => t.id !== id);
  localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(txns));
  recalculate();
}

export function setBudget(category_id: number, monthly_limit: number) {
  const budgets = getBudgets();
  const existing = budgets.find(b => b.category_id === category_id);
  if (existing) {
    existing.monthly_limit = monthly_limit;
  } else {
    budgets.push({ category_id, monthly_limit, spent: 0 });
  }
  localStorage.setItem(KEYS.BUDGETS, JSON.stringify(budgets));
  recalculate();
}

// Run once on import
recalculate();
