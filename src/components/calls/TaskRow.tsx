import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { StatusBadge } from "@/components/leads/StatusBadge";
import { dueBucket, fmtDateTime } from "@/lib/calls/time";
import type { TaskLead } from "@/lib/calls/queries";
import type { Session } from "@/lib/auth/roles";
import { CallButton } from "./CallButton";

const DUE: Record<string, string> = { overdue: "text-rose-600", today: "text-amber-700", upcoming: "text-slate-500" };

export const leadHref = (s: Session, id: string) => (s.role === "caller" ? `/my-tasks?lead=${id}` : `/leads/${id}`);
export const canCall = (s: Session, l: TaskLead) => s.role === "super_admin" || l.assignedTo === s.userId;

export function TaskRow({ lead: l, session, href, showAssignee = false, selected = false }: { lead: TaskLead; session: Session; href?: string; showAssignee?: boolean; selected?: boolean }) {
  const bucket = l.next_followup_at ? dueBucket(l.next_followup_at) : null;
  return (
    <li className={`flex flex-wrap items-center gap-3 px-4 py-3 ${selected ? "bg-rose-50/60" : ""}`}>
      <Link href={href ?? leadHref(session, l.id)} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-slate-900">{l.name || "Unnamed lead"}</span>
          <StatusBadge status={l.status} />
          {l.leadType && <span className="text-xs text-slate-500">{l.leadType}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
          <span className="font-mono">{l.phone}</span>
          {l.process && <span>{l.process}</span>}
          {l.city && <span>{l.city}</span>}
          {l.disposition && <span>Last: {l.disposition}</span>}
          {showAssignee && <span>{l.assignedName ?? "Unassigned"}</span>}
        </div>
        {bucket && (
          <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${DUE[bucket]}`}>
            <CalendarClock className="size-3.5" />{bucket === "overdue" ? "Overdue · " : bucket === "today" ? "Today · " : ""}{fmtDateTime(l.next_followup_at!)}
          </div>
        )}
      </Link>
      {canCall(session, l) && <CallButton lead={{ id: l.id, name: l.name, process_id: l.process_id }} />}
    </li>
  );
}

export function Stat({ label, value, tone = "text-slate-900" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
