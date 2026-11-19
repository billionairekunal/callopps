import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { parseFilters, filterQuery } from "@/lib/reports/filters";
import { runReport, filterOptions } from "@/lib/reports/server";
import { breakdown, type Dim } from "@/lib/reports/build";
import { PageHeader } from "@/components/shell/PageHeader";
import { FilterBar } from "@/components/reports/FilterBar";
import { BreakdownTable, card } from "@/components/reports/Sections";

const DIMS: Dim[] = ["category", "product", "agent", "status", "lead_type", "disposition"];

export default async function ProcessBusiness({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireRole("super_admin", "admin", "team_leader");
  const f = parseFilters(await searchParams);
  const [{ raw, range, labels }, opts] = await Promise.all([runReport(s, f), filterOptions(s)]);
  const per = breakdown(raw.groups, "process", labels);
  const pid = f.processes.length === 1 ? f.processes[0] : null;
  return (
    <>
      <PageHeader title="Process Business" subtitle="Breakdown tables per process (campaign). Pick one process to see its full breakdown." />
      <FilterBar f={f} opts={opts} />
      <p className="-mt-3 mb-4 text-xs text-slate-500">{range.label}</p>
      <section className={`${card} mb-6`}>
        <h2 className="mb-3 font-semibold text-rose-800">By Process</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="bg-slate-900 text-left text-xs text-white">{per.columns.map((c, i) => <th key={c} className={`px-3 py-2 ${i ? "text-right" : ""}`}>{c}</th>)}</tr></thead>
            <tbody>
              {raw.groups.filter((g) => g.dim === "process").map((g) => {
                const row = per.rows.find((r) => r.cells[0] === (g.a ? labels[g.a] ?? "(removed)" : "No Process"))!;
                return (
                  <tr key={g.a ?? "none"} className={`border-b ${g.a === pid ? "bg-rose-50" : ""}`}>
                    <td className="px-3 py-1.5">{g.a ? <Link className="text-rose-700 hover:underline" href={`/process-business?${filterQuery({ ...f, processes: [g.a] })}`}>{row.cells[0]}</Link> : row.cells[0]}</td>
                    {[row.leads, row.followups, row.in_progress, row.won, row.lost].map((v, j) => <td key={j} className="px-3 text-right tabular-nums">{v.toLocaleString("en-IN")}</td>)}
                    <td className="px-3 text-right">{row.winRate}%</td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50 font-semibold"><td className="px-3 py-2">Total</td>
                {[per.total.leads, per.total.followups, per.total.in_progress, per.total.won, per.total.lost].map((v, j) => <td key={j} className="px-3 text-right tabular-nums">{v.toLocaleString("en-IN")}</td>)}
                <td className="px-3 text-right">{per.total.winRate}%</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      {pid ? DIMS.map((d) => <BreakdownTable key={d} raw={raw} dim={d} labels={labels} />)
        : <p className="text-sm text-slate-500">Click a process above for its breakdown by category, product, agent, status, lead type and disposition.</p>}
    </>
  );
}
