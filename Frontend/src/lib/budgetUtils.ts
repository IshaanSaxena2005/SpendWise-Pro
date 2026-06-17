import type { Budget, Transaction } from './api';

/** Normalize any date/month string to YYYY-MM-01 for budget API + date inputs. */
export function normalizeBudgetMonth(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const isoPrefix = trimmed.match(/^(\d{4})-(\d{2})/);
  if (isoPrefix) {
    return `${isoPrefix[1]}-${isoPrefix[2]}-01`;
  }

  const dmy = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]}-01`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  }

  return trimmed;
}

/** Coerce API/MySQL values (string | null | undefined) to a finite number. */
export function toAmount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function formatBudgetCurrency(value: unknown): string {
  return `₹${Math.floor(toAmount(value)).toLocaleString('en-IN')}`;
}

/** Extract YYYY-MM from any budget/expense date string. */
export function budgetMonthKey(month: unknown): string {
  if (month === null || month === undefined) return '';
  const str = String(month).trim();
  const match = str.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

export function isOverallBudget(budget: Budget): boolean {
  return budget.category_id === null || budget.category_id === undefined;
}

export function getBudgetBarColor(percent: number): string {
  if (percent >= 80) return 'bg-red-500';
  if (percent >= 50) return 'bg-orange-500';
  return 'bg-green-500';
}

export function getBudgetBarColorHex(percent: number): string {
  if (percent >= 80) return '#EF4444';
  if (percent >= 50) return '#F97316';
  return '#22C55E';
}

export function getBudgetStatus(percent: number): {
  label: string;
  badgeClass: string;
} {
  if (percent >= 80) {
    return { label: 'CRITICAL', badgeClass: 'bg-rose-50 text-rose-600' };
  }
  if (percent >= 50) {
    return { label: 'WARNING', badgeClass: 'bg-orange-50 text-orange-600' };
  }
  return { label: 'ON TRACK', badgeClass: 'bg-emerald-50 text-emerald-600' };
}

/**
 * Spending for a single budget row.
 * - Category budget: expenses in the same month for that category.
 * - Overall budget (no category_id): all expenses in that month.
 */
export function computeBudgetSpent(budget: Budget, expenses: Transaction[]): number {
  const monthKey = budgetMonthKey(budget.month);
  if (!monthKey) return 0;

  return expenses
    .filter((expense) => {
      if (budgetMonthKey(expense.expense_date) !== monthKey) return false;
      if (budget.category_id) {
        return expense.category_id === budget.category_id;
      }
      return true;
    })
    .reduce((sum, expense) => sum + toAmount(expense.amount), 0);
}

export function computeTotalExpensesInMonth(
  expenses: Transaction[],
  monthKey: string
): number {
  if (!monthKey) return 0;

  return expenses
    .filter((expense) => budgetMonthKey(expense.expense_date) === monthKey)
    .reduce((sum, expense) => sum + toAmount(expense.amount), 0);
}

export interface BudgetSummaryMetrics {
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  safeToSpend: number;
  utilizationPct: number;
  rawUtilizationPct: number;
  usesOverallBudget: boolean;
}

/**
 * Summary totals for the budgets page.
 * - When an overall budget exists: cap = overall limit(s) only; spent = all expenses in those months.
 * - Otherwise: cap = sum of category limits; spent = sum of per-category spending.
 */
export function computeBudgetSummary(
  budgets: Budget[],
  expenses: Transaction[]
): BudgetSummaryMetrics {
  const overallBudgets = budgets.filter(isOverallBudget);
  const categoryBudgets = budgets.filter((budget) => !isOverallBudget(budget));
  const usesOverallBudget = overallBudgets.length > 0;

  const totalBudget = usesOverallBudget
    ? overallBudgets.reduce(
        (sum, budget) => sum + toAmount(budget.amount_limit),
        0
      )
    : categoryBudgets.reduce(
        (sum, budget) => sum + toAmount(budget.amount_limit),
        0
      );

  const totalSpent = usesOverallBudget
    ? [...new Set(
        overallBudgets
          .map((budget) => budgetMonthKey(budget.month))
          .filter((monthKey) => monthKey.length > 0)
      )].reduce(
        (sum, monthKey) => sum + computeTotalExpensesInMonth(expenses, monthKey),
        0
      )
    : categoryBudgets.reduce(
        (sum, budget) => sum + computeBudgetSpent(budget, expenses),
        0
      );

  const remaining = totalBudget - totalSpent;
  const safeToSpend = Math.max(remaining, 0);
  const rawUtilizationPct =
    totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const utilizationPct = Math.min(rawUtilizationPct, 100);

  return {
    totalBudget,
    totalSpent,
    remaining,
    safeToSpend,
    utilizationPct,
    rawUtilizationPct,
    usesOverallBudget,
  };
}

export function computeBudgetUtilization(
  budget: Budget,
  expenses: Transaction[]
): {
  spent: number;
  limit: number;
  pct: number;
  rawPct: number;
  isOver: boolean;
  remaining: number;
} {
  const limit = toAmount(budget.amount_limit);
  const spent = computeBudgetSpent(budget, expenses);
  const rawPct = limit > 0 ? (spent / limit) * 100 : 0;
  const pct = Math.min(rawPct, 100);
  const isOver = spent > limit;
  const remaining = limit - spent;

  return { spent, limit, pct, rawPct, isOver, remaining };
}

export type BudgetAlertSeverity = 'warning' | 'critical' | 'over';

export interface BudgetAlert {
  budgetId: number;
  label: string;
  severity: BudgetAlertSeverity;
  message: string;
  emoji: string;
  rawPct: number;
}

export function getBudgetLabel(
  budget: Budget,
  categories: { id: number; name: string }[]
): string {
  if (isOverallBudget(budget)) return 'Overall';
  const cat = categories.find((c) => c.id === budget.category_id);
  return cat?.name || budget.category_name || 'Budget';
}

const ALERT_SEVERITY_ORDER: Record<BudgetAlertSeverity, number> = {
  over: 0,
  critical: 1,
  warning: 2,
};

/**
 * Build budget alerts from the same utilization math as budget cards.
 * Ignores budgets with limit <= 0.
 */
export function computeBudgetAlerts(
  budgets: Budget[],
  expenses: Transaction[],
  categories: { id: number; name: string }[]
): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];

  for (const budget of budgets) {
    const utilization = computeBudgetUtilization(budget, expenses);
    const { limit, rawPct, isOver, spent } = utilization;
    if (limit <= 0) continue;

    const label = getBudgetLabel(budget, categories);

    if (isOver) {
      alerts.push({
        budgetId: budget.id,
        label,
        severity: 'over',
        emoji: '🔴',
        message: `${label} budget exceeded by ${formatBudgetCurrency(spent - limit)} (${Math.round(rawPct)}% used)`,
        rawPct,
      });
    } else if (rawPct >= 80) {
      alerts.push({
        budgetId: budget.id,
        label,
        severity: 'critical',
        emoji: '🔴',
        message: `${label} budget at ${Math.round(rawPct)}% usage`,
        rawPct,
      });
    } else if (rawPct >= 50) {
      alerts.push({
        budgetId: budget.id,
        label,
        severity: 'warning',
        emoji: '🟠',
        message: `${label} budget at ${Math.round(rawPct)}% usage`,
        rawPct,
      });
    }
  }

  return alerts.sort(
    (a, b) =>
      ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity] ||
      b.rawPct - a.rawPct
  );
}
