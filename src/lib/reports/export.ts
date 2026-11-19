import { breakdown, targetRows, winRate, fmtDuration, DIMS, type Dim } from "./build";
import type { RawReport } from "./server";

export type Sheet = { name: string; columns: string[]; rows: (string | number)[][] };
export type LeadRow = {
  name: string | null; phone: string; alt: string | null; email: string | null; city: string | null;
  process: string | null; category: string | null; product: string | null; leadType: string | null; status: string;
  disposition: string | null; agent: string | null; source: string | null; created_at: string; updated_at: string;
  next_followup_at: string | null; extra: Record<string, string>; sensitive: Record<string, string> | null;
};

const CURRENT: Dim[] = ["category", "product", "agent", "status", "lead_type"];
const DETAILED: Dim[] = [...CURRENT, "process", "disposition", "process_disposition", "agent_disposition"];
const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const dt = (s: string | null) => (s ? fmt.format(new Date(s)) : "");

/** Basic report: aggregates only — never a customer name or number. */
export function basicSheets(raw: RawReport, labels: Record<string, string>, targets: Record<string, Record<string, number>>, view: "current" | "detailed"): Sheet[] {
  const k = raw.kpis;
  const summary: Sheet = { name: "Summary", columns: ["Metric", "Value"], rows: [
    ["Total Leads", k.total], ["In Progress", k.in_progress], ["Won", k.won], ["Lost", k.lost], ["Overdue", k.overdue],
    ["Win Rate", `${winRate(k.won, k.lost)}%`], ["Active Agents", k.active_agents], ["Follow-Up Count", k.followups],
    ["Attendance", k.attendance], ["Due Today", k.due_today], ["Calls", k.calls], ["Connected", k.connected],
    ["Total Logged Hours", fmtDuration(raw.hours.seconds)],
  ] };
  const tables: Sheet[] = (view === "current" ? CURRENT : DETAILED).map((d) => {
    const t = breakdown(raw.groups, d, labels);
    const pad = Array(DIMS[d].cols.length - 1).fill("");
    return { name: DIMS[d].title, columns: t.columns, rows: [
      ...t.rows.map((r) => [...r.cells, r.leads, r.followups, r.in_progress, r.won, r.lost, `${r.winRate}%`]),
      ["Total", ...pad, t.total.leads, t.total.followups, t.total.in_progress, t.total.won, t.total.lost, `${t.total.winRate}%`],
    ] };
  });
  if (view === "current") return [summary, ...tables];
  const tr = targetRows(raw.agents, targets);
  return [summary, ...tables,
    { name: "Target vs Achievement", columns: ["Metric", "Actual", "Target", "%"], rows: tr.map((r) => [r.label, r.actual, r.target, `${r.pct}%`]) },
    { name: "Agents", columns: ["Agent", "TL", "Calls", "Connected", ...tr.map((r) => r.label), "Lost", "Logged hours"],
      rows: raw.agents.map((a) => [a.name, a.tl ?? "", a.calls, a.connected, ...tr.map((r) => a[r.metric]), a.lost, fmtDuration(a.seconds)]) },
    { name: "Daily", columns: ["Day", "Calls", "Follow-ups", "Wins"], rows: raw.daily.map((d) => [d.day, d.calls, d.followups, d.wins]) },
    { name: "Dispositions", columns: ["Disposition", "Calls"], rows: raw.dispositions.map((d) => [labels[d.id] ?? "(removed)", d.count]) },
    { name: "Attendance", columns: ["Agent", "Date", "Punch in", "Punch out", "Last activity", "Duration", "Status"],
      rows: raw.attendance.map((a) => [labels[a.user_id] ?? "", a.day, dt(a.punch_in), dt(a.punch_out), dt(a.last_activity), fmtDuration(a.seconds),
        { active: "Active", logged_out: "Logged Out", auto: "Auto Logged Out" }[a.status]]) },
  ];
}

