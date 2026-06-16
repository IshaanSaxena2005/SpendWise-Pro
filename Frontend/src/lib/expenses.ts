import { useEffect, useState, useCallback } from 'react';
import api from './api';
import type { Transaction } from './store';

export const EXPENSES_UPDATED_EVENT = 'spendwise-expenses-updated';

interface ApiExpense {
  id: number;
  category_id: number;
  category_name?: string;
  amount: number;
  expense_date: string;
  note?: string | null;
  transaction_type?: 'expense' | 'income';
}

let cachedExpenses: Transaction[] = [];

function parseNote(note?: string | null): { title: string; notes: string } {
  const text = note?.trim() || '';
  if (!text) return { title: 'Transaction', notes: '' };
  const parts = text.split('|');
  if (parts.length >= 2 && parts[0].startsWith('title:')) {
    return { title: parts[0].replace('title:', '').trim(), notes: parts.slice(1).join('|').trim() };
  }
  return { title: text, notes: '' };
}

function formatNote(title: string, notes: string): string {
  const base = `title:${title.trim()}`;
  return notes.trim() ? `${base}|${notes.trim()}` : base;
}

export function mapApiExpenseToTransaction(e: ApiExpense): Transaction {
  const { title, notes } = parseNote(e.note);
  return {
    id: e.id,
    title,
    type: e.transaction_type === 'income' ? 'income' : 'expense',
    category_id: e.category_id,
    amount: Number(e.amount),
    date: typeof e.expense_date === 'string'
      ? e.expense_date.slice(0, 10)
      : new Date(e.expense_date).toISOString().slice(0, 10),
    notes,
  };
}

export function emitExpensesUpdated() {
  window.dispatchEvent(new CustomEvent(EXPENSES_UPDATED_EVENT));
}

export function getCachedExpenses(): Transaction[] {
  return cachedExpenses;
}

export async function fetchExpenses(): Promise<Transaction[]> {
  const token = localStorage.getItem('token');
  if (!token) {
    cachedExpenses = [];
    emitExpensesUpdated();
    return [];
  }

  const response = await api.get('/expenses/all');
  const rows: ApiExpense[] = response.data?.expenses ?? [];
  cachedExpenses = rows.map(mapApiExpenseToTransaction);
  emitExpensesUpdated();
  return cachedExpenses;
}

export function useExpenses(): { transactions: Transaction[]; loading: boolean; refresh: () => Promise<void> } {
  const [transactions, setTransactions] = useState<Transaction[]>(cachedExpenses);
  const [loading, setLoading] = useState(cachedExpenses.length === 0 && !!localStorage.getItem('token'));

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('token')) {
      setTransactions([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchExpenses();
      setTransactions(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!localStorage.getItem('token')) {
        if (!cancelled) setTransactions([]);
        return;
      }
      setLoading(true);
      try {
        const data = await fetchExpenses();
        if (!cancelled) setTransactions(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const sync = () => setTransactions(getCachedExpenses());
    window.addEventListener(EXPENSES_UPDATED_EVENT, sync);
    return () => {
      cancelled = true;
      window.removeEventListener(EXPENSES_UPDATED_EVENT, sync);
    };
  }, []);

  return { transactions, loading, refresh };
}

export async function addExpenseApi(t: Omit<Transaction, 'id'>): Promise<Transaction> {
  const response = await api.post('/expenses/add', {
    category_id: t.category_id,
    amount: t.amount,
    expense_date: t.date,
    title: t.title,
    note: formatNote(t.title, t.notes),
    transaction_type: t.type,
  });
  await fetchExpenses();
  const created = getCachedExpenses()[0];
  if (!created && response.data?.id) {
    return mapApiExpenseToTransaction({
      id: response.data.id,
      category_id: t.category_id,
      amount: t.amount,
      expense_date: t.date,
      note: formatNote(t.title, t.notes),
      transaction_type: t.type,
    });
  }
  return created ?? { ...t, id: Date.now() };
}

export async function updateExpenseApi(id: number, fields: Partial<Transaction>): Promise<void> {
  const existing = getCachedExpenses().find(e => e.id === id);
  if (!existing) throw new Error('Transaction not found');

  const merged = { ...existing, ...fields };
  await api.put(`/expenses/update/${id}`, {
    category_id: merged.category_id,
    amount: merged.amount,
    expense_date: merged.date,
    title: merged.title,
    note: formatNote(merged.title, merged.notes),
    transaction_type: merged.type,
  });
  await fetchExpenses();
}

export async function deleteExpenseApi(id: number): Promise<void> {
  await api.delete(`/expenses/delete/${id}`);
  await fetchExpenses();
}

export function getCurrentMonthPrefix(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getCurrentMonthDay(): string {
  return `${getCurrentMonthPrefix()}-01`;
}
