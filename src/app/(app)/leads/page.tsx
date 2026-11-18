import Link from "next/link";
import { Upload } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { listLeads, leadOptions, PAGE_SIZE } from "@/lib/leads/queries";
import { PageHeader } from "@/components/shell/PageHeader";
import { LeadFilters } from "@/components/leads/LeadFilters";
import { LeadsTableWithBulk } from "@/components/leads/LeadsTableWithBulk";
import { AddLeadDialog } from "@/components/leads/AddLeadDialog";

type SP = { q?: string; status?: string; process?: string; assigned?: string; source?: string; city?: string; page?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireRole("super_admin", "admin", "team_leader");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [opts, { rows, total }] = await Promise.all([
    leadOptions(),
    listLeads(session, { q: sp.q, status: sp.status, processId: sp.process, assignedTo: sp.assigned, sourceId: sp.source, city: sp.city, page }),
  ]);
  const isAdmin = session.role === "super_admin" || session.role === "admin";
  const last = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Lead Management" subtitle={`${total.toLocaleString("en-IN")} leads${session.role === "super_admin" ? " · full numbers visible to Super Admin" : ""}`}
        actions={isAdmin && (
          <div className="flex gap-2">
            <AddLeadDialog opts={opts} />
            <Link href="/leads/import" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-white hover:bg-primary/90">
              <Upload className="size-4" />Import
            </Link>
          </div>
        )} />
      <LeadFilters opts={opts} sp={sp} showAssignee />
      <LeadsTableWithBulk rows={rows} people={opts.people} canAssign />
      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <span>Page {page} of {last}</span>
        <span className="flex gap-3">
          {page > 1 && <Link className="font-medium text-rose-600" href={href(page - 1)}>← Previous</Link>}
          {page < last && <Link className="font-medium text-rose-600" href={href(page + 1)}>Next →</Link>}
        </span>
      </div>
    </>
  );
}