const STATUS: Record<string, string> = { new: "New", in_progress: "In progress", won: "Won", lost: "Lost" };

/** Full Data: one row per lead (Super Admin only). Detailed adds every extra and sensitive field. */
export function leadSheet(leads: LeadRow[], view: "current" | "detailed"): Sheet {
  const base = ["Name", "Phone", "Process", "Product", "Lead Type", "Status", "Disposition", "Agent", "Source", "City", "Created", "Next follow-up"];
  const row = (l: LeadRow) => [l.name ?? "", l.phone, l.process ?? "", l.product ?? "", l.leadType ?? "", STATUS[l.status] ?? l.status,
    l.disposition ?? "", l.agent ?? "", l.source ?? "", l.city ?? "", dt(l.created_at), dt(l.next_followup_at)];
  if (view === "current") return { name: "Leads", columns: base, rows: leads.map(row) };
  const extra = [...new Set(leads.flatMap((l) => Object.keys(l.extra ?? {})))];
  const secret = [...new Set(leads.flatMap((l) => Object.keys(l.sensitive ?? {})))];
  return {
    name: "Leads",
    columns: [...base, "Alternate phone", "Email", "Product Category", "Last updated", ...extra, ...secret.map((s) => `${s} (sensitive)`)],
    rows: leads.map((l) => [...row(l), l.alt ?? "", l.email ?? "", l.category ?? "", dt(l.updated_at),
      ...extra.map((k) => l.extra?.[k] ?? ""), ...secret.map((k) => l.sensitive?.[k] ?? "")]),
  };
}

const cell = (v: string | number) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = "'" + s; // spreadsheet formula injection
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(sheets: Sheet[]): string {
  return sheets.map((s) => [sheets.length > 1 || s.name ? s.name : null, s.columns.map(cell).join(","), ...s.rows.map((r) => r.map(cell).join(","))]
    .filter((x) => x != null).join("\r\n") + "\r\n").join("\r\n");
}

export async function toXlsx(sheets: Sheet[]): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "CallOpps";
  const used = new Set<string>();
  for (const s of sheets) {
    let name = s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
    while (used.has(name)) name = name.slice(0, 28) + " " + used.size;
    used.add(name);
    const ws = wb.addWorksheet(name);
    ws.addRow(s.columns).font = { bold: true };
    // ExcelJS writes values as typed data, so a leading "=" stays text, not a formula.
    for (const r of s.rows) ws.addRow(r);
    ws.columns.forEach((c, i) => { c.width = Math.min(40, Math.max(10, s.columns[i]?.length ?? 10) + 2); });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** "Applied filters" rows for the PDF cover and file headers. */
export function describeFilters(f: import("./filters").ReportFilters, labels: Record<string, string>, rangeLabel: string, access: "basic" | "full"): [string, string][] {
  const list = (ids: string[], all: string) => (ids.length ? ids.map((i) => labels[i] ?? "(removed)").join(", ") : all);
  const st: Record<string, string> = { new: "New", in_progress: "In progress", won: "Won", lost: "Lost" };
  return [
    ["Report type", access === "basic" ? "Basic Report — aggregate management reporting only, no customer-level records" : "Full Data — customer-level records (Super Admin)"],
    ["Date period", rangeLabel],
    ["Process", list(f.processes, "All Processes")], ["Product Category", list(f.categories, "All Product Categories")],
    ["Product", list(f.products, "All Products")], ["Team Leader", list(f.tls, "All TLs")], ["Agent", list(f.agents, "All Agents")],
    ["Agent Status", f.agent_status === "active" ? "Active" : f.agent_status === "deactivated" ? "Deactivated" : "All"],
    ["Status", f.statuses.length ? f.statuses.map((s) => st[s]).join(", ") : "All Statuses"],
    ["Lead Type", list(f.lead_types, "All Lead Types")], ["Disposition", list(f.dispositions, "All Dispositions")],
    ["Source", list(f.sources, "All Sources")], ["City", f.city ?? "All Cities"],
  ];
}
