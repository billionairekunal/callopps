import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFilters, rangeFor, PRESETS } from "@/lib/reports/filters";
import { reportScope, labelsFor } from "@/lib/reports/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { card } from "@/components/reports/Sections";

/** WhatsApp actions per agent and per day (counts only). Feeds the WhatsApp Sent target. */
export default async function WhatsAppReports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireRole("super_admin", "admin", "team_leader");
  const f = parseFilters(await searchParams);
  const range = rangeFor(f);
  const scope = await reportScope(s);
  let q = createAdminClient().from("communications").select("user_id, at, sender:profiles!communications_user_id_org_id_fkey!inner(role)").eq("org_id", s.orgId).eq("channel", "whatsapp")
    .gte("at", range.from).lt("at", range.to).limit(50_000); // ponytail: grouped in JS; move to SQL past ~50k a month
  if (scope) q = q.in("user_id", scope);
  q = q.in("sender.role", ["caller", "team_leader"]); // same people as the WhatsApp Sent target
  const [{ data }, labels] = await Promise.all([q, labelsFor(s.orgId)]);
  const day = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);
  const days = [...new Set((data ?? []).map((r) => day(r.at)))].sort().reverse();
  const agents = [...new Set((data ?? []).map((r) => r.user_id))].sort((a, b) => (labels[a] ?? "").localeCompare(labels[b] ?? ""));
  const count = new Map<string, number>();
  for (const r of data ?? []) { const k = `${r.user_id}|${day(r.at)}`; count.set(k, (count.get(k) ?? 0) + 1); }
  const total = (u: string) => days.reduce((n, d) => n + (count.get(`${u}|${d}`) ?? 0), 0);
  return (
    <>
      <PageHeader title="WhatsApp Reports" subtitle="WhatsApp messages opened per agent and per day. These count towards the WhatsApp Sent target." actions={
        <form className="flex gap-2">
          <select name="preset" defaultValue={f.preset === "custom" ? "this_month" : f.preset} className="h-9 rounded-md border bg-white px-2 text-sm" aria-label="Date range">
            {Object.entries(PRESETS).filter(([k]) => k !== "custom").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="h-9 rounded-md border bg-white px-3 text-sm hover:bg-slate-50">Apply</button>
        </form>
      } />
      <p className="-mt-3 mb-4 text-xs text-slate-500">{range.label} · {(data ?? []).length.toLocaleString("en-IN")} WhatsApp messages</p>
      <section className={card}>
        {agents.length === 0 ? <p className="text-sm text-slate-500">No WhatsApp messages in this range.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-900 text-left text-xs text-white"><th className="px-3 py-2">Agent</th><th className="px-3 text-right">Total</th>
                {days.map((d) => <th key={d} className="px-3 text-right">{d.slice(8)}/{d.slice(5, 7)}</th>)}</tr></thead>
              <tbody>
                {agents.map((u) => (
                  <tr key={u} className="border-b"><td className="px-3 py-1.5 font-medium">{labels[u] ?? "—"}</td><td className="px-3 text-right font-semibold tabular-nums">{total(u)}</td>
                    {days.map((d) => <td key={d} className="px-3 text-right tabular-nums text-slate-600">{count.get(`${u}|${d}`) ?? "·"}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
