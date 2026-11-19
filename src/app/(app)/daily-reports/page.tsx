import { requireRole } from "@/lib/auth/session";
import { parseFilters } from "@/lib/reports/filters";
import { runReport } from "@/lib/reports/server";
import { fmtDuration } from "@/lib/reports/build";
import { PageHeader } from "@/components/shell/PageHeader";
import { ActivityTiles, card } from "@/components/reports/Sections";

const time = new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" });

export default async function DailyReports({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const s = await requireRole("super_admin", "admin", "team_leader");
  const d = (await searchParams).date;
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today ? d : today;
  const { raw } = await runReport(s, { ...parseFilters({}), preset: "custom", from: date, to: date });
  const first = Object.fromEntries(raw.attendance.map((a) => [a.user_id, a.punch_in]));
  const agents = [...raw.agents].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
  const sum = (k: "calls" | "connected" | "followup_calls" | "closures" | "lost" | "fresh_connected") => agents.reduce((n, a) => n + a[k], 0);
  const cols = ["calls", "connected", "fresh_connected", "followup_calls", "closures", "lost"] as const;
  return (
    <>
      <PageHeader title="Daily Reports" subtitle="Per-agent calls, connected, follow-ups, won and lost for one day." actions={
        <form className="flex items-center gap-2">
          <input type="date" name="date" defaultValue={date} max={today} aria-label="Date" className="h-9 rounded-md border px-2 text-sm" />
          <button className="h-9 rounded-md border bg-white px-3 text-sm hover:bg-slate-50">Show</button>
        </form>
      } />
      <ActivityTiles k={raw.kpis} />
      <section className={card}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="bg-slate-900 text-left text-xs text-white">
              <th className="px-3 py-2">Agent</th><th className="px-3">TL</th><th className="px-3">First punch-in</th>
              {["Calls", "Connected", "Fresh connected", "Follow-ups", "Won", "Lost"].map((h) => <th key={h} className="px-3 text-right">{h}</th>)}
              <th className="px-3 text-right">Logged</th></tr></thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className={`border-b ${a.calls === 0 && !first[a.id] ? "text-slate-400" : ""}`}>
                  <td className="px-3 py-1.5 font-medium">{a.name}</td><td className="px-3">{a.tl ?? "—"}</td>
                  <td className="px-3">{first[a.id] ? time.format(new Date(first[a.id])) : "—"}</td>
                  {cols.map((k) => <td key={k} className="px-3 text-right tabular-nums">{a[k]}</td>)}
                  <td className="px-3 text-right">{a.seconds ? fmtDuration(a.seconds) : "—"}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold"><td className="px-3 py-2" colSpan={3}>Total</td>
                {cols.map((k) => <td key={k} className="px-3 text-right tabular-nums">{sum(k)}</td>)}
                <td className="px-3 text-right">{fmtDuration(agents.reduce((n, a) => n + a.seconds, 0))}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
