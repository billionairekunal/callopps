"use client";
import { usePathname, useRouter } from "next/navigation";
import { filterQuery, type ReportFilters } from "@/lib/reports/filters";
import type { FilterOptions } from "@/lib/reports/server";
import { MultiSelect } from "./MultiSelect";

export function BreakdownFilters({ f, opts }: { f: ReportFilters; opts: FilterOptions }) {
  const router = useRouter();
  const path = usePathname();
  const go = (next: Partial<ReportFilters>) => router.push(`${path}?${filterQuery({ ...f, ...next })}#dispositions`, { scroll: false });
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-2.5 shadow-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Breakdown filters</span>
      <div className="w-56"><MultiSelect label="All Processes" options={opts.processes} value={f.b_processes} onChange={(v) => go({ b_processes: v })} /></div>
      <div className="w-56"><MultiSelect label="All Dispositions" options={opts.dispositions} value={f.b_dispositions} onChange={(v) => go({ b_dispositions: v })} /></div>
    </div>
  );
}
