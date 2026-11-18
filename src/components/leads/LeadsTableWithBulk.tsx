"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { LeadListRow, LeadOptions } from "@/lib/leads/queries";
import { assignLeads } from "@/app/(app)/lead-transfers/actions";
import { LeadTable } from "./LeadTable";

/** Lead table plus the bulk "Assign to…" bar. */
export function LeadsTableWithBulk({ rows, people, canAssign }: { rows: LeadListRow[]; people: LeadOptions["people"]; canAssign: boolean }) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [pending, start] = useTransition();
  return (
    <LeadTable rows={rows} selectable={canAssign} bulk={(ids, clear) => (
      <span className="flex items-center gap-2">
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Assign selected leads to"
          className="h-8 rounded-md border border-input bg-white px-2 text-sm">
          <option value="">Assign to…</option>
          {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
        </select>
        <Button size="sm" disabled={!to || pending} onClick={() => start(async () => {
          const r = await assignLeads(ids, to);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.data.moved ? `${r.data.moved} lead${r.data.moved === 1 ? "" : "s"} assigned` : "Already assigned to that person");
          clear(); setTo(""); router.refresh();
        })}>{pending ? "Assigning…" : "Assign"}</Button>
      </span>
    )} />
  );
}
