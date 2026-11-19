import Link from "next/link";
import {
  Users, BarChart3, Trophy, XCircle, Clock, Percent, UserCheck, FileText, UserRound, CalendarDays, ArrowUpRight,
  ListChecks, Phone, PhoneCall, type LucideIcon,
} from "lucide-react";
import { breakdown, funnel, targetRows, fmtDuration, winRate, type Dim } from "@/lib/reports/build";
import type { RawReport } from "@/lib/reports/server";

const time = new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" });
const date = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const n = (v: number) => v.toLocaleString("en-IN");
export const card = "rounded-xl border bg-white p-5 shadow-sm";

type Kpi = { label: string; value: string; icon: LucideIcon; tone: string; bar: string; href?: string; tip: string };

export function KpiCards({ k, leadsHref }: { k: RawReport["kpis"]; leadsHref: (status?: string) => string }) {
  const cards: Kpi[] = [
    { label: "Total Leads", value: n(k.total), icon: Users, tone: "text-slate-900", bar: "border-t-slate-800", href: leadsHref(), tip: "Leads created in the date range." },
    { label: "In Progress", value: n(k.in_progress), icon: BarChart3, tone: "text-slate-900", bar: "border-t-amber-500", href: leadsHref("in_progress"), tip: "Leads now In progress whose last status change is in range." },
    { label: "Won", value: n(k.won), icon: Trophy, tone: "text-emerald-700", bar: "border-t-emerald-600", href: leadsHref("won"), tip: "Leads now Won whose last status change is in range." },
    { label: "Lost", value: n(k.lost), icon: XCircle, tone: "text-rose-600", bar: "border-t-rose-600", href: leadsHref("lost"), tip: "Leads now Lost whose last status change is in range." },
    { label: "Overdue", value: n(k.overdue), icon: Clock, tone: "text-rose-600", bar: "border-t-rose-400", href: "/follow-ups", tip: "Open follow-ups whose due time has passed." },
    { label: "Win Rate", value: `${winRate(k.won, k.lost)}%`, icon: Percent, tone: "text-slate-900", bar: "border-t-slate-800", tip: "Won ÷ (Won + Lost)." },
    { label: "Active Agents", value: n(k.active_agents), icon: UserCheck, tone: "text-slate-900", bar: "border-t-slate-800", href: "#agents", tip: "Agents with a saved call or a punch-in in range." },
    { label: "Follow-Up Count", value: n(k.followups), icon: FileText, tone: "text-slate-900", bar: "border-t-slate-800", href: "#dispositions", tip: "Calls saved in range on leads that already had an earlier call." },
    { label: "Attendance", value: n(k.attendance), icon: UserRound, tone: "text-slate-900", bar: "border-t-slate-800", href: "#attendance", tip: "Agent-days with a punch-in in range." },
    { label: "Due Today", value: n(k.due_today), icon: CalendarDays, tone: "text-amber-700", bar: "border-t-amber-500", href: "/follow-ups", tip: "Open follow-ups still due today." },
  ];
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} title={c.tip} className={`rounded-xl border border-t-4 bg-white p-4 shadow-sm ${c.bar}`}>
          <div className="flex items-start justify-between text-sm text-slate-600">{c.label}<c.icon className="size-4 text-slate-400" /></div>
          <div className={`mt-1 text-2xl font-semibold md:text-3xl ${c.tone}`}>{c.value}</div>
          {c.href ? <Link href={c.href} className="mt-1 inline-flex items-center gap-0.5 text-xs text-slate-500 hover:text-rose-700">View details<ArrowUpRight className="size-3" /></Link>
            : <span className="mt-1 block text-xs text-slate-400">{c.tip}</span>}
        </div>
      ))}
    </div>
  );
}

