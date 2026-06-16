-- Add display metadata columns to categories (icon, color, bg)
ALTER TABLE categories
  ADD COLUMN icon VARCHAR(20) NOT NULL DEFAULT '📁' AFTER name,
  ADD COLUMN color VARCHAR(20) NOT NULL DEFAULT '#6B7280' AFTER icon,
  ADD COLUMN bg VARCHAR(20) NOT NULL DEFAULT '#F3F4F6' AFTER color;
