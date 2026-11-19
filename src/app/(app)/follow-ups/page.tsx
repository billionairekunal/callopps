import { requireRole } from "@/lib/auth/session";
import { followUps } from "@/lib/calls/queries";
import { leadOptions } from "@/lib/leads/queries";
import { dueBucket } from "@/lib/calls/time";
import { PageHeader } from "@/components/shell/PageHeader";
import { TaskRow, Stat } from "@/components/calls/TaskRow";

const sel = "h-9 rounded-md border border-input bg-white px-2 text-sm";
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

export default async function FollowUps({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const session = await requireRole("super_admin", "admin", "team_leader", "caller");
  const who = uuid((await searchParams).who);
  const mgmt = session.role !== "caller";
  const [rows, opts] = await Promise.all([followUps(session, who), mgmt ? leadOptions() : null]);
  const groups = { overdue: [] as typeof rows, today: [] as typeof rows, upcoming: [] as typeof rows };
  for (const r of rows) groups[dueBucket(r.next_followup_at!)].push(r);
  const block = (title: string, list: typeof rows, tone: string) => list.length > 0 && (
    <section className="rounded-xl border bg-white shadow-sm">
      <h2 className={`border-b px-4 py-2.5 text-sm font-semibold ${tone}`}>{title} <span className="font-normal text-slate-500">({list.length})</span></h2>
      <ul className="divide-y">{list.map((l) => <TaskRow key={l.id} lead={l} session={session} showAssignee={mgmt} />)}</ul>
    </section>
  );
  return (
    <>
      <PageHeader title="Follow-Ups" subtitle="Due, overdue and upcoming follow-ups. Tap Call to ring the lead." actions={mgmt && opts && (
        <form className="flex items-center gap-2">
          <select name="who" defaultValue={who ?? ""} className={sel} aria-label="Agent">
            <option value="">All agents</option>
            {opts.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
          </select>
          <button className="h-9 rounded-md border bg-white px-3 text-sm hover:bg-slate-50">Apply</button>
        </form>
      )} />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Overdue" value={groups.overdue.length} tone="text-rose-600" />
        <Stat label="Due today" value={groups.today.length} tone="text-amber-700" />
        <Stat label="Upcoming" value={groups.upcoming.length} />
      </div>
      {rows.length === 0 ? <p className="rounded-xl border bg-white p-6 text-sm text-slate-500 shadow-sm">No follow-ups scheduled. Set one when you save a call outcome.</p> : (
        <div className="space-y-5">
          {block("Overdue", groups.overdue, "text-rose-700")}
          {block("Today", groups.today, "text-amber-800")}
          {block("Upcoming", groups.upcoming, "text-slate-900")}
        </div>
      )}
    </>
  );
}
