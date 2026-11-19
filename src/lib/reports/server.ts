import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Session } from "@/lib/auth/roles";
import { istDay } from "@/lib/calls/time";
import { rangeFor, prorate, type ReportFilters } from "./filters";
import { METRICS, type Group, type Metric } from "./build";

/** Whose data a user may report on: super admin and admin the whole org, a TL their team, a caller themself. */
export async function reportScope(s: Session): Promise<string[] | null> {
  if (s.role === "super_admin" || s.role === "admin") return null;
  if (s.role === "caller" || !s.teamId) return [s.userId];
  const { data } = await createAdminClient().from("profiles").select("user_id").eq("org_id", s.orgId).eq("team_id", s.teamId);
  return [...new Set([s.userId, ...(data ?? []).map((p) => p.user_id)])];
}

export type AgentRow = { id: string; name: string; tl: string | null; status: string; calls: number; connected: number; lost: number; seconds: number } & Record<Metric, number>;
export type RawReport = {
  kpis: { total: number; in_progress: number; won: number; lost: number; overdue: number; due_today: number; active_agents: number; followups: number; attendance: number; calls: number; connected: number };
  daily: { day: string; followups: number; wins: number; calls: number }[];
  groups: Group[];
  dispositions: { id: string; count: number }[];
  agents: AgentRow[];
  attendance: { user_id: string; day: string; punch_in: string; punch_out: string | null; last_activity: string; seconds: number; status: "active" | "logged_out" | "auto" }[];
  hours: { seconds: number; active_now: number; first_login: string | null; last_activity: string | null };
  lead_ids?: string[] | null;
};

export async function runReport(s: Session, f: ReportFilters, withIds = false) {
  const svc = createAdminClient();
  const range = rangeFor(f);
  const { data, error } = await svc.rpc("report_data", { f: {
    ...f, org: s.orgId, from: range.from, to: range.to, now_end: istDay().end, scope: await reportScope(s), with_ids: withIds,
  } });
  if (error) { console.error("report_data", error.message); throw new Error("Could not build the report. Try again."); }
  const raw = data as RawReport;

  const months = [...new Set(raw.daily.map((d) => d.day.slice(0, 7) + "-01"))];
  const { data: t } = raw.agents.length && months.length
    ? await svc.from("targets").select("user_id, month, metric, value").eq("org_id", s.orgId).in("month", months).in("user_id", raw.agents.map((a) => a.id))
    : { data: [] };
  const targets: Record<string, Partial<Record<Metric, number>>> = {};
  for (const a of raw.agents) for (const [m] of METRICS) {
    const rows = (t ?? []).filter((x) => x.user_id === a.id && x.metric === m);
    if (rows.length) (targets[a.id] ??= {})[m] = prorate(rows, range.from, range.to);
  }
  return { raw, range, targets, labels: await labelsFor(s.orgId) };
}

/** Display names for every id a report can show (names only, never contact data). */
export async function labelsFor(orgId: string): Promise<Record<string, string>> {
  const svc = createAdminClient();
  const [p, c, pr, lt, d, pe, so] = await Promise.all([
    svc.from("processes").select("id, name").eq("org_id", orgId),
    svc.from("product_categories").select("id, name").eq("org_id", orgId),
    svc.from("products").select("id, name").eq("org_id", orgId),
    svc.from("lead_types").select("id, name").eq("org_id", orgId),
    svc.from("dispositions").select("id, label").eq("org_id", orgId),
    svc.from("profiles").select("user_id, full_name").eq("org_id", orgId),
    svc.from("lead_sources").select("id, name").eq("org_id", orgId),
  ]);
  const out: Record<string, string> = {};
  for (const r of [...(p.data ?? []), ...(c.data ?? []), ...(pr.data ?? []), ...(lt.data ?? []), ...(so.data ?? [])]) out[r.id] = r.name;
  for (const r of d.data ?? []) out[r.id] = r.label;
  for (const r of pe.data ?? []) out[r.user_id] = r.full_name || "Unnamed";
  return out;
}

/** Options for the filter bar, limited to what the user may report on. */
export async function filterOptions(s: Session) {
  const svc = createAdminClient();
  const scope = await reportScope(s);
  const [p, c, pr, lt, d, so, people, teams] = await Promise.all([
    svc.from("processes").select("id, name").eq("org_id", s.orgId).order("name"),
    svc.from("product_categories").select("id, name").eq("org_id", s.orgId).order("name"),
    svc.from("products").select("id, name").eq("org_id", s.orgId).order("name"),
    svc.from("lead_types").select("id, name").eq("org_id", s.orgId).order("name"),
    svc.from("dispositions").select("id, label").eq("org_id", s.orgId).order("sort").order("label"),
    svc.from("lead_sources").select("id, name").eq("org_id", s.orgId).order("created_at", { ascending: false }).limit(200),
    svc.from("profiles").select("user_id, full_name, role").eq("org_id", s.orgId).in("role", ["caller", "team_leader"]).order("full_name"),
    svc.from("teams").select("team_leader_id").eq("org_id", s.orgId).not("team_leader_id", "is", null),
  ]);
  const inScope = (id: string) => !scope || scope.includes(id);
  const opt = (rows: { id: string; name?: string; label?: string }[] | null) => (rows ?? []).map((r) => ({ value: r.id, label: r.name ?? r.label ?? "" }));
  const tlIds = new Set((teams.data ?? []).map((t) => t.team_leader_id));
  return {
    processes: opt(p.data), categories: opt(c.data), products: opt(pr.data), lead_types: opt(lt.data),
    dispositions: opt(d.data), sources: opt(so.data),
    agents: (people.data ?? []).filter((x) => inScope(x.user_id)).map((x) => ({ value: x.user_id, label: x.full_name })),
    tls: (people.data ?? []).filter((x) => tlIds.has(x.user_id) && inScope(x.user_id)).map((x) => ({ value: x.user_id, label: x.full_name })),
  };
}
export type FilterOptions = Awaited<ReturnType<typeof filterOptions>>;
