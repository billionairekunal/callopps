import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { maskPhone } from "@/lib/crypto/fieldCrypto";
import type { Session } from "@/lib/auth/roles";
import type { LeadStatus } from "@/lib/leads/queries";
import { istDay } from "./time";

export type TaskLead = {
  id: string; name: string | null; phone: string; city: string | null; status: LeadStatus; created_at: string;
  next_followup_at: string | null; process_id: string | null; process: string | null; disposition: string | null;
  leadType: string | null; assignedTo: string | null; assignedName: string | null;
};

const SELECT = `id, name, phone_last4, city, status, created_at, next_followup_at, process_id, assigned_to,
  process:processes(name), disposition:dispositions(label), lead_type:lead_types(name),
  assignee:profiles!leads_assigned_to_org_id_fkey(full_name)`;
type Named = { name?: string; label?: string; full_name?: string } | null;
const nm = (x: Named | Named[]) => { const v = Array.isArray(x) ? x[0] : x; return v?.name ?? v?.label ?? v?.full_name ?? null; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toTask = (l: any): TaskLead => ({
  id: l.id, name: l.name, phone: maskPhone(l.phone_last4), city: l.city, status: l.status, created_at: l.created_at,
  next_followup_at: l.next_followup_at, process_id: l.process_id, process: nm(l.process), disposition: nm(l.disposition),
  leadType: nm(l.lead_type), assignedTo: l.assigned_to, assignedName: nm(l.assignee),
});

/** The caller's queue (§7.5): follow-ups due by end of today first (oldest due first), then new leads newest first, then later follow-ups. */
export async function myQueue(s: Session): Promise<{ due: TaskLead[]; rest: TaskLead[] }> {
  const db = await createClient();
  const { end } = istDay();
  const open = () => db.from("leads").select(SELECT).eq("assigned_to", s.userId).in("status", ["new", "in_progress"]);
  const [due, rest] = await Promise.all([
    open().lte("next_followup_at", end).order("next_followup_at").limit(200),
    open().or(`next_followup_at.is.null,next_followup_at.gt.${end}`)
      .order("next_followup_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: false }).limit(200),
  ]);
  if (due.error || rest.error) throw new Error("Could not load your tasks.");
  return { due: (due.data ?? []).map(toTask), rest: (rest.data ?? []).map(toTask) };
}

/** Every lead with an open follow-up that the user can see (RLS), soonest first. */
export async function followUps(s: Session, assignedTo?: string): Promise<TaskLead[]> {
  let q = (await createClient()).from("leads").select(SELECT).not("next_followup_at", "is", null)
    .in("status", ["new", "in_progress"]).order("next_followup_at").limit(500);
  if (s.role === "caller") q = q.eq("assigned_to", s.userId);
  else if (assignedTo) q = q.eq("assigned_to", assignedTo);
  const { data, error } = await q;
  if (error) throw new Error("Could not load follow-ups.");
  return (data ?? []).map(toTask);
}

export const STATUSES: LeadStatus[] = ["new", "in_progress", "won", "lost"];

/** Kanban columns: count plus the most recently updated leads per status. */
export async function pipeline(s: Session, f: { processId?: string; assignedTo?: string }) {
  const db = await createClient();
  const cols = await Promise.all(STATUSES.map(async (status) => {
    let q = db.from("leads").select(SELECT, { count: "exact" }).eq("status", status).order("updated_at", { ascending: false }).limit(30);
    if (f.processId) q = q.eq("process_id", f.processId);
    if (s.role === "caller") q = q.eq("assigned_to", s.userId);
    else if (f.assignedTo) q = q.eq("assigned_to", f.assignedTo);
    const { data, count, error } = await q;
    if (error) throw new Error("Could not load the pipeline.");
    return { status, count: count ?? 0, leads: (data ?? []).map(toTask) };
  }));
  return cols;
}

/** Whose calls a user may count: super admin and admin the whole org (aggregates only), TL their team, caller themself. */
async function callerScope(s: Session): Promise<string[] | null> {
  if (s.role === "super_admin" || s.role === "admin") return null;
  if (s.role === "caller" || !s.teamId) return [s.userId];
  const { data } = await createAdminClient().from("profiles").select("user_id").eq("org_id", s.orgId).eq("team_id", s.teamId);
  return [...new Set([s.userId, ...(data ?? []).map((p) => p.user_id)])];
}

/** Today's summary (India time). Counts only, so admins see numbers without call rows. */
export async function todaySummary(s: Session) {
  const svc = createAdminClient();
  const { start, end } = istDay();
  const scope = await callerScope(s);
  const calls = () => {
    let q = svc.from("calls").select("id", { count: "exact", head: true }).eq("org_id", s.orgId).gte("saved_at", start).lt("saved_at", end);
    if (scope) q = q.in("caller_id", scope);
    return q;
  };
  const rls = await createClient();
  const dueQ = () => {
    let q = rls.from("leads").select("id", { count: "exact", head: true }).in("status", ["new", "in_progress"]);
    if (scope) q = q.in("assigned_to", scope);
    return q;
  };
  const [all, connected, overdue, dueToday, won] = await Promise.all([
    calls(), calls().eq("connected", true),
    dueQ().lt("next_followup_at", new Date().toISOString()),
    dueQ().gte("next_followup_at", new Date().toISOString()).lt("next_followup_at", end),
    (() => {
      let q = svc.from("lead_status_history").select("id", { count: "exact", head: true }).eq("org_id", s.orgId).eq("to_status", "won").gte("at", start).lt("at", end);
      if (scope) q = q.in("actor_id", scope);
      return q;
    })(),
  ]);
  return { calls: all.count ?? 0, connected: connected.count ?? 0, overdue: overdue.count ?? 0, dueToday: dueToday.count ?? 0, won: won.count ?? 0 };
}

/** Dispositions for the outcome sheet, grouped by process (null = any process). */
export async function dispositionOptions() {
  const { data } = await (await createClient()).from("dispositions").select("id, label, outcome, process_id").order("sort").order("label");
  return data ?? [];
}
export type DispositionOption = Awaited<ReturnType<typeof dispositionOptions>>[number];

/** The user's open attendance session today, if any. */
export async function myAttendance(s: Session) {
  if (s.role !== "caller" && s.role !== "team_leader") return null;
  const { data } = await (await createClient()).from("attendance_sessions").select("punch_in, punch_out, end_reason")
    .eq("user_id", s.userId).order("punch_in", { ascending: false }).limit(1).maybeSingle();
  return { open: !!data && !data.punch_out, punchIn: data?.punch_in ?? null, lastEnd: data?.end_reason ?? null };
}
