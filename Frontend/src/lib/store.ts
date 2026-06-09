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

export interface AIInsight {
  type: 'danger' | 'warning' | 'success' | 'info';
  title: string;
  text: string;
}

const KEYS = {
  USER:         'sw_user',
  CATEGORIES:   'sw_categories',
  TRANSACTIONS: 'sw_transactions',
  BUDGETS:      'sw_budgets',
  MONTHLY_DATA: 'sw_monthly_data',
  AI_INSIGHTS:  'sw_insights',
  AI_SCORE:     'sw_score',
};

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

const DEFAULT_TRANSACTIONS: Transaction[] = [
  { id: 1,  title: 'Swiggy Order',        type: 'expense', category_id: 1, amount: 340,   date: '2026-06-21', notes: 'Dinner' },
  { id: 2,  title: 'Uber Ride',           type: 'expense', category_id: 2, amount: 220,   date: '2026-06-20', notes: 'Office commute' },
  { id: 3,  title: 'Freelance Payment',   type: 'income',  category_id: 8, amount: 12000, date: '2026-06-19', notes: 'Client project' },
  { id: 4,  title: 'Amazon Purchase',     type: 'expense', category_id: 3, amount: 1299,  date: '2026-06-18', notes: 'Headphones' },
  { id: 5,  title: 'Electricity Bill',    type: 'expense', category_id: 4, amount: 850,   date: '2026-06-17', notes: 'Monthly' },
  { id: 6,  title: 'Zepto Groceries',     type: 'expense', category_id: 1, amount: 680,   date: '2026-06-16', notes: 'Weekly groceries' },
  { id: 7,  title: 'Netflix',             type: 'expense', category_id: 6, amount: 649,   date: '2026-06-15', notes: 'Subscription' },
  { id: 8,  title: 'Salary Credit',       type: 'income',  category_id: 7, amount: 55000, date: '2026-06-01', notes: 'June salary' },
  { id: 9,  title: 'Zomato Order',        type: 'expense', category_id: 1, amount: 420,   date: '2026-06-14', notes: 'Lunch' },
  { id: 10, title: 'Ola Cab',             type: 'expense', category_id: 2, amount: 180,   date: '2026-06-13', notes: 'Airport' },
  { id: 11, title: 'Myntra Shopping',     type: 'expense', category_id: 3, amount: 2199,  date: '2026-06-12', notes: 'Clothes' },
  { id: 12, title: 'Gym Membership',      type: 'expense', category_id: 5, amount: 1500,  date: '2026-06-11', notes: 'Monthly' },
  { id: 13, title: 'Spotify',             type: 'expense', category_id: 6, amount: 119,   date: '2026-06-10', notes: 'Subscription' },
  { id: 14, title: 'Pharmacy',            type: 'expense', category_id: 5, amount: 340,   date: '2026-06-09', notes: 'Medicines' },
  { id: 15, title: 'Internet Bill',       type: 'expense', category_id: 4, amount: 799,   date: '2026-06-08', notes: 'Jio Fiber' },
  { id: 16, title: 'Freelance Payment 2', type: 'income',  category_id: 8, amount: 8000,  date: '2026-06-07', notes: 'Design work' },
  { id: 17, title: 'Blinkit Order',       type: 'expense', category_id: 1, amount: 560,   date: '2026-06-06', notes: 'Snacks' },
  { id: 18, title: 'Movie Tickets',       type: 'expense', category_id: 6, amount: 480,   date: '2026-06-05', notes: 'Weekend' },
  { id: 19, title: 'Mobile Recharge',     type: 'expense', category_id: 4, amount: 299,   date: '2026-06-04', notes: 'Airtel' },
  { id: 20, title: 'Swiggy Instamart',    type: 'expense', category_id: 1, amount: 390,   date: '2026-06-03', notes: 'Vegetables' },
];

