export const MAX_FAILURES = 5;
export const WINDOW_MIN = 15;
type Attempt = { attempted_at: string; success: boolean };

/** Consecutive failures (newest first) inside the window, stopping at a success. 5 → locked until last failure + 15 min. */
export function evaluateLockout(attempts: Attempt[], now = new Date()): { locked: boolean; retryAt?: Date } {
  const cutoff = now.getTime() - WINDOW_MIN * 60_000;
  const sorted = [...attempts].sort((a, b) => b.attempted_at.localeCompare(a.attempted_at));
  const fails: number[] = [];
  for (const a of sorted) {
    const t = Date.parse(a.attempted_at);
    if (a.success || t < cutoff) break;
    fails.push(t);
  }
  if (fails.length < MAX_FAILURES) return { locked: false };
  return { locked: true, retryAt: new Date(fails[0] + WINDOW_MIN * 60_000) };
}
