/** Pure shaping of report_data output into what the screens and files show. */
export type Group = { dim: string; a: string | null; b: string | null; s: string | null; leads: number; followups: number; in_progress: number; won: number; lost: number };
export type Counts = { leads: number; followups: number; in_progress: number; won: number; lost: number; winRate: number };
export type Table = { title: string; columns: string[]; rows: ({ cells: string[] } & Counts)[]; total: Counts };

export const winRate = (won: number, lost: number) => (won + lost ? Math.round((won / (won + lost)) * 100) : 0);
const counts = (g: Pick<Group, "leads" | "followups" | "in_progress" | "won" | "lost">): Counts => ({
  leads: g.leads, followups: g.followups, in_progress: g.in_progress, won: g.won, lost: g.lost, winRate: winRate(g.won, g.lost),
});

const STATUS: Record<string, string> = { new: "New", in_progress: "In progress", won: "Won", lost: "Lost" };
export const DIMS = {
  category: { title: "Product Category", cols: ["Product Category"], empty: ["No Category"] },
  product: { title: "Product", cols: ["Product"], empty: ["No Product"] },
  agent: { title: "Agent", cols: ["Agent"], empty: ["Unassigned"] },
  status: { title: "Status", cols: ["Status"], empty: ["—"] },
  lead_type: { title: "Lead Type", cols: ["Lead Type"], empty: ["No Lead Type"] },
  process: { title: "Process", cols: ["Process"], empty: ["No Process"] },
  disposition: { title: "Disposition", cols: ["Disposition"], empty: ["No Disposition"] },
  process_disposition: { title: "Process × Disposition", cols: ["Process", "Disposition"], empty: ["No Process", "No Disposition"] },
  agent_disposition: { title: "Agent × Disposition", cols: ["Agent", "Disposition"], empty: ["Unassigned", "No Disposition"] },
} as const;
export type Dim = keyof typeof DIMS;

export function breakdown(groups: Group[], dim: Dim, labels: Record<string, string>): Table {
  const d = DIMS[dim];
  const name = (id: string | null, i: number) => (id ? labels[id] ?? "(removed)" : d.empty[i]);
  const rows = groups.filter((g) => g.dim === dim).map((g) => ({
    cells: dim === "status" ? [STATUS[g.s ?? ""] ?? d.empty[0]] : d.cols.length === 2 ? [name(g.a, 0), name(g.b, 1)] : [name(g.a, 0)],
    ...counts(g),
  })).sort((x, y) => y.leads - x.leads || y.followups - x.followups || x.cells.join().localeCompare(y.cells.join()));
  const t = groups.find((g) => g.dim === "total") ?? { leads: 0, followups: 0, in_progress: 0, won: 0, lost: 0 };
  return { title: `Breakdown by ${d.title}`, columns: [...d.cols, "Leads", "Follow-ups", "In Progress", "Won", "Lost", "Win Rate"], rows, total: counts(t) };
}

export function funnel(k: { total: number; followups: number; in_progress: number; won: number }) {
  const pct = (v: number) => (k.total ? Math.round((v / k.total) * 1000) / 10 : 0);
  return [
    { label: "Total Leads", value: k.total, pct: k.total ? 100 : 0 },
    { label: "Touched Follow-up", value: k.followups, pct: pct(k.followups) },
    { label: "In Progress", value: k.in_progress, pct: pct(k.in_progress) },
    { label: "Won", value: k.won, pct: pct(k.won) },
  ];
}

export const METRICS = [
  ["fresh_connected", "Fresh Connected"], ["followup_calls", "Follow-up Calls"], ["presentations", "Presentations"],
  ["whatsapp_sent", "WhatsApp Sent"], ["leads", "Leads"], ["closures", "Closures"],
] as const;
export type Metric = (typeof METRICS)[number][0];
type AgentActual = { id: string; name: string } & Partial<Record<Metric, number>>;

/** Totals per metric: actual (sum over agents) against the pro-rated target. */
export function targetRows(agents: AgentActual[], targets: Record<string, Partial<Record<Metric, number>>>) {
  return METRICS.map(([metric, label]) => {
    const actual = agents.reduce((n, a) => n + (a[metric] ?? 0), 0);
    const target = agents.reduce((n, a) => n + (targets[a.id]?.[metric] ?? 0), 0);
    return { metric, label, actual, target, pct: target ? Math.round((actual / target) * 1000) / 10 : 0 };
  });
}

export function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} hrs, ${m} mins` : `${m} mins`;
}
