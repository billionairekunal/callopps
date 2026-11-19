import Link from "next/link";
import { X, MapPin } from "lucide-react";
import { StatusBadge } from "@/components/leads/StatusBadge";
import { fmtDateTime } from "@/lib/calls/time";
import type { LeadDetail } from "@/lib/leads/queries";
import { CallButton } from "./CallButton";
import { MessageButtons } from "@/components/comms/MessageButtons";

/** The caller's view of one lead: what they need before and after dialling. */
export function LeadPanel({ lead: l, canCall, closeHref }: { lead: LeadDetail; canCall: boolean; closeHref: string }) {
  return (
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-slate-900">{l.name || "Unnamed lead"}</h2>
            <StatusBadge status={l.status} />
          </div>
          <p className="mt-0.5 font-mono text-sm text-slate-600">{l.phone}{l.alt ? ` · alt ${l.alt}` : ""}</p>
          {l.city && <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin className="size-3.5" />{l.city}</p>}
        </div>
        <Link href={closeHref} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="size-4" /></Link>
      </div>
      <div className="space-y-4 p-4">
        {canCall && (
          <div className="flex flex-wrap items-center gap-2">
            <CallButton size="lg" lead={{ id: l.id, name: l.name, process_id: l.processId }} />
            <MessageButtons leadId={l.id} leadName={l.name} />
          </div>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          {([["Process", l.process], ["Product / course", l.product], ["Lead type", l.leadType], ["Disposition", l.disposition],
            ["Next follow-up", l.next_followup_at ? fmtDateTime(l.next_followup_at) : null], ["Source", l.source]] as const).map(([k, v]) => (
            <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-slate-800">{v ?? "—"}</dd></div>
          ))}
          {Object.entries(l.extra).map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="break-words text-slate-800">{v}</dd></div>)}
        </dl>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">History</h3>
          {l.timeline.length === 0 ? <p className="text-sm text-slate-500">No calls yet.</p> : (
            <ol className="space-y-2.5">
              {l.timeline.slice(0, 20).map((t, i) => (
                <li key={i} className="text-sm"><p className="text-slate-800">{t.text}</p>
                  <p className="text-xs text-slate-500">{fmtDateTime(t.at)}{t.actor ? ` · ${t.actor}` : ""}</p></li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
