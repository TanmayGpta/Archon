/** The user asked the OS for less motion: skip intros, settle layouts instantly, no ambient movement. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
