const IST = 330 * 60_000; // India has no DST

/** Today's bounds in India time, as UTC ISO strings. */
export function istDay(now = new Date()) {
  const d = new Date(now.getTime() + IST);
  d.setUTCHours(0, 0, 0, 0);
  const start = d.getTime() - IST;
  return { start: new Date(start).toISOString(), end: new Date(start + 86_400_000).toISOString() };
}

export function dueBucket(at: string, now = new Date()): "overdue" | "today" | "upcoming" {
  const t = new Date(at).getTime();
  if (t < now.getTime()) return "overdue";
  return t < new Date(istDay(now).end).getTime() ? "today" : "upcoming";
}

/** Duration hint for the outcome sheet: time spent away from the app on the call. */
export const awaySeconds = (hiddenAt: number | null, backAt: number) =>
  hiddenAt == null || backAt < hiddenAt ? null : Math.round((backAt - hiddenAt) / 1000);

const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const time = new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" });
export const fmtDateTime = (iso: string) => fmt.format(new Date(iso));
export const fmtTime = (iso: string) => time.format(new Date(iso));
