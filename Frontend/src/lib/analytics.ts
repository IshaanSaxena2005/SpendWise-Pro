/**
 * Google Analytics 4 (GA4) Utility
 * Exposes helper functions for page tracking and custom events.
 * 
 * Target measurement ID: G-SM3XPWY3NL
 */

// Define interface for window.gtag
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

/**
 * Tracks a page view in Google Analytics.
 * @param path The relative URL path (e.g. '/dashboard')
 */
export function trackPageView(path: string) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'page_view', {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  }
}

/**
 * Tracks a custom event in Google Analytics.
 * @param eventName The event identifier name
 * @param parameters Key-value parameters associated with the event
 */
export function trackEvent(eventName: string, parameters?: Record<string, any>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, parameters);
  }
}
