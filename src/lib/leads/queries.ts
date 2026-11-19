import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getOrgKeys } from "@/lib/crypto/orgKeys";
import { decryptField, blindIndex, maskPhone } from "@/lib/crypto/fieldCrypto";
import { logAudit } from "@/lib/audit";
import type { Session } from "@/lib/auth/roles";
import { searchKind } from "./search";
import { fmtDateTime } from "@/lib/calls/time";

export const PAGE_SIZE = 50;
export type LeadStatus = "new" | "in_progress" | "won" | "lost";
export type LeadFilters = { q?: string; qh?: string; status?: string; processId?: string; assignedTo?: string; sourceId?: string; dispositionId?: string; city?: string; page?: number };
export type LeadListRow = {
  id: string; name: string | null; phone: string; city: string | null; status: LeadStatus; created_at: string;
  process: string | null; product: string | null; leadType: string | null; disposition: string | null; source: string | null;
  assignedTo: string | null; assignedName: string | null;
};

const SELECT = `id, name, phone_last4, phone_enc, city, status, created_at, assigned_to, process_id,
  process:processes(name), product:products(name), lead_type:lead_types(name), disposition:dispositions(label),
  source:lead_sources(name), assignee:profiles!leads_assigned_to_org_id_fkey(full_name)`;

type Named = { name?: string; label?: string; full_name?: string } | null;
const nm = (x: Named | Named[]) => { const v = Array.isArray(x) ? x[0] : x; return v?.name ?? v?.label ?? v?.full_name ?? null; };

/** Apply the search box: full number → hash lookup, 4 digits → last 4, text → name. */
async function applySearch<Q extends { eq: (c: string, v: string) => Q; ilike: (c: string, v: string) => Q }>(q: Q, text: string | undefined, orgId: string): Promise<Q | null> {
  if (!text?.trim()) return q;
  const k = searchKind(text);
  if (k.kind === "phone") return q.eq("phone_hash", blindIndex(k.phone, (await getOrgKeys(orgId)).hashKey));
  if (k.kind === "last4") return q.eq("phone_last4", k.digits);
  if (k.kind === "name") return q.ilike("name", `%${k.text.replace(/[%_]/g, "")}%`);
  return null;
}

export async function listLeads(session: Session, f: LeadFilters): Promise<{ rows: LeadListRow[]; total: number }> {
  const db = await createClient();
  const page = Math.max(1, f.page ?? 1);
  let q = db.from("leads").select(SELECT, { count: "exact" }).order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (f.status) q = q.eq("status", f.status);
  if (f.processId) q = q.eq("process_id", f.processId);
  if (f.sourceId) q = q.eq("source_id", f.sourceId);
  if (f.dispositionId && /^[0-9a-f-]{36}$/i.test(f.dispositionId)) q = q.eq("disposition_id", f.dispositionId);
  if (f.city) q = q.ilike("city", `%${f.city.replace(/[%_]/g, "")}%`);
  if (f.qh && /^[0-9a-f]{64}$/.test(f.qh)) q = q.eq("phone_hash", f.qh);
  if (f.assignedTo === "unassigned") q = q.is("assigned_to", null);
  else if (f.assignedTo) q = q.eq("assigned_to", f.assignedTo);
  const searched = await applySearch(q, f.q, session.orgId);
  if (!searched) return { rows: [], total: 0 };
  const { data, count, error } = await searched;
  if (error) throw new Error("Could not load leads.");

  const unmask = session.role === "super_admin";
  const keys = unmask && data?.length ? await getOrgKeys(session.orgId) : null;
  const rows = (data ?? []).map((l) => ({
    id: l.id, name: l.name, city: l.city, status: l.status as LeadStatus, created_at: l.created_at,
    phone: keys ? decryptField(l.phone_enc, () => keys.dataKey) : maskPhone(l.phone_last4),
    process: nm(l.process as Named), product: nm(l.product as Named), leadType: nm(l.lead_type as Named),
    disposition: nm(l.disposition as Named), source: nm(l.source as Named),
    assignedTo: l.assigned_to, assignedName: nm(l.assignee as Named),
  }));
  if (keys) await logAudit("lead.view_unmasked", "lead", undefined, { count: rows.length, page });
  return { rows, total: count ?? 0 };
}

export type TimelineItem = { at: string; kind: string; text: string; actor: string | null };
export type LeadDetail = {
  id: string; name: string | null; phone: string; alt: string | null; email: string | null; city: string | null;
  status: LeadStatus; disposition: string | null; process: string | null; product: string | null; leadType: string | null;
  source: string | null; assignedName: string | null; assignedTo: string | null; processId: string | null; created_at: string; next_followup_at: string | null;
  extra: Record<string, string>; sensitive: Record<string, string> | null; timeline: TimelineItem[];
};

const STATUS_LABEL: Record<string, string> = { new: "New", in_progress: "In progress", won: "Won", lost: "Lost" };

