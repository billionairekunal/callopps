import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Mail, MapPin, Lock } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getLead } from "@/lib/leads/queries";
import { StatusBadge } from "@/components/leads/StatusBadge";

const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const DOT: Record<string, string> = { message: "bg-teal-500", call: "bg-emerald-500", created: "bg-sky-500", status: "bg-amber-500", transfer: "bg-violet-500", note: "bg-slate-400" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("super_admin", "admin", "team_leader");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const l = await getLead(session, id);
  if (!l) notFound();

  const facts: [string, string | null][] = [
    ["Process", l.process], ["Product / course", l.product], ["Lead type", l.leadType], ["Disposition", l.disposition],
    ["Assigned to", l.assignedName ?? "Unassigned"], ["Source", l.source ?? "Added by hand"], ["Added", fmt.format(new Date(l.created_at))],
    ["Next follow-up", l.next_followup_at ? fmt.format(new Date(l.next_followup_at)) : null],
  ];
  return (
    <>
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />All leads</Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">{l.name || "Unnamed lead"}</h1>
        <StatusBadge status={l.status} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Contact</h2>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center gap-2.5"><Phone className="size-4 text-slate-400" /><span className="font-mono">{l.phone}</span>
                {l.alt && <span className="font-mono text-slate-500">· alt {l.alt}</span>}</li>
              {l.email && <li className="flex items-center gap-2.5"><Mail className="size-4 text-slate-400" />{l.email}</li>}
              {l.city && <li className="flex items-center gap-2.5"><MapPin className="size-4 text-slate-400" />{l.city}</li>}
            </ul>
            {session.role !== "super_admin" && <p className="mt-3 text-xs text-slate-400">Full numbers are visible to the Super Admin only.</p>}
          </section>
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Details</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {facts.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-slate-800">{v ?? "—"}</dd></div>)}
            </dl>
          </section>
          {Object.keys(l.extra).length > 0 && (
            <section className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Extra fields</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {Object.entries(l.extra).map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="break-words text-slate-800">{v}</dd></div>)}
              </dl>
            </section>
          )}
          {l.sensitive && (
            <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-amber-900"><Lock className="size-4" />Sensitive (Super Admin only)</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {Object.entries(l.sensitive).map(([k, v]) => <div key={k}><dt className="text-xs text-amber-700">{k}</dt><dd className="break-words text-slate-800">{v}</dd></div>)}
              </dl>
            </section>
          )}
        </div>
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Timeline</h2>
          {l.timeline.length === 0 ? <p className="text-sm text-slate-500">No activity yet.</p> : (
            <ol className="relative space-y-5 border-l border-slate-200 pl-5">
              {l.timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -left-[25px] top-1.5 size-2.5 rounded-full ring-4 ring-white ${DOT[t.kind] ?? "bg-slate-400"}`} />
                  <p className="text-sm text-slate-800">{t.text}</p>
                  <p className="text-xs text-slate-500">{fmt.format(new Date(t.at))}{t.actor ? ` · ${t.actor}` : ""}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
