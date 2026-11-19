import { requireRole } from "@/lib/auth/session";
import { myQueue, todaySummary } from "@/lib/calls/queries";
import { getLead } from "@/lib/leads/queries";
import { PageHeader } from "@/components/shell/PageHeader";
import { TaskRow, Stat } from "@/components/calls/TaskRow";
import { LeadPanel } from "@/components/calls/LeadPanel";

export default async function MyTasks({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const session = await requireRole("super_admin", "admin", "team_leader", "caller");
  const { lead: leadId } = await searchParams;
  const valid = leadId && /^[0-9a-f-]{36}$/i.test(leadId) ? leadId : null;
  const [{ due, rest }, sum, lead] = await Promise.all([
    myQueue(session), todaySummary(session), valid ? getLead(session, valid) : null,
  ]);
  const href = (id: string) => `/my-tasks?lead=${id}`;
  const list = (title: string, rows: typeof due, empty: string) => (
    <section className="rounded-xl border bg-white shadow-sm">
      <h2 className="border-b px-4 py-2.5 text-sm font-semibold text-slate-900">{title} <span className="font-normal text-slate-500">({rows.length})</span></h2>
      {rows.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">{empty}</p> : (
        <ul className="divide-y">{rows.map((l) => <TaskRow key={l.id} lead={l} session={session} href={href(l.id)} selected={l.id === valid} />)}</ul>
      )}
    </section>
  );

  return (
    <>
      <PageHeader title="My tasks" subtitle="Follow-ups due today first, then your newest leads. Tap Call, then save the outcome." />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Calls today" value={sum.calls} />
        <Stat label="Connected" value={sum.connected} tone="text-emerald-700" />
        <Stat label="Due today" value={sum.dueToday} tone="text-amber-700" />
        <Stat label="Overdue" value={sum.overdue} tone="text-rose-600" />
      </div>
      <div className={lead ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]" : ""}>
        {lead && <div className="lg:order-2"><LeadPanel lead={lead}
          canCall={session.role === "super_admin" || lead.assignedTo === session.userId} closeHref="/my-tasks" /></div>}
        <div className="space-y-5 lg:order-1">
          {list("Call now", due, "Nothing due. Start on your new leads below.")}
          {list("Your leads", rest, session.role === "admin" || session.role === "super_admin" ? "Leads are assigned to callers and team leaders." : "No open leads assigned to you yet.")}
        </div>
      </div>
    </>
  );
}
