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
  Food: 'bg-orange-100',
  Travel: 'bg-blue-100',
  Shopping: 'bg-pink-100',
  Bills: 'bg-yellow-100',
  Health: 'bg-red-100',
  Entertainment: 'bg-purple-100',
  Salary: 'bg-green-100',
  Freelance: 'bg-cyan-100',
};

/**
 * Returns the background class for a given category name.
 * Falls back to a neutral background if the category is unknown.
 */
export function getCategoryBg(name?: string): string {
  if (!name) return 'bg-gray-100';
  return CATEGORY_BG_CLASSES[name] || 'bg-gray-100';
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