export async function getLead(session: Session, id: string): Promise<LeadDetail | null> {
  const db = await createClient();
  const { data: l, error: le } = await db.from("leads")
    .select(`${SELECT}, alt_phone_enc, alt_phone_last4, email_enc, email_mask, extra, sensitive_enc, next_followup_at, lead_type_id`)
    .eq("id", id).maybeSingle();
  if (le) throw new Error("Could not load this lead.");
  if (!l) return null;
  const [ev, hist, tr] = await Promise.all([
    db.from("lead_events").select("type, payload, actor_id, at").eq("lead_id", id).order("at", { ascending: false }).limit(200),
    db.from("lead_status_history").select("from_status, to_status, actor_id, at, disposition:dispositions(label)").eq("lead_id", id).order("at", { ascending: false }).limit(200),
    db.from("lead_transfers").select("from_user, to_user, reason, by_user, at").eq("lead_id", id).order("at", { ascending: false }).limit(100),
  ]);
  const people = new Set<string>();
  [...(ev.data ?? []).map((e) => e.actor_id), ...(hist.data ?? []).map((h) => h.actor_id),
    ...(tr.data ?? []).flatMap((t) => [t.from_user, t.to_user, t.by_user])].forEach((p) => p && people.add(p));
  const { data: profs } = people.size ? await db.from("profiles").select("user_id, full_name").in("user_id", [...people]) : { data: [] };
  const who = (u: string | null) => (u ? profs?.find((p) => p.user_id === u)?.full_name ?? "Someone" : null);
  const dispIds = [...new Set((ev.data ?? []).map((e) => e.type === "call" && e.payload?.disposition_id).filter(Boolean) as string[])];
  const { data: disps } = dispIds.length ? await db.from("dispositions").select("id, label").in("id", dispIds) : { data: [] };
  const callText = (p: Record<string, unknown>) => [
    p.connected ? "Call · connected" : "Call · not connected",
    disps?.find((d) => d.id === p.disposition_id)?.label,
    p.duration_s ? `${Math.max(1, Math.round(Number(p.duration_s) / 60))} min` : null,
  ].filter(Boolean).join(" · ") + (p.notes ? ` — ${p.notes}` : "") + (p.followup_at ? ` (follow-up ${fmtDateTime(String(p.followup_at))})` : "");

  const timeline: TimelineItem[] = [
    ...(ev.data ?? []).filter((e) => e.type !== "transfer" && e.type !== "call_started").map((e) => ({
      at: e.at, kind: e.type, actor: who(e.actor_id),
      text: e.type === "created" ? `Lead created${e.payload?.via === "import" ? ` from import “${e.payload.source ?? ""}”` : " by hand"}`
        : e.type === "note" ? String(e.payload?.text ?? "") : e.type === "call" ? callText(e.payload ?? {})
        : e.type === "message" ? `${e.payload?.channel === "whatsapp" ? "WhatsApp" : "SMS"} opened — “${String(e.payload?.body ?? "")}”` : e.type.replace(/_/g, " "),
    })),
    ...(hist.data ?? []).filter((h) => h.from_status).map((h) => ({
      at: h.at, kind: "status", actor: who(h.actor_id),
      text: `Status ${STATUS_LABEL[h.from_status!] ?? h.from_status} → ${STATUS_LABEL[h.to_status] ?? h.to_status}${nm(h.disposition as Named) ? ` (${nm(h.disposition as Named)})` : ""}`,
    })),
    ...(tr.data ?? []).map((t) => ({
      at: t.at, kind: "transfer", actor: who(t.by_user),
      text: `Moved from ${who(t.from_user) ?? "unassigned"} to ${who(t.to_user)}${t.reason ? ` — ${t.reason}` : ""}`,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const unmask = session.role === "super_admin";
  const keys = unmask ? await getOrgKeys(session.orgId) : null;
  const dec = (b: string | null) => (b && keys ? decryptField(b, () => keys.dataKey) : null);
  if (keys) await logAudit("lead.view_unmasked", "lead", id);

  return {
    id: l.id, name: l.name, city: l.city, status: l.status as LeadStatus, created_at: l.created_at, next_followup_at: l.next_followup_at,
    phone: keys ? dec(l.phone_enc)! : maskPhone(l.phone_last4),
    alt: l.alt_phone_enc ? (keys ? dec(l.alt_phone_enc) : maskPhone(l.alt_phone_last4!)) : null,
    email: l.email_enc ? (keys ? dec(l.email_enc) : l.email_mask) : null,
    disposition: nm(l.disposition as Named), process: nm(l.process as Named), product: nm(l.product as Named),
    leadType: nm(l.lead_type as Named), source: nm(l.source as Named),
    assignedName: nm(l.assignee as Named), assignedTo: l.assigned_to, processId: l.process_id,
    extra: (l.extra ?? {}) as Record<string, string>,
    sensitive: keys && l.sensitive_enc ? JSON.parse(dec(l.sensitive_enc)!) : null,
    timeline,
  };
}

/** Options for filters and forms (all via RLS). */
export async function leadOptions() {
  const db = await createClient();
  const [processes, products, leadTypes, sources, people] = await Promise.all([
    db.from("processes").select("id, name").order("name"),
    db.from("products").select("id, name").order("name"),
    db.from("lead_types").select("id, name").order("name"),
    db.from("lead_sources").select("id, name").order("created_at", { ascending: false }).limit(200),
    db.from("profiles").select("user_id, full_name, role, team_id, status").eq("status", "active").order("full_name"),
  ]);
  return {
    processes: processes.data ?? [], products: products.data ?? [], leadTypes: leadTypes.data ?? [],
    sources: sources.data ?? [],
    people: (people.data ?? []).filter((p) => p.role === "caller" || p.role === "team_leader"),
  };
}
export type LeadOptions = Awaited<ReturnType<typeof leadOptions>>;
