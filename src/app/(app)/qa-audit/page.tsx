import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { reportScope, labelsFor } from "@/lib/reports/server";
import { fmtDateTime } from "@/lib/calls/time";
import { PageHeader } from "@/components/shell/PageHeader";
import { AuditForm } from "@/components/qa/AuditForm";
import { ChecklistEditor } from "@/components/qa/ChecklistEditor";
import { checklistFor } from "@/lib/qa/checklist";

const card = "rounded-xl border bg-white shadow-sm";
const tone = (n: number) => (n >= 80 ? "text-emerald-700" : n >= 60 ? "text-amber-700" : "text-rose-600");

export default async function QaAudit() {
  const s = await requireRole("super_admin", "admin", "team_leader", "caller");
  const auditor = s.role === "super_admin" || s.role === "team_leader";
  const [items, labels, { data: audits }] = await Promise.all([
    checklistFor(s.orgId), labelsFor(s.orgId),
    (await createClient()).from("qa_audits").select("id, agent_id, auditor_id, score, remarks, created_at, lead:leads(name)").order("created_at", { ascending: false }).limit(100),
  ]);
  // A sample to review: recent saved calls in scope, not yet audited, not the auditor's own.
  let sample: { id: string; caller_id: string; saved_at: string; connected: boolean | null; duration_s: number | null; notes: string; lead: unknown; disposition: unknown }[] = [];
  if (auditor) {
    const scope = await reportScope(s);
    let q = createAdminClient().from("calls").select("id, caller_id, saved_at, connected, duration_s, notes, lead:leads(name), disposition:dispositions(label), qa:qa_audits(id)")
      .eq("org_id", s.orgId).not("saved_at", "is", null).neq("caller_id", s.userId)
      .gte("saved_at", new Date(Date.now() - 14 * 86_400_000).toISOString()).order("saved_at", { ascending: false }).limit(200);
    if (scope) q = q.in("caller_id", scope);
    const { data } = await q;
    const open = (data ?? []).filter((c) => !(c.qa as unknown[] | null)?.length);
    sample = open.map((c) => ({ c, r: Math.random() })).sort((a, b) => a.r - b.r).slice(0, 10).map((x) => x.c); // random sample
  }
  const one = (x: unknown) => (Array.isArray(x) ? x[0] : x) as { name?: string | null; label?: string } | null;
  const mine = (audits ?? []).filter((a) => a.agent_id === s.userId);
  const avg = (rows: { score: number }[]) => (rows.length ? Math.round(rows.reduce((n, r) => n + r.score, 0) / rows.length) : 0);

  return (
    <>
      <PageHeader title="QA Audit" subtitle={auditor ? "Review a sample of calls and score them against the checklist." : "Call quality scores against the centre's checklist."} />
      {s.role === "caller" && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:w-96">
          <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">Your average</div><div className={`text-2xl font-semibold ${tone(avg(mine))}`}>{mine.length ? `${avg(mine)}%` : "—"}</div></div>
          <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">Calls audited</div><div className="text-2xl font-semibold">{mine.length}</div></div>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {auditor && (
            <section className={card}>
              <h2 className="border-b px-5 py-3 font-semibold text-slate-900">To review <span className="font-normal text-slate-500">· random sample of the last 14 days</span></h2>
              {sample.length === 0 ? <p className="p-5 text-sm text-slate-500">No unaudited calls in the last 14 days.</p> : (
                <ul className="divide-y">
                  {sample.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="font-medium text-slate-900">{labels[c.caller_id] ?? "—"} → {one(c.lead)?.name || "Unnamed lead"}</div>
                        <div className="text-xs text-slate-500">{fmtDateTime(c.saved_at)} · {c.connected ? "Connected" : "Not connected"}{one(c.disposition)?.label ? ` · ${one(c.disposition)!.label}` : ""}{c.duration_s ? ` · ${Math.max(1, Math.round(c.duration_s / 60))} min` : ""}</div>
                        {c.notes && <p className="mt-1 text-slate-700">“{c.notes}”</p>}
                      </div>
                      <AuditForm callId={c.id} title={`${labels[c.caller_id] ?? "Agent"} · ${fmtDateTime(c.saved_at)}`} items={items} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <section className={card}>
            <h2 className="border-b px-5 py-3 font-semibold text-slate-900">{s.role === "caller" ? "Your scores" : "Recent audits"}</h2>
            {(audits ?? []).length === 0 ? <p className="p-5 text-sm text-slate-500">No audits yet.</p> : (
              <ul className="divide-y">
                {(audits ?? []).map((a) => (
                  <li key={a.id} className="flex items-start gap-4 px-5 py-3">
                    <span className={`w-12 text-lg font-semibold tabular-nums ${tone(a.score)}`}>{a.score}%</span>
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="text-slate-900">{s.role === "caller" ? one(a.lead)?.name || "Unnamed lead" : `${labels[a.agent_id] ?? "—"} · ${one(a.lead)?.name || "Unnamed lead"}`}</div>
                      <div className="text-xs text-slate-500">by {labels[a.auditor_id] ?? "—"} · {fmtDateTime(a.created_at)}</div>
                      {a.remarks && <p className="mt-1 text-slate-700">{a.remarks}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <section className={`${card} h-fit p-5`}>
          <h2 className="mb-3 font-semibold text-slate-900">Checklist</h2>
          {s.role === "super_admin" || s.role === "admin" ? <ChecklistEditor items={items} /> : (
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">{items.map((i) => <li key={i.id}>{i.label}</li>)}</ol>
          )}
        </section>
      </div>
    </>
  );
}