const FUNNEL_ICON = [Users, FileText, BarChart3, Trophy];
export function Funnel({ k }: { k: RawReport["kpis"] }) {
  const steps = funnel(k);
  return (
    <section className={`${card} mb-6`}>
      <h2 className="mb-4 font-semibold text-slate-900">Lead Funnel</h2>
      <ol className="space-y-1.5">
        {steps.map((s, i) => {
          const Icon = FUNNEL_ICON[i];
          return (
            <li key={s.label} className="flex items-center gap-3">
              <span className="w-6 text-xs text-slate-400">{String(i + 1).padStart(2, "0")}</span>
              <div className="flex flex-1 justify-center">
                <div className="flex h-10 items-center justify-center gap-2 text-sm font-medium text-white"
                  style={{ width: `${100 - i * 12}%`, background: ["#1e293b", "#7f1d1d", "#be123c", "#e11d48"][i], clipPath: "polygon(0 0, 100% 0, 96% 100%, 4% 100%)" }}>
                  {s.label}<Icon className="size-4 opacity-80" />
                </div>
              </div>
              <span className="w-20 text-right font-semibold text-slate-900">{n(s.value)}</span>
              <span className="w-28 text-xs text-slate-500">{s.pct}% of total</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-slate-400">Touched Follow-up counts follow-up calls, so it can pass 100%.</p>
    </section>
  );
}

export function TargetsSection({ raw, targets, rangeLabel }: { raw: RawReport; targets: Record<string, Record<string, number>>; rangeLabel: string }) {
  const rows = targetRows(raw.agents, targets);
  return (
    <section className={`${card} mb-6`}>
      <h2 className="font-semibold text-slate-900">Target vs Achievement</h2>
      <p className="mb-4 text-xs text-slate-500">{rangeLabel} · targets pro-rated for the selected range</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {rows.map((r) => (
          <div key={r.metric} className="rounded-lg border p-3">
            <div className="flex justify-between text-xs text-slate-600"><span>{r.label}</span><span className="text-rose-700">{r.pct}%</span></div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{n(r.actual)}</div>
            <div className="text-xs text-slate-400">/ {n(r.target)}</div>
            <div className="mt-2 h-1 rounded-full bg-slate-100"><div className="h-1 rounded-full bg-rose-600" style={{ width: `${Math.min(100, r.pct)}%` }} /></div>
          </div>
        ))}
      </div>
      <details className="mt-4" id="agents">
        <summary className="cursor-pointer text-sm text-slate-600">Agent-wise breakdown · {raw.agents.length} agents</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Agent</th><th>TL</th>
              {rows.map((r) => <th key={r.metric} className="text-right">{r.label}</th>)}</tr></thead>
            <tbody>
              {raw.agents.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2 text-slate-900">{a.name}</td><td className="text-slate-500">{a.tl ?? "—"}</td>
                  {rows.map((r) => <td key={r.metric} className="text-right tabular-nums">{n(a[r.metric])}<span className="text-slate-400"> / {n(targets[a.id]?.[r.metric] ?? 0)}</span></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export function DispositionBars({ raw, labels }: { raw: RawReport; labels: Record<string, string> }) {
  const max = Math.max(1, ...raw.dispositions.map((d) => d.count));
  return (
    <section id="dispositions" className={`${card} mb-6`}>
      <h2 className="font-semibold text-slate-900">Disposition Breakdown</h2>
      <p className="mb-4 text-xs text-slate-500">Saved calls by disposition — click a row to view its leads</p>
      {raw.dispositions.length === 0 ? <p className="text-sm text-slate-500">No calls with a disposition in range.</p> : (
        <ul className="space-y-1">
          {raw.dispositions.map((d) => (
            <li key={d.id}>
              <Link href={`/leads?disposition=${d.id}`} title={`${labels[d.id] ?? "Disposition"}: ${d.count}`} className="grid grid-cols-[minmax(0,14rem)_1fr_3rem] items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-rose-50">
                <span className="truncate text-slate-700">{labels[d.id] ?? "(removed)"}</span>
                <span className="h-1.5 rounded-full bg-slate-100"><span className="block h-1.5 rounded-full bg-rose-700" style={{ width: `${(d.count / max) * 100}%` }} /></span>
                <span className="text-right tabular-nums text-slate-900">{n(d.count)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function HoursStats({ h }: { h: RawReport["hours"] }) {
  const tiles = [
    ["Total Logged Hours", fmtDuration(h.seconds), "Punch-in to punch-out (or last activity)"],
    ["Active Now", n(h.active_now), "Live in the last 15 min"],
    ["First Login", h.first_login ? time.format(new Date(h.first_login)) : "—", h.first_login ? date.format(new Date(h.first_login)) : ""],
    ["Last Activity", h.last_activity ? time.format(new Date(h.last_activity)) : "—", h.last_activity ? date.format(new Date(h.last_activity)) : ""],
  ];
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {tiles.map(([l, v, s]) => <div key={l} className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{l}</div>
        <div className="mt-1 text-xl font-semibold text-slate-900">{v}</div><div className="text-xs text-slate-400">{s}</div></div>)}
    </div>
  );
}

const ST: Record<string, [string, string]> = {
  active: ["Active", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
  logged_out: ["Logged Out", "bg-slate-100 text-slate-600 ring-slate-200"],
  auto: ["Auto Logged Out", "bg-amber-50 text-amber-700 ring-amber-200"],
};
export function AttendanceTable({ raw, labels }: { raw: RawReport; labels: Record<string, string> }) {
  const tl = Object.fromEntries(raw.agents.map((a) => [a.id, a.tl]));
  return (
    <section id="attendance" className={`${card} mb-6`}>
      <h2 className="font-semibold text-slate-900">Attendance Summary</h2>
      <p className="mb-4 text-xs text-slate-500">One row per agent per day · {new Set(raw.attendance.map((a) => a.user_id)).size} agents · {raw.attendance.length} agent-days</p>
      {raw.attendance.length === 0 ? <p className="text-sm text-slate-500">No punch-ins in range.</p> : (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 bg-white"><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Agent</th><th>TL</th><th>Date</th><th>Punch in</th><th>Punch out</th><th>Last activity</th><th>Duration</th><th>Status</th></tr></thead>
            <tbody>
              {raw.attendance.map((a) => (
                <tr key={a.user_id + a.day} className="border-b last:border-0">
                  <td className="py-2 font-medium text-slate-900">{labels[a.user_id] ?? "—"}</td><td className="text-slate-500">{tl[a.user_id] ?? "—"}</td>
                  <td>{date.format(new Date(a.day + "T12:00:00Z"))}</td><td>{time.format(new Date(a.punch_in))}</td>
                  <td>{a.punch_out ? time.format(new Date(a.punch_out)) : <span className="text-slate-400">In progress</span>}</td>
                  <td>{time.format(new Date(a.last_activity))}</td><td>{fmtDuration(a.seconds)}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${ST[a.status][1]}`}>{ST[a.status][0]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function BreakdownTable({ raw, dim, labels }: { raw: RawReport; dim: Dim; labels: Record<string, string> }) {
  const t = breakdown(raw.groups, dim, labels);
  return (
    <section className={`${card} mb-6`}>
      <h2 className="mb-3 font-semibold text-rose-800">{t.title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="bg-slate-900 text-left text-xs text-white">
            {t.columns.map((c, i) => <th key={c} className={`px-3 py-2 ${i >= t.columns.length - 6 ? "text-right" : ""}`}>{c}</th>)}</tr></thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i} className="border-b">
                {r.cells.map((c, j) => <td key={j} className="px-3 py-1.5 text-slate-800">{c}</td>)}
                {[r.leads, r.followups, r.in_progress, r.won, r.lost].map((v, j) => <td key={j} className="px-3 text-right tabular-nums">{n(v)}</td>)}
                <td className="px-3 text-right tabular-nums">{r.winRate}%</td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td className="px-3 py-2" colSpan={t.columns.length - 6}>Total</td>
              {[t.total.leads, t.total.followups, t.total.in_progress, t.total.won, t.total.lost].map((v, j) => <td key={j} className="px-3 text-right tabular-nums">{n(v)}</td>)}
              <td className="px-3 text-right tabular-nums">{t.total.winRate}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ActivityTiles({ k }: { k: RawReport["kpis"] }) {
  return (
    <div className="mb-6 grid grid-cols-3 gap-3">
      {([["Calls", k.calls, Phone], ["Connected", k.connected, PhoneCall], ["Follow-ups", k.followups, ListChecks]] as const).map(([l, v, I]) => (
        <div key={l} className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex justify-between text-xs text-slate-500">{l}<I className="size-4 text-slate-400" /></div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{n(v)}</div></div>
      ))}
    </div>
  );
}
