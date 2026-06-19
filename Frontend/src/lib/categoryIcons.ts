export const DEFAULT_CATEGORY_ICONS: Record<string, string> = {
  Food: '🍔',
  Travel: '🚕',
  Shopping: '🛍️',
  Bills: '💡',
  Health: '💊',
  Entertainment: '🎬',
  Salary: '💼',
  Freelance: '💻',
};

// Backward‑compatible alias – some legacy code may still import CATEGORY_ICONS
export const CATEGORY_ICONS = DEFAULT_CATEGORY_ICONS;

export const CATEGORY_EMOJI_OPTIONS = [
  '🍔', '🚕', '🛍️', '💡', '💊', '🎬', '💼', '💻',
  '💰', '🏠', '✈️', '🎁', '📚', '☕', '🐾', '🎮',
  '🚗', '👕', '💳', '📱', '🍕', '🏋️', '🎵', '🌿',
] as const;

// Map category names to soft background colors for UI circles
export const CATEGORY_BG_CLASSES: Record<string, string> = {
  Food: 'bg-yellow-100',
  Travel: 'bg-purple-100',
  Shopping: 'bg-pink-100',
  Bills: 'bg-blue-100',
  Health: 'bg-red-100',
  Entertainment: 'bg-indigo-100',
  Salary: 'bg-emerald-100',
  Freelance: 'bg-teal-100',
  Petrol: 'bg-orange-100',
};

/**
 * Returns the background class for a given category name.
 * Falls back to a neutral background if the category is unknown.
 */
export function getCategoryBg(name?: string): string {
  if (!name) return 'bg-gray-100';
  return CATEGORY_BG_CLASSES[name] || 'bg-gray-100';
}

export const CATEGORY_BADGE_CLASSES: Record<string, string> = {
  Food: 'bg-yellow-100 text-yellow-800',
  Travel: 'bg-purple-100 text-purple-800',
  Shopping: 'bg-pink-100 text-pink-800',
  Bills: 'bg-blue-100 text-blue-800',
  Health: 'bg-red-100 text-red-800',
  Entertainment: 'bg-indigo-100 text-indigo-800',
  Salary: 'bg-green-100 text-green-800',
  Freelance: 'bg-teal-100 text-teal-800',
  Petrol: 'bg-orange-100 text-orange-800',
};

export function getCategoryBadgeClasses(name?: string): string {
  if (!name) return 'bg-gray-100 text-gray-800';
  return CATEGORY_BADGE_CLASSES[name] || 'bg-gray-100 text-gray-800';
}

type CategoryLike = { name: string; icon?: string | null };

export function getCategoryIcon(category: CategoryLike | string | null | undefined): string {
  if (!category) return '💰';
  // If a plain string (category name) is provided, use default mapping directly
  if (typeof category === 'string') {
    return DEFAULT_CATEGORY_ICONS[category] || '💰';
  }
  // Default categories have priority over stored icons
  const defaultIcon = DEFAULT_CATEGORY_ICONS[category.name];
  if (defaultIcon) return defaultIcon;
  // Use custom icon unless it is the placeholder folder icon
  const custom = category.icon?.trim();
  if (custom && custom !== '📁') return custom;
  return '💰';
}

export function formatCategoryLabel(category: CategoryLike | string | null | undefined): string {
  if (!category) return '💰 Unknown';
  const name = typeof category === 'string' ? category : category.name;
  return `${getCategoryIcon(category)} ${name}`;
}
