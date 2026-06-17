-- Migration to clean up placeholder folder icon for default categories
-- Sets icon to NULL for default categories where icon is the generic folder icon 📁
UPDATE categories
SET icon = NULL
WHERE name IN (
  'Food',
  'Shopping',
  'Travel',
  'Entertainment',
  'Bills',
  'Health',
  'Salary',
  'Freelance'
) AND icon = '📁';
