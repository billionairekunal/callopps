"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveTargets } from "@/app/(app)/targets/actions";
import { METRICS } from "@/lib/reports/build";

type Row = { userId: string; name: string; tl: string | null; values: Record<string, number | null> };

export function TargetsGrid({ month, rows: initial }: { month: string; rows: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [pending, start] = useTransition();
  const set = (i: number, m: string, v: string) => setRows((rs) => rs.map((r, j) => j === i ? { ...r, values: { ...r.values, [m]: v === "" ? null : Math.max(0, Math.floor(Number(v))) } } : r));
  const fill = (m: string) => { const v = rows[0]?.values[m] ?? null; setRows((rs) => rs.map((r) => ({ ...r, values: { ...r.values, [m]: v } }))); };
  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <input type="month" aria-label="Month" defaultValue={month} className="h-9 rounded-md border px-2 text-sm" onChange={(e) => e.target.value && router.push(`/targets?month=${e.target.value}`)} />
        <Button disabled={pending} onClick={() => start(async () => {
          const r = await saveTargets({ month, rows: rows.map((x) => ({ userId: x.userId, values: x.values })) });
          if (r.ok) toast.success("Targets saved"); else toast.error(r.error);
        })}>{pending ? "Saving…" : "Save targets"}</Button>
      </div>
      {rows.length === 0 ? <p className="p-6 text-sm text-slate-500">No agents yet. Add callers in CRM Setup.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500">
              <th className="px-4 py-2">Agent</th><th>TL</th>
              {METRICS.map(([m, l]) => <th key={m} className="px-2 text-right">{l}<button type="button" onClick={() => fill(m)} className="ml-1 font-normal text-rose-700 hover:underline" title="Copy the first row's value to everyone">fill ↓</button></th>)}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.userId} className="border-b last:border-0">
                  <td className="px-4 py-1.5 font-medium text-slate-900">{r.name}</td><td className="text-slate-500">{r.tl ?? "—"}</td>
                  {METRICS.map(([m, l]) => (
                    <td key={m} className="px-2 py-1"><input type="number" min={0} inputMode="numeric" aria-label={`${l} for ${r.name}`}
                      value={r.values[m] ?? ""} onChange={(e) => set(i, m, e.target.value)} className="h-8 w-24 rounded-md border px-2 text-right tabular-nums" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t px-4 py-2 text-xs text-slate-500">Monthly targets. Reports pro-rate them by the days of the selected range. WhatsApp Sent counts start with Communications.</p>
    </div>
  );
}
