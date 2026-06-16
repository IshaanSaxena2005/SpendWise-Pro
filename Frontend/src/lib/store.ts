// ─── SpendWise Pro — Shared Types & Category Cache ───────────────────────────
// Financial data (transactions, budgets) lives in MySQL via expenses.ts / budgets.ts.

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

const KEYS = {
  CATEGORIES: 'sw_categories',
  STORE_VERSION: 'sw_store_version',
};

const STORE_VERSION = '3';

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

function initLS() {
  const storedVersion = localStorage.getItem(KEYS.STORE_VERSION);

  if (storedVersion !== STORE_VERSION) {
    localStorage.removeItem('sw_transactions');
    localStorage.removeItem('sw_budgets');
    localStorage.removeItem('sw_insights');
    localStorage.removeItem('sw_score');
    localStorage.setItem(KEYS.STORE_VERSION, STORE_VERSION);
  }

  if (!localStorage.getItem(KEYS.CATEGORIES)) {
    localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
  }
}
initLS();

export const getCategories = (): Category[] =>
  JSON.parse(localStorage.getItem(KEYS.CATEGORIES) || '[]');

export function setCategories(categories: Category[]) {
  localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(categories));
}
