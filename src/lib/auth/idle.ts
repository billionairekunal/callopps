export const IDLE_KEY = "callopps:lastActivity";
export const idleExpired = (last: number, now: number, minutes: number) => now - last >= minutes * 60_000;
/** Newest of this tab's activity and the value shared by other tabs via localStorage. */
export const latestActivity = (local: number, shared: string | null) => Math.max(local, Number(shared) || 0);
