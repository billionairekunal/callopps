"use client";
import type { LeadListRow, LeadOptions } from "@/lib/leads/queries";
import { LeadTable } from "./LeadTable";

/** Lead table plus the bulk bar. Bulk assign is wired in the transfers task. */
export function LeadsTableWithBulk({ rows, canAssign }: { rows: LeadListRow[]; people: LeadOptions["people"]; canAssign: boolean }) {
  return <LeadTable rows={rows} selectable={canAssign} />;
}
