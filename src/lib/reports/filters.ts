const IST = 330 * 60_000;
const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PRESETS = { today: "Today", yesterday: "Yesterday", this_week: "This week", this_month: "This Month", last_month: "Last month", custom: "Custom" } as const;
export type Preset = keyof typeof PRESETS;
export const STATUS_VALUES = ["new", "in_progress", "won", "lost"] as const;
export const LIST_KEYS = ["processes", "categories", "products", "tls", "agents", "lead_types", "dispositions", "sources", "b_processes", "b_dispositions"] as const;
type ListKey = (typeof LIST_KEYS)[number];

export type ReportFilters = { preset: Preset; from?: string; to?: string; statuses: string[]; agent_status?: "active" | "deactivated"; city?: string }
  & Record<ListKey, string[]>;

/** Midnight IST of the IST calendar day containing `t`, as epoch ms. */
const istMidnight = (t: number) => { const d = new Date(t + IST); d.setUTCHours(0, 0, 0, 0); return d.getTime() - IST; };
const istDate = (t: number) => new Date(t + IST).toISOString().slice(0, 10);
const fromDate = (ymd: string) => /^\d{4}-\d{2}-\d{2}$/.test(ymd) && !isNaN(Date.parse(ymd)) ? Date.parse(ymd + "T00:00:00Z") - IST : NaN;
const monthStart = (t: number, add = 0) => { const d = new Date(t + IST); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + add, 1) - IST; };

/** The date range a preset means, in India time; `to` is exclusive. */
export function rangeFor(f: Pick<ReportFilters, "preset" | "from" | "to">, now = new Date()): { from: string; to: string; label: string } {
  const n = now.getTime(), today = istMidnight(n);
  const out = (a: number, b: number, name: string) => ({
    from: new Date(a).toISOString(), to: new Date(b).toISOString(),
    label: `${name} (${istDate(a)}${b - a > DAY ? ` to ${istDate(b - 1)}` : ""})`,
  });
  switch (f.preset) {
    case "today": return out(today, today + DAY, "Today");
    case "yesterday": return out(today - DAY, today, "Yesterday");
    case "this_week": { const dow = (new Date(today + IST).getUTCDay() + 6) % 7; return out(today - dow * DAY, today + DAY, "This week"); }
    case "last_month": return out(monthStart(n, -1), monthStart(n), "Last month");
    case "custom": {
      const a = fromDate(f.from ?? ""), b = fromDate(f.to ?? f.from ?? "");
      if (!isNaN(a) && !isNaN(b) && b >= a && b - a <= 366 * DAY) return out(a, b + DAY, "Custom");
    }
    // fall through: a bad custom range shows this month
    default: return out(monthStart(n), monthStart(n, 1), "This Month");
  }
}

export function parseFilters(sp: Record<string, string | string[] | undefined>): ReportFilters {
  const one = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v)?.trim() || undefined; };
  // A URL gives "a,b"; a saved report (JSON) gives ["a","b"]. Accept both.
  const many = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v : (v ?? "").split(",")).map((x) => String(x).trim()).filter(Boolean); };
  const list = (k: string) => many(k).filter((x) => UUID.test(x));
  const preset = (one("preset") ?? "this_month") as Preset;
  const f = {
    preset: preset in PRESETS ? preset : "this_month",
    statuses: many("statuses").filter((s) => (STATUS_VALUES as readonly string[]).includes(s)),
    ...Object.fromEntries(LIST_KEYS.map((k) => [k, list(k)])),
  } as ReportFilters;
  if (f.preset === "custom") { f.from = one("from"); f.to = one("to"); }
  const as = one("agent_status");
  if (as === "active" || as === "deactivated") f.agent_status = as;
  const city = one("city");
  if (city) f.city = city.slice(0, 80);
  return f;
}

export function filterQuery(f: ReportFilters): string {
  const q = new URLSearchParams();
  if (f.preset !== "this_month") q.set("preset", f.preset);
  if (f.preset === "custom") { if (f.from) q.set("from", f.from); if (f.to) q.set("to", f.to); }
  for (const k of LIST_KEYS) if (f[k].length) q.set(k, f[k].join(","));
  if (f.statuses.length) q.set("statuses", f.statuses.join(","));
  if (f.agent_status) q.set("agent_status", f.agent_status);
  if (f.city) q.set("city", f.city);
  return q.toString();
}

/** Sum of monthly targets, each scaled by the share of its month that falls inside [from, to). */
export function prorate(targets: { month: string; value: number }[], from: string, to: string): number {
  const a = Date.parse(from), b = Date.parse(to);
  let sum = 0;
  for (const t of targets) {
    const m0 = Date.parse(t.month + "T00:00:00Z") - IST, m1 = monthStart(m0 + DAY, 1);
    const overlap = Math.max(0, Math.min(b, m1) - Math.max(a, m0));
    sum += (t.value * overlap) / (m1 - m0);
  }
  return Math.round(sum);
}
