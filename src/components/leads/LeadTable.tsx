"use client";
import Link from "next/link";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { LeadListRow } from "@/lib/leads/queries";
import { StatusBadge } from "./StatusBadge";

const fmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });

export function LeadTable({ rows, selectable, bulk }: {
  rows: LeadListRow[]; selectable: boolean;
  bulk?: (ids: string[], clear: () => void) => React.ReactNode;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      {selectable && sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b bg-rose-50/60 px-4 py-2 text-sm">
          <span className="font-medium text-rose-900">{sel.size} selected</span>
          {bulk?.([...sel], () => setSel(new Set()))}
          <button className="ml-auto text-slate-500 hover:text-slate-800" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              {selectable && <th className="w-10 px-4 py-2.5"><Checkbox checked={all} aria-label="Select all on this page"
                onCheckedChange={(c) => setSel(c ? new Set(rows.map((r) => r.id)) : new Set())} /></th>}
              {["Name", "Phone", "City", "Process", "Product", "Type", "Status", "Disposition", "Assigned to", "Source", "Added"].map((h) =>
                <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && <tr><td colSpan={12} className="px-4 py-12 text-center text-slate-500">No leads match these filters.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70">
                {selectable && <td className="px-4 py-2.5"><Checkbox checked={sel.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Select ${r.name ?? r.phone}`} /></td>}
                <td className="px-3 py-2.5"><Link href={`/leads/${r.id}`} className="font-medium text-slate-900 hover:text-rose-600">{r.name || "Unnamed"}</Link></td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[13px] text-slate-700">{r.phone}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.city ?? "—"}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.process ?? "—"}</td>
                <td className="max-w-40 truncate px-3 py-2.5 text-slate-600" title={r.product ?? ""}>{r.product ?? "—"}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.leadType ?? "—"}</td>
                <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="max-w-44 truncate px-3 py-2.5 text-slate-600" title={r.disposition ?? ""}>{r.disposition ?? "—"}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.assignedName ?? <span className="text-amber-600">Unassigned</span>}</td>
                <td className="max-w-36 truncate px-3 py-2.5 text-slate-500" title={r.source ?? ""}>{r.source ?? "Manual"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{fmt.format(new Date(r.created_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
