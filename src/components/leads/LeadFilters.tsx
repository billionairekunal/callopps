import Link from "next/link";
import { Search, RotateCcw } from "lucide-react";
import type { LeadOptions } from "@/lib/leads/queries";
import { STATUS_OPTIONS } from "./StatusBadge";

const field = "h-9 rounded-md border border-input bg-white px-2.5 text-sm text-slate-700";

/** Plain GET form so filters live in the URL (shareable, back-button friendly). */
export function LeadFilters({ opts, sp, showAssignee }: { opts: LeadOptions; sp: Record<string, string | undefined>; showAssignee: boolean }) {
  return (
    <form className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 shadow-sm">
      <label className="relative min-w-56 flex-1">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" />
        <input name="q" defaultValue={sp.q} placeholder="Name, full number or last 4 digits" className={`${field} w-full pl-8`} />
      </label>
      <select name="status" defaultValue={sp.status ?? ""} className={field} aria-label="Status">
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <select name="process" defaultValue={sp.process ?? ""} className={field} aria-label="Process">
        <option value="">All processes</option>
        {opts.processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {showAssignee && (
        <select name="assigned" defaultValue={sp.assigned ?? ""} className={field} aria-label="Assigned to">
          <option value="">Anyone</option>
          <option value="unassigned">Unassigned</option>
          {opts.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
        </select>
      )}
      <select name="source" defaultValue={sp.source ?? ""} className={field} aria-label="Source list">
        <option value="">All sources</option>
        {opts.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <input name="city" defaultValue={sp.city} placeholder="City" className={`${field} w-28`} aria-label="City" />
      <button className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90">Apply</button>
      <Link href="?" className="inline-flex h-9 items-center gap-1 px-2 text-sm text-slate-500 hover:text-slate-800"><RotateCcw className="size-3.5" />Reset</Link>
    </form>
  );
}
