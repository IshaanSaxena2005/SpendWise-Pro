/**
 * Date formatting utilities
 * All user-facing dates should use these functions for consistency
 */

/**
 * Format date to dd-MM-yyyy format
 * @param dateString - Date string in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
 * @returns Formatted date string in dd-MM-yyyy format
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}-${month}-${year}`;
}

/**
 * Format date to YYYY-MM-DD format for date inputs
 * @param dateString - Date string in ISO format
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateForInput(dateString: string | null | undefined): string {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  
  return date.toISOString().split('T')[0];
}

/**
 * Get current date in YYYY-MM-DD format for date inputs
 * @returns Current date in YYYY-MM-DD format
 */
export function getCurrentDateForInput(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get current month in YYYY-MM-01 format for budget inputs
 * @returns Current month in YYYY-MM-01 format
 */
export function getCurrentMonthForInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}
