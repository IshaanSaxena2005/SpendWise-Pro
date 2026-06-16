import type { Transaction } from './store';

export type GrowthTrend = 'up' | 'down' | 'neutral';

export interface MonthTotals {
  income: number;
  expenses: number;
  balance: number;
}

export interface GrowthResult {
  display: string;
  trend: GrowthTrend;
  hasData: boolean;
}

/** Returns `YYYY-MM` for the given date (defaults to today). */
export function getYearMonth(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Returns `YYYY-MM` for the month before the given date. */
export function getPreviousYearMonth(date: Date = new Date()): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() - 1);
  return getYearMonth(d);
}

/** Sum income, expenses, and net balance for transactions in a given month. */
export function computeMonthTotals(
  transactions: Transaction[],
  yearMonth: string
): MonthTotals {
  let income = 0;
  let expenses = 0;

  transactions
    .filter(t => t.date.startsWith(yearMonth))
    .forEach(t => {
      if (t.type === 'income') income += t.amount;
      else expenses += t.amount;
    });

  return { income, expenses, balance: income - expenses };
}

/**
 * Month-over-month growth percentage.
 * Returns N/A or Insufficient data when comparison is not possible.
 */
export function computeGrowthPercent(current: number, previous: number): GrowthResult {
  if (current === 0 && previous === 0) {
    return { display: 'Insufficient data', trend: 'neutral', hasData: false };
  }
  if (previous === 0) {
    return { display: 'N/A', trend: 'neutral', hasData: false };
  }

  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct > 0 ? '+' : '';
  return {
    display: `${sign}${pct.toFixed(1)}%`,
    trend: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral',
    hasData: true,
  };
}

/** Map health API rating to display label. */
export function formatHealthRating(rating: string | null | undefined): string {
  if (!rating) return 'N/A';
  return rating;
}