const DEFAULT_BUDGETS: Budget[] = [
  { category_id: 1, monthly_limit: 8000,  spent: 0 },
  { category_id: 2, monthly_limit: 6000,  spent: 0 },
  { category_id: 3, monthly_limit: 5000,  spent: 0 },
  { category_id: 4, monthly_limit: 4000,  spent: 0 },
  { category_id: 5, monthly_limit: 3000,  spent: 0 },
  { category_id: 6, monthly_limit: 2000,  spent: 0 },
];

const DEFAULT_INSIGHTS: AIInsight[] = [
  { type: 'danger',  title: 'Food overspend pattern',  text: "You've ordered food delivery 8 times this month. Cooking 3x a week could save ₹2,400 monthly." },
  { type: 'warning', title: 'Shopping over budget',    text: '₹800 over your ₹5,000 shopping limit. 2 Myntra orders this week contributed 65% of that.' },
  { type: 'success', title: 'Travel spend improving',  text: 'Travel is ₹2,900 under budget. Down 18% from last month — great discipline.' },
  { type: 'info',    title: '3 active subscriptions',  text: 'Netflix ₹649 + Spotify ₹119 + Jio ₹799 = ₹1,567/month. Review if all are being used.' },
  { type: 'success', title: 'Income diversified',      text: '20% of this month\'s income is from freelance. Building multiple income sources — excellent habit.' },
];

// ─── Bootstrap localStorage ──────────────────────────────────────────────────
function initLS() {
  if (!localStorage.getItem(KEYS.CATEGORIES))   localStorage.setItem(KEYS.CATEGORIES,   JSON.stringify(DEFAULT_CATEGORIES));
  if (!localStorage.getItem(KEYS.TRANSACTIONS)) localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(DEFAULT_TRANSACTIONS));
  if (!localStorage.getItem(KEYS.BUDGETS))      localStorage.setItem(KEYS.BUDGETS,      JSON.stringify(DEFAULT_BUDGETS));
  if (!localStorage.getItem(KEYS.AI_INSIGHTS))  localStorage.setItem(KEYS.AI_INSIGHTS,  JSON.stringify(DEFAULT_INSIGHTS));
  if (!localStorage.getItem(KEYS.AI_SCORE))     localStorage.setItem(KEYS.AI_SCORE,     '78');
}
initLS();

// ─── Recalculate spent per budget category ───────────────────────────────────
export function recalculate() {
  const txns: Transaction[] = JSON.parse(localStorage.getItem(KEYS.TRANSACTIONS) || '[]');
  const budgets: Budget[]   = JSON.parse(localStorage.getItem(KEYS.BUDGETS)      || '[]');

  budgets.forEach(b => (b.spent = 0));
  txns.filter(t => t.type === 'expense' && t.date.startsWith('2026-06')).forEach(t => {
    const b = budgets.find(b => b.category_id === t.category_id);
    if (b) b.spent += t.amount;
  });

  const totalLimit = budgets.reduce((s, b) => s + b.monthly_limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent,         0);
  const ratio      = totalLimit > 0 ? totalSpent / totalLimit : 0;
  const score      = ratio <= 0.6 ? 88 : ratio <= 0.8 ? 78 : ratio <= 0.95 ? 65 : 45;

  localStorage.setItem(KEYS.BUDGETS,  JSON.stringify(budgets));
  localStorage.setItem(KEYS.AI_SCORE, String(score));
}

// ─── Public accessors ─────────────────────────────────────────────────────────
export const getCategories   = (): Category[]    => JSON.parse(localStorage.getItem(KEYS.CATEGORIES)   || '[]');
export const getTransactions = (): Transaction[] => JSON.parse(localStorage.getItem(KEYS.TRANSACTIONS) || '[]');
export const getBudgets      = (): Budget[]      => JSON.parse(localStorage.getItem(KEYS.BUDGETS)      || '[]');
export const getInsights     = (): AIInsight[]   => JSON.parse(localStorage.getItem(KEYS.AI_INSIGHTS)  || '[]');
export const getAIScore      = (): number        => parseInt(localStorage.getItem(KEYS.AI_SCORE) || '78', 10);

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
