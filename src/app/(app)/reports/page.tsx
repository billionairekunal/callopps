import { requireRole } from "@/lib/auth/session";
import { parseFilters, filterQuery } from "@/lib/reports/filters";
import { runReport, filterOptions } from "@/lib/reports/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { FilterBar } from "@/components/reports/FilterBar";
import { KpiCards, Funnel, TargetsSection, DispositionBars, HoursStats, AttendanceTable, card } from "@/components/reports/Sections";
import { TrendChart } from "@/components/reports/TrendChart";
import { BreakdownFilters } from "@/components/reports/BreakdownFilters";
import { DownloadDialog } from "@/components/reports/DownloadDialog";
import { SavedReports } from "@/components/reports/SavedReports";

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireRole("super_admin", "admin", "team_leader");
  const f = parseFilters(await searchParams);
  const [{ raw, range, targets, labels }, opts, saved] = await Promise.all([
    runReport(session, f), filterOptions(session),
    (await createClient()).from("saved_reports").select("id, name, filters, created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  const one = (k: "processes" | "statuses") => (f[k].length === 1 ? f[k][0] : undefined);
  const leadsHref = (status?: string) => {
    const q = new URLSearchParams();
    const st = status ?? one("statuses"); if (st) q.set("status", st);
    const p = one("processes"); if (p) q.set("process", p);
    return `/leads${q.size ? `?${q}` : ""}`;
  };
  const admin = session.role === "super_admin" || session.role === "admin";
  return (
    <>
      <PageHeader title="Reports and Analytics" subtitle="Unified reporting — pipeline, conversion & productivity" actions={
        <div className="flex items-center gap-2">
          <SavedReports saved={(saved.data ?? []).map((s) => ({ id: s.id, name: s.name, query: filterQuery(parseFilters(s.filters)), created_at: s.created_at }))} query={filterQuery(f)} />
          {admin && <DownloadDialog query={filterQuery(f)} canFull={session.role === "super_admin"} />}
        </div>
      } />
      <FilterBar f={f} opts={opts} />
      <p className="-mt-3 mb-4 text-xs text-slate-500">{range.label}{session.role === "team_leader" ? " · your team only" : ""}</p>
      <KpiCards k={raw.kpis} leadsHref={leadsHref} />
      <Funnel k={raw.kpis} />
      <section className={`${card} mb-6`}>
        <h2 className="mb-3 font-semibold text-slate-900">Follow-ups vs Wins</h2>
        <TrendChart data={raw.daily} />
      </section>
      <TargetsSection raw={raw} targets={targets} rangeLabel={range.label} />
      <BreakdownFilters f={f} opts={opts} />
      <DispositionBars raw={raw} labels={labels} />
      <HoursStats h={raw.hours} />
      <AttendanceTable raw={raw} labels={labels} />
    </>
  );
}
