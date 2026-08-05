import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';

// Normalize the base URL so it always ends with exactly one `/api`,
// regardless of whether VITE_API_BASE_URL includes it. This prevents both
// a missing-`/api` 404 and a doubled `/api/api` path.
const rawBaseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const baseURL = rawBaseURL.replace(/\/+$/, '').replace(/\/api$/, '') + '/api';

const api = axios.create({
  baseURL,
});

// Interceptor: attach JWT token from localStorage on every request
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.data instanceof FormData && config.headers) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ──────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────

export interface Transaction {
  id: number;
  user_id: number;
  category_id: number;
  category_name?: string;
  amount: number;
  expense_date: string;
  note?: string;
  is_recurring?: boolean;
  recurring_transaction_id?: number | null;
  goal_id?: number | null;
  goal_title?: string | null;
  created_at: string;
  updated_at: string;
  category?: Category;
}

export interface Category {
  id: number;
  user_id: number;
  name: string;
  icon?: string;
  color?: string;
  created_at: string;
}

export interface Budget {
  id: number;
  user_id: number;
  category_id?: number | null;
  category_name?: string;
  month: string;
  amount_limit: number;
  created_at: string;
  updated_at: string;
  category?: Category;
}

export interface Goal {
  id: number;
  user_id: number;
  name: string;
  title?: string;
  icon?: string;
  category?: string;
  target_amount: number;
  saved_amount: number;
  current_amount?: number;
  progress_percentage?: number;
  monthly_contribution: number;
  target_date: string;
  priority: 'High' | 'Medium' | 'Low';
  notes?: string;
  is_completed: boolean;
  status?: 'Active' | 'Completed' | 'Overdue';
  ai_insights?: {
    estimated_completion_date: string;
    amount_needed_per_month: number;
    probability_of_completion: 'High' | 'Medium' | 'Low';
    suggestions: string[];
  };
  created_at: string;
  updated_at: string;
}

export interface DashboardSummary {
  total_spending: number;
  total_expenses: number;
  current_month_spending: number;
  current_month_expenses: number;
  monthly_budget?: number | null;
  budget_remaining?: number | null;
}

export interface CategoryBreakdownItem {
  category_id: number;
  category_name: string;
  total_amount: number;
  percentage: number;
}

export interface MonthlyTrendItem {
  month: string;
  total_amount: number;
}

export interface HealthFactorDetail {
  score: number;
  maxScore: number;
  detail: string;
}

export interface HealthFactors {
  budgetAdherence: HealthFactorDetail;
  spendingConsistency: HealthFactorDetail;
  categoryBalance: HealthFactorDetail;
  expenseActivity: HealthFactorDetail;
}

export interface HealthScore {
  score: number;
  rating: string;
  factors: HealthFactors;
  recommendations: string[];
}

export interface Forecast {
  spending_history?: number[];
  predicted_spending?: number;
  trend_direction?: string;
  mae?: number;
  rmse?: number;
  r2_score?: number;
  message?: string;
  confidence?: number;
  is_low_confidence?: boolean;
}

export interface Prediction {
  budget_id: number;
  will_exceed: boolean;
  confidence: number;
  predicted_spent: number;
}

export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  description: string;
  read: boolean;
  created_at: string;
  category_name?: string;
  category_id?: number;
}

export interface Anomaly {
  id: number;
  title: string;
  description: string;
  created_at: string;
  category_name?: string;
  category_id?: number;
  amount?: number;
  anomaly_score?: number;
}

// ──────────────────────────────────────────────────────
// API Methods
// ──────────────────────────────────────────────────────

export const expenseAPI = {
  getAllExpenses: () => api.get<{ success: boolean; expenses: Transaction[] }>('/expenses/all'),
  addExpense: (data: { category_id: number; amount: number; expense_date: string; note?: string; title?: string; is_recurring?: boolean; recurring_transaction_id?: number | null; goal_id?: number | null }) =>
    api.post<{ success: boolean; message?: string; is_anomaly?: boolean }>('/expenses/add', data),
  updateExpense: (id: number, data: Partial<{ amount: number; category_id: number; expense_date: string; note?: string; title?: string; goal_id?: number | null }>) =>
    api.put<{ success: boolean; message?: string }>(`/expenses/update/${id}`, data),
  deleteExpense: (id: number) => api.delete<{ success: boolean; message?: string }>(`/expenses/delete/${id}`),
};

export const categoryAPI = {
  getAllCategories: () => api.get<{ success: boolean; categories: Category[] }>('/categories/all'),
  addCategory: (data: { name: string; icon?: string; color?: string }) =>
    api.post<{ success: boolean; message?: string; category: Category }>('/categories/add', data),
  updateCategory: (id: number, data: Partial<{ name: string; icon?: string; color?: string }>) =>
    api.put<{ success: boolean; message?: string }>(`/categories/update/${id}`, data),
  deleteCategory: (id: number) => api.delete<{ success: boolean; message?: string }>(`/categories/delete/${id}`),
};

export const budgetAPI = {
  getAllBudgets: () => api.get<{ success: boolean; budgets: Budget[] }>('/budgets/all'),
  addBudget: (data: { category_id?: number; month: string; amount_limit: number }) =>
    api.post<{ success: boolean; message?: string }>('/budgets/add', data),
  updateBudget: (id: number, data: Partial<{ category_id?: number; month: string; amount_limit: number }>) =>
    api.put<{ success: boolean; message?: string }>(`/budgets/update/${id}`, data),
  deleteBudget: (id: number) => api.delete<{ success: boolean; message?: string }>(`/budgets/delete/${id}`),
};

