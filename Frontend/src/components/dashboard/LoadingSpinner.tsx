/**
 * Shared dashboard loading spinner — the exact purple circular treatment used on
 * the History page (`animate-spin` + violet border, two-arc style).
 *
 * Renders a `role="status"` region; the visible spinner is decorative and the
 * optional `label` is announced to screen readers via `sr-only` text.
 *
 * Layout stays with the caller: pass `className` for the wrapper
 * (e.g. `min-h-screen` for full-page states, `p-6` for card/dropdown states)
 * and `sizeClass` for the circle (pages: `h-12 w-12`, cards/dropdowns: smaller).
 */
interface LoadingSpinnerProps {
  /** Screen-reader-only loading description, e.g. "Loading budgets". */
  label?: string;
  /** Tailwind size classes for the spinner circle (default: History page's h-12 w-12). */
  sizeClass?: string;
  /** Extra wrapper classes — centering is built in (e.g. `min-h-screen`, `p-6`). */
  className?: string;
}

export function LoadingSpinner({ label, sizeClass = 'h-12 w-12', className = '' }: LoadingSpinnerProps) {
  return (
    <div role="status" aria-live="polite" className={`flex items-center justify-center ${className}`}>
      <div
        aria-hidden="true"
        className={`animate-spin rounded-full border-t-2 border-b-2 border-violet-600 ${sizeClass}`}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}
