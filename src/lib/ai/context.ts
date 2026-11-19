import { breakdown, winRate, type Dim } from "@/lib/reports/build";
import type { RawReport } from "@/lib/reports/server";

const DIMS: Dim[] = ["process", "category", "product", "agent", "status", "lead_type", "disposition"];

/**
 * What Ops AI is allowed to see (§7.12): report aggregates with display names.
 * Built field by field from an allow-list, so ids, lead ids and contact data can never slip through.
 */
export function aiContext(periods: { label: string; raw: RawReport }[], labels: Record<string, string>) {
  return periods.map(({ label, raw }) => {
    const k = raw.kpis;
    return {
      period: label,
      kpis: {
        total_leads: k.total, in_progress: k.in_progress, won: k.won, lost: k.lost, win_rate_pct: winRate(k.won, k.lost),
        overdue_followups: k.overdue, due_today: k.due_today, active_agents: k.active_agents, followup_calls: k.followups,
        attendance_agent_days: k.attendance, calls: k.calls, connected_calls: k.connected,
        logged_hours: Math.round(raw.hours.seconds / 360) / 10,
      },
      breakdowns: Object.fromEntries(DIMS.map((d) => [d, breakdown(raw.groups, d, labels).rows.slice(0, 40).map((r) => ({
        name: r.cells.join(" / "), leads: r.leads, followups: r.followups, in_progress: r.in_progress, won: r.won, lost: r.lost, win_rate_pct: r.winRate,
      }))])),
      agents: raw.agents.map((a) => ({
        name: a.name, team_leader: a.tl, calls: a.calls, connected: a.connected, fresh_connected: a.fresh_connected,
        followup_calls: a.followup_calls, presentations: a.presentations, whatsapp_sent: a.whatsapp_sent, new_leads: a.leads,
        closures: a.closures, lost: a.lost, logged_hours: Math.round(a.seconds / 360) / 10,
      })),
      dispositions: raw.dispositions.map((d) => ({ name: labels[d.id] ?? "(removed)", calls: d.count })),
      daily: raw.daily.map((d) => ({ day: d.day, calls: d.calls, followups: d.followups, wins: d.wins })),
    };
  });
}
