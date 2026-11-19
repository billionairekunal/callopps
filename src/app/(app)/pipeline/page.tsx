import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { pipeline, todaySummary } from "@/lib/calls/queries";
import { leadOptions } from "@/lib/leads/queries";
import { dueBucket } from "@/lib/calls/time";
import { PageHeader } from "@/components/shell/PageHeader";
import { Stat, leadHref } from "@/components/calls/TaskRow";

const sel = "h-9 rounded-md border border-input bg-white px-2 text-sm";
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
const COL: Record<string, [string, string]> = {
  new: ["New", "border-t-sky-500"], in_progress: ["In progress", "border-t-amber-500"],
  won: ["Won", "border-t-emerald-500"], lost: ["Lost", "border-t-rose-500"],
};

export default async function Pipeline({ searchParams }: { searchParams: Promise<{ process?: string; who?: string }> }) {
  const session = await requireRole("super_admin", "admin", "team_leader", "caller");
  const sp = await searchParams;
  const f = { processId: uuid(sp.process), assignedTo: uuid(sp.who) };
  const mgmt = session.role !== "caller";
  const [cols, sum, opts] = await Promise.all([pipeline(session, f), todaySummary(session), leadOptions()]);
  const total = cols.reduce((n, c) => n + c.count, 0);
  const wl = (cols.find((c) => c.status === "won")?.count ?? 0) + (cols.find((c) => c.status === "lost")?.count ?? 0);
  const winRate = wl ? Math.round(((cols.find((c) => c.status === "won")?.count ?? 0) / wl) * 100) : 0;

  return (
    <>
      <PageHeader title="Pipeline / Overview" subtitle={`${total.toLocaleString("en-IN")} leads · win rate ${winRate}% (Won ÷ (Won + Lost))`} actions={
        <form className="flex flex-wrap items-center gap-2">
          <select name="process" defaultValue={f.processId ?? ""} className={sel} aria-label="Process">
            <option value="">All Processes</option>{opts.processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {mgmt && <select name="who" defaultValue={f.assignedTo ?? ""} className={sel} aria-label="Agent">
            <option value="">All Agents</option>{opts.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
          </select>}
          <button className="h-9 rounded-md border bg-white px-3 text-sm hover:bg-slate-50">Apply</button>
          {(f.processId || f.assignedTo) && <Link href="/pipeline" className="text-sm text-slate-500 underline">Reset</Link>}
        </form>
      } />
      <h2 className="mb-2 text-sm font-semibold text-slate-700">Today</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Calls" value={sum.calls} />
        <Stat label="Connected" value={sum.connected} tone="text-emerald-700" />
        <Stat label="Won today" value={sum.won} tone="text-emerald-700" />
        <Stat label="Due today" value={sum.dueToday} tone="text-amber-700" />
        <Stat label="Overdue" value={sum.overdue} tone="text-rose-600" />
      </div>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        {cols.map((c) => (
          <section key={c.status} className={`w-[80vw] max-w-xs shrink-0 snap-start rounded-xl border border-t-4 bg-slate-50 md:w-auto md:max-w-none ${COL[c.status][1]}`}>
            <h3 className="flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-slate-900">
              {COL[c.status][0]}<span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{c.count.toLocaleString("en-IN")}</span>
            </h3>
            <ul className="space-y-2 px-2 pb-2">
              {c.leads.map((l) => (
                <li key={l.id}>
                  <Link href={leadHref(session, l.id)} className="block rounded-lg border bg-white p-2.5 text-sm shadow-xs hover:border-rose-300">
                    <div className="truncate font-medium text-slate-900">{l.name || "Unnamed lead"}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
                      <span className="font-mono">{l.phone}</span>{l.process && <span>{l.process}</span>}
                    </div>
                    {(l.disposition || (mgmt && l.assignedName)) && <div className="mt-1 truncate text-xs text-slate-500">{[l.disposition, mgmt ? l.assignedName : null].filter(Boolean).join(" · ")}</div>}
                    {l.next_followup_at && c.status !== "won" && c.status !== "lost" && dueBucket(l.next_followup_at) === "overdue" &&
                      <div className="mt-1 text-xs font-medium text-rose-600">Follow-up overdue</div>}
                  </Link>
                </li>
              ))}
              {c.count > c.leads.length && (
                <li><Link href={mgmt ? `/leads?status=${c.status}${f.processId ? `&process=${f.processId}` : ""}` : "/my-tasks"} className="block px-1 py-1 text-xs text-rose-700 hover:underline">
                  View all {c.count.toLocaleString("en-IN")} →</Link></li>
              )}
              {c.count === 0 && <li className="px-1 py-2 text-xs text-slate-400">No leads</li>}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
