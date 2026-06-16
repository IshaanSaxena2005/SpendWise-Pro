import { useEffect, useState } from 'react';
import api from './api';
import { type Category, setCategories, getCategories } from './store';

export const CATEGORIES_UPDATED_EVENT = 'spendwise-categories-updated';

export const CATEGORY_COLOR_OPTIONS = [
  { color: '#F59E0B', bg: '#FEF3C7' },
  { color: '#7C3AED', bg: '#EDE9FE' },
  { color: '#EC4899', bg: '#FCE7F3' },
  { color: '#3B82F6', bg: '#DBEAFE' },
  { color: '#10B981', bg: '#D1FAE5' },
  { color: '#F97316', bg: '#FFEDD5' },
  { color: '#059669', bg: '#D1FAE5' },
  { color: '#8B5CF6', bg: '#EDE9FE' },
  { color: '#6B7280', bg: '#F3F4F6' },
  { color: '#EF4444', bg: '#FEE2E2' },
];

export const CATEGORY_EMOJI_OPTIONS = [
  '🍔', '🚕', '🛍️', '💡', '💊', '🎬', '💼', '💻',
  '🏠', '📚', '✈️', '🎁', '🐾', '⚽', '📁', '🍕',
  '☕', '🎮', '💳', '🏋️',
];

const DEFAULT_CATEGORY_TEMPLATES: Omit<Category, 'id'>[] = [
  { name: 'Food',          icon: '🍔', color: '#F59E0B', bg: '#FEF3C7' },
  { name: 'Travel',        icon: '🚕', color: '#7C3AED', bg: '#EDE9FE' },
  { name: 'Shopping',      icon: '🛍️', color: '#EC4899', bg: '#FCE7F3' },
  { name: 'Bills',         icon: '💡', color: '#3B82F6', bg: '#DBEAFE' },
  { name: 'Health',        icon: '💊', color: '#10B981', bg: '#D1FAE5' },
  { name: 'Entertainment', icon: '🎬', color: '#F97316', bg: '#FFEDD5' },
  { name: 'Salary',        icon: '💼', color: '#059669', bg: '#D1FAE5' },
  { name: 'Freelance',     icon: '💻', color: '#8B5CF6', bg: '#EDE9FE' },
];

interface ApiCategory {
  id: number;
  name: string;
  icon?: string;
  color?: string;
  bg?: string;
}

function mapApiCategory(c: ApiCategory): Category {
  return {
    id: c.id,
    name: c.name,
    icon: c.icon || '📁',
    color: c.color || '#6B7280',
    bg: c.bg || '#F3F4F6',
  };
}

export function emitCategoriesUpdated() {
  window.dispatchEvent(new CustomEvent(CATEGORIES_UPDATED_EVENT));
}

export function useCategories(): Category[] {
  const [categories, setLocal] = useState<Category[]>(getCategories);

  useEffect(() => {
    const sync = () => setLocal(getCategories());
    window.addEventListener(CATEGORIES_UPDATED_EVENT, sync);
    return () => window.removeEventListener(CATEGORIES_UPDATED_EVENT, sync);
  }, []);

  return categories;
}

export async function fetchAndSyncCategories(): Promise<Category[]> {
  const token = localStorage.getItem('token');
  if (!token) return getCategories();

  const response = await api.get('/categories/all');
  let apiCategories: ApiCategory[] = response.data?.categories ?? [];

  if (apiCategories.length === 0) {
    await Promise.all(
      DEFAULT_CATEGORY_TEMPLATES.map(t => api.post('/categories/add', t))
    );
    const seeded = await api.get('/categories/all');
    apiCategories = seeded.data?.categories ?? [];
  }

  const mapped = apiCategories.map(mapApiCategory);
  setCategories(mapped);
  emitCategoriesUpdated();
  return mapped;
}

export async function createCategoryApi(data: {
  name: string;
  icon: string;
  color: string;
  bg?: string;
}): Promise<Category> {
  const colorOption = CATEGORY_COLOR_OPTIONS.find(o => o.color === data.color);
  const payload = {
    name: data.name.trim(),
    icon: data.icon,
    color: data.color,
    bg: data.bg ?? colorOption?.bg ?? '#F3F4F6',
  };

  const response = await api.post('/categories/add', payload);
  const created = mapApiCategory(response.data.category);

  const current = getCategories();
  setCategories([...current, created].sort((a, b) => a.name.localeCompare(b.name)));
  emitCategoriesUpdated();
  return created;
}

export async function updateCategoryApi(
  id: number,
  data: { name: string; icon: string; color: string; bg?: string }
): Promise<Category> {
  const colorOption = CATEGORY_COLOR_OPTIONS.find(o => o.color === data.color);
  const payload = {
    name: data.name.trim(),
    icon: data.icon,
    color: data.color,
    bg: data.bg ?? colorOption?.bg ?? '#F3F4F6',
  };

  const response = await api.put(`/categories/update/${id}`, payload);
  const updated = mapApiCategory(response.data.category);

  const current = getCategories().map(c => (c.id === id ? updated : c));
  setCategories(current.sort((a, b) => a.name.localeCompare(b.name)));
  emitCategoriesUpdated();
  return updated;
}

export async function deleteCategoryApi(id: number): Promise<void> {
  await api.delete(`/categories/delete/${id}`);
  setCategories(getCategories().filter(c => c.id !== id));
  emitCategoriesUpdated();
}
