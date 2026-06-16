import type { Budget, Category } from './store';

export interface DashboardNotification {
  id: string;
  title: string;
  message: string;
  type: 'warning' | 'info' | 'success';
  unread: boolean;
}

/** Build notification items from budget utilization and health recommendations. */
export function buildDashboardNotifications(
  budgets: Budget[],
  categories: Category[],
  healthRecommendations: string[] = []
): DashboardNotification[] {
  const notifications: DashboardNotification[] = [];

  budgets
    .filter(b => b.monthly_limit > 0)
    .forEach(b => {
      const pct = (b.spent / b.monthly_limit) * 100;
      const cat = categories.find(c => c.id === b.category_id);
      const name = cat?.name ?? 'Category';

      if (pct >= 100) {
        notifications.push({
          id: `budget-over-${b.category_id}`,
          title: 'Budget Exceeded',
          message: `${name} is over budget at ${Math.round(pct)}% of its limit.`,
          type: 'warning',
          unread: true,
        });
      } else if (pct >= 85) {
        notifications.push({
          id: `budget-warn-${b.category_id}`,
          title: 'Budget Warning',
          message: `${name} is approaching ${Math.round(pct)}% of its limit.`,
          type: 'warning',
          unread: true,
        });
      }
    });

  healthRecommendations.slice(0, 2).forEach((text, idx) => {
    notifications.push({
      id: `health-rec-${idx}`,
      title: 'Financial Health Insight',
      message: text,
      type: 'info',
      unread: idx === 0,
    });
  });

  return notifications;
}
