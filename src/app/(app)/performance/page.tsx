import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { parseFilters, filterQuery } from "@/lib/reports/filters";
import { runReport, filterOptions } from "@/lib/reports/server";
import { fmtDuration, winRate } from "@/lib/reports/build";
import { PageHeader } from "@/components/shell/PageHeader";
import { FilterBar } from "@/components/reports/FilterBar";
import { TrendChart } from "@/components/reports/TrendChart";
import { card } from "@/components/reports/Sections";

export default async function Performance({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireRole("super_admin", "admin", "team_leader", "caller");
  const sp = await searchParams;
  const f = parseFilters(sp);
  const [{ raw, range }, opts] = await Promise.all([runReport(s, f), filterOptions(s)]);
  const board = [...raw.agents].sort((a, b) => b.closures - a.closures || b.connected - a.connected || a.name.localeCompare(b.name));
  const pick = typeof sp.agent === "string" ? sp.agent : s.role === "caller" ? s.userId : board[0]?.id;
  const focus = board.find((a) => a.id === pick);
  const trend = focus ? (await runReport(s, { ...f, agents: [focus.id] })).raw.daily : [];
  const q = filterQuery(f);
  return (
    <>
      <PageHeader title="Performance" subtitle={s.role === "caller" ? "Your numbers for the selected range." : "Agent leaderboard and per-agent trend."} />
      <FilterBar f={f} opts={opts} showAgentFilters={s.role !== "caller"} />
      <p className="-mt-3 mb-4 text-xs text-slate-500">{range.label}</p>
      <section className={`${card} mb-6`}>
        <h2 className="mb-3 font-semibold text-slate-900">Leaderboard</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500">
              <th className="py-2">#</th><th>Agent</th><th>TL</th>
              {["Calls", "Connected", "Connect %", "Follow-ups", "Closures", "Lost", "Win Rate", "Logged"].map((h) => <th key={h} className="text-right">{h}</th>)}</tr></thead>
            <tbody>
              {board.map((a, i) => (
                <tr key={a.id} className={`border-b last:border-0 ${a.id === focus?.id ? "bg-rose-50" : ""}`}>
                  <td className="py-1.5 text-slate-400">{i + 1}</td>
                  <td><Link href={`/performance?${q}${q ? "&" : ""}agent=${a.id}`} className="font-medium text-slate-900 hover:text-rose-700">{a.name}</Link></td>
                  <td className="text-slate-500">{a.tl ?? "—"}</td>
                  <td className="text-right tabular-nums">{a.calls}</td><td className="text-right tabular-nums">{a.connected}</td>
                  <td className="text-right tabular-nums">{a.calls ? Math.round((a.connected / a.calls) * 100) : 0}%</td>
                  <td className="text-right tabular-nums">{a.followup_calls}</td><td className="text-right font-semibold tabular-nums">{a.closures}</td>
                  <td className="text-right tabular-nums">{a.lost}</td><td className="text-right tabular-nums">{winRate(a.closures, a.lost)}%</td>
                  <td className="text-right">{a.seconds ? fmtDuration(a.seconds) : "—"}</td>
                </tr>
              ))}
              {board.length === 0 && <tr><td colSpan={11} className="py-6 text-center text-slate-500">No agents in this view.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {focus && (
        <section className={card}>
          <h2 className="mb-3 font-semibold text-slate-900">{focus.name} — follow-ups vs wins</h2>
          <TrendChart data={trend} />
        </section>
      )}
    </>
  );
}
