import { useEffect, useState, useCallback } from 'react';
import api from './api';
import { fetchExpenses, getCachedExpenses, getCurrentMonthPrefix, EXPENSES_UPDATED_EVENT } from './expenses';

export const BUDGETS_UPDATED_EVENT = 'spendwise-budgets-updated';

export interface Budget {
  id: number;
  category_id: number;
  monthly_limit: number;
  spent: number;
  month: string;
}

interface ApiBudget {
  id: number;
  category_id: number | null;
  amount_limit: number;
  month: string;
}

let cachedBudgets: Budget[] = [];

function computeSpent(categoryId: number, monthPrefix: string): number {
  return getCachedExpenses()
    .filter(t => t.type === 'expense' && t.category_id === categoryId && t.date.startsWith(monthPrefix))
    .reduce((sum, t) => sum + t.amount, 0);
}

function mapApiBudget(b: ApiBudget): Budget | null {
  if (b.category_id == null) return null;
  const monthPrefix = typeof b.month === 'string' ? b.month.slice(0, 7) : '';
  return {
    id: b.id,
    category_id: b.category_id,
    monthly_limit: Number(b.amount_limit),
    spent: computeSpent(b.category_id, monthPrefix),
    month: monthPrefix,
  };
}

export function emitBudgetsUpdated() {
  window.dispatchEvent(new CustomEvent(BUDGETS_UPDATED_EVENT));
}

export function getCachedBudgets(): Budget[] {
  return cachedBudgets;
}

/** Budgets for the current calendar month with spent computed from expenses. */
export async function fetchBudgets(): Promise<Budget[]> {
  const token = localStorage.getItem('token');
  if (!token) {
    cachedBudgets = [];
    emitBudgetsUpdated();
    return [];
  }

  await fetchExpenses();

  const monthPrefix = getCurrentMonthPrefix();
  const response = await api.get('/budgets/all');
  const rows: ApiBudget[] = response.data?.budgets ?? [];
  cachedBudgets = rows
    .map(mapApiBudget)
    .filter((b): b is Budget => b !== null && b.month === monthPrefix);
  emitBudgetsUpdated();
  return cachedBudgets;
}

export function useBudgets(): { budgets: Budget[]; loading: boolean; refresh: () => Promise<void> } {
  const [budgets, setBudgets] = useState<Budget[]>(cachedBudgets);
  const [loading, setLoading] = useState(cachedBudgets.length === 0 && !!localStorage.getItem('token'));

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('token')) {
      setBudgets([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchBudgets();
      setBudgets(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!localStorage.getItem('token')) {
        if (!cancelled) setBudgets([]);
        return;
      }
      setLoading(true);
      try {
        const data = await fetchBudgets();
        if (!cancelled) setBudgets(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const sync = () => setBudgets(getCachedBudgets());
    window.addEventListener(BUDGETS_UPDATED_EVENT, sync);
    window.addEventListener(EXPENSES_UPDATED_EVENT, sync);
    return () => {
      cancelled = true;
      window.removeEventListener(BUDGETS_UPDATED_EVENT, sync);
      window.removeEventListener(EXPENSES_UPDATED_EVENT, sync);
    };
  }, []);

  return { budgets, loading, refresh };
}

export async function setBudgetApi(category_id: number, monthly_limit: number): Promise<void> {
  const month = `${getCurrentMonthPrefix()}-01`;
  const existing = getCachedBudgets().find(b => b.category_id === category_id);

  if (existing) {
    await api.put(`/budgets/update/${existing.id}`, {
      category_id,
      month,
      amount_limit: monthly_limit,
    });
  } else {
    await api.post('/budgets/add', {
      category_id,
      month,
      amount_limit: monthly_limit,
    });
  }
  await fetchBudgets();
}

export async function deleteBudgetApi(id: number): Promise<void> {
  await api.delete(`/budgets/delete/${id}`);
  await fetchBudgets();
}
