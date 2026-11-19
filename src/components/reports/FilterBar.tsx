"use client";
import { useRouter, usePathname } from "next/navigation";
import { CalendarDays, RotateCcw } from "lucide-react";
import { filterQuery, PRESETS, type Preset, type ReportFilters } from "@/lib/reports/filters";
import type { FilterOptions } from "@/lib/reports/server";
import { MultiSelect } from "./MultiSelect";

const sel = "h-9 w-full rounded-md border border-input bg-white px-2 text-sm";
const STATUSES = [{ value: "new", label: "New" }, { value: "in_progress", label: "In progress" }, { value: "won", label: "Won" }, { value: "lost", label: "Lost" }];

/** The Reports filter bar (screenshot row 1 and 2). Every change lands in the URL. */
export function FilterBar({ f, opts, showAgentFilters = true }: { f: ReportFilters; opts: FilterOptions; showAgentFilters?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const go = (next: Partial<ReportFilters>) => {
    const q = filterQuery({ ...f, ...next });
    router.push(q ? `${path}?${q}` : path);
  };
  const ms = (k: keyof FilterOptions & keyof ReportFilters, label: string) =>
    <MultiSelect label={label} options={opts[k]} value={f[k] as string[]} onChange={(v) => go({ [k]: v })} />;
  return (
    <div className="mb-6 rounded-xl border bg-white p-3 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-slate-400" />
          <select aria-label="Date range" className={sel} value={f.preset} onChange={(e) => {
            const preset = e.target.value as Preset;
            go(preset === "custom" ? { preset, from: f.from ?? new Date().toISOString().slice(0, 10), to: f.to ?? new Date().toISOString().slice(0, 10) } : { preset, from: undefined, to: undefined });
          }}>
            {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {ms("processes", "All Processes")}
        {ms("categories", "All Product Categories")}
        {ms("products", "All Products")}
        {showAgentFilters && ms("tls", "Team Leaders")}
        {showAgentFilters && ms("agents", "All Agents")}
        {showAgentFilters && (
          <select aria-label="Agent status" className={sel} value={f.agent_status ?? ""} onChange={(e) => go({ agent_status: (e.target.value || undefined) as ReportFilters["agent_status"] })}>
            <option value="">Agent Status: All</option><option value="active">Agent Status: Active</option><option value="deactivated">Agent Status: Deactivated</option>
          </select>
        )}
        <MultiSelect label="All Statuses" options={STATUSES} value={f.statuses} onChange={(v) => go({ statuses: v })} />
        {ms("lead_types", "All lead types")}
        {ms("dispositions", "All Dispositions")}
        {ms("sources", "All Sources")}
        <input aria-label="City" defaultValue={f.city ?? ""} placeholder="City" className={sel}
          onKeyDown={(e) => { if (e.key === "Enter") go({ city: e.currentTarget.value.trim() || undefined }); }}
          onBlur={(e) => { if ((e.target.value.trim() || undefined) !== f.city) go({ city: e.target.value.trim() || undefined }); }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {f.preset === "custom" && (
          <>
            <input type="date" aria-label="From" className={`${sel} w-auto`} value={f.from ?? ""} onChange={(e) => go({ from: e.target.value })} />
            <span className="text-sm text-slate-400">to</span>
            <input type="date" aria-label="To" className={`${sel} w-auto`} value={f.to ?? ""} onChange={(e) => go({ to: e.target.value })} />
          </>
        )}
        <button type="button" onClick={() => router.push(path)} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-slate-600 hover:bg-slate-100">
          <RotateCcw className="size-3.5" />Reset
        </button>
      </div>
    </div>
  );
}