export const analyticsAPI = {
  getDashboardSummary: () => api.get<{ success: boolean; summary: DashboardSummary }>('/analytics/dashboard-summary'),
  getCategoryBreakdown: () => api.get<{ success: boolean; labels: string[]; values: number[]; breakdown: CategoryBreakdownItem[] }>('/analytics/category-breakdown'),
  getMonthlyTrend: () => api.get<{ success: boolean; labels: string[]; values: number[]; trend: MonthlyTrendItem[] }>('/analytics/monthly-trend'),
  getFinancialHistory: () => api.get<{
    success: boolean;
    expenses: {
      id: number;
      category_id: number;
      category_name: string;
      amount: number;
      expense_date: string;
      note?: string;
    }[];
    budgets: {
      id: number;
      month: string;
      amount_limit: number;
    }[];
  }>('/analytics/financial-history'),
};

export const healthAPI = {
  getHealthScore: () => api.get<{ success: boolean; score: number; rating: string; factors: HealthFactors; recommendations: string[] }>('/health/score'),
};

export const forecastAPI = {
  getForecast: () => api.get<{ success: boolean; spending_history?: number[]; predicted_spending?: number; trend_direction?: string; mae?: number; rmse?: number; r2_score?: number; message?: string }>('/forecast'),
};

export const predictionAPI = {
  getBudgetBreachPrediction: () => api.get<{ success: boolean; data: Prediction[] }>('/predictions/budget-breach'),
};

export const notificationAPI = {
  getAll: () => api.get<{ success: boolean; data: Notification[] }>('/notifications'),
  markRead: (id: number) => api.put<{ success: boolean }>(`/notifications/${id}/read`),
  markAllRead: () => api.put<{ success: boolean }>('/notifications/read-all'),
};

export const anomalyAPI = {
  getAnomalyHistory: () => api.get<{ success: boolean; anomalies: Anomaly[] }>('/anomaly/check'),
};

export interface CategorizeResponse {
  success: boolean;
  category: string | null;
  confidence: number;
  source: 'learning' | 'keyword' | 'embedding' | 'ai' | null;
  matched_text?: string | null;
  matchedKeyword?: string;
}

export const aiAPI = {
  chat: (query: string) => api.post<{ success: boolean; response: string }>('/ai/chat', { query }),
  categorize: (description: string) =>
    api.post<CategorizeResponse>('/ai/categorize', { description }),
};

export const recurringAPI = {
  getAll: () => api.get<{ success: boolean; recurring_transactions: any[] }>('/recurring'),
  add: (data: { type: 'income' | 'expense'; amount: number; category_id?: number; note?: string; frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'; start_date: string; end_date?: string; never_ends: boolean }) =>
    api.post<{ success: boolean; message?: string; id?: number }>('/recurring', data),
  update: (id: number, data: Partial<{ amount: number; category_id?: number; note?: string; frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly'; start_date?: string; end_date?: string; never_ends?: boolean; is_active?: boolean }>) =>
    api.put<{ success: boolean; message?: string }>(`/recurring/${id}`, data),
  delete: (id: number) => api.delete<{ success: boolean; message?: string }>(`/recurring/${id}`),
  pause: (id: number) => api.patch<{ success: boolean; message?: string }>(`/recurring/${id}/pause`),
  resume: (id: number) => api.patch<{ success: boolean; message?: string }>(`/recurring/${id}/resume`),
  getSummary: () => api.get<{ success: boolean; summary: any }>('/recurring/summary'),
  getHistory: (id: number) => api.get<{ success: boolean; history: any[] }>(`/recurring/${id}/history`),
};

export const goalsAPI = {
  getAll: () => api.get<{ success: boolean; goals: Goal[] }>('/goals/all'),
  add: (data: {
    name: string;
    icon?: string;
    category?: string;
    target_amount: number;
    saved_amount?: number;
    monthly_contribution?: number;
    target_date: string;
    priority?: 'High' | 'Medium' | 'Low';
    notes?: string;
  }) => api.post<{ success: boolean; message?: string; id?: number }>('/goals/add', data),
  update: (id: number, data: Partial<{
    name: string;
    icon: string;
    category: string;
    target_amount: number;
    saved_amount: number;
    monthly_contribution: number;
    target_date: string;
    priority: 'High' | 'Medium' | 'Low';
    notes: string;
    is_completed: boolean;
  }>) => api.put<{ success: boolean; message?: string }>(`/goals/update/${id}`, data),
  delete: (id: number) => api.delete<{ success: boolean; message?: string }>(`/goals/delete/${id}`),
};

export const getUser = () => {
  const token = localStorage.getItem('token');
  if (!token) return { full_name: 'User', email: '', role: 'User' };
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      full_name: payload.full_name || 'User',
      email: payload.email || '',
      role: payload.role || 'User',
      user_id: payload.user_id,
    };
  } catch {
    return { full_name: 'User', email: '', role: 'User' };
  }
};

export const userAPI = {
  getAvatar: () => api.get('/user/avatar'),
  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return api.post<{ success: boolean; data: { file_path: string } }>('/user/avatar', formData);
  },
  deleteAvatar: () => api.delete('/user/avatar'),
};

export default api;
