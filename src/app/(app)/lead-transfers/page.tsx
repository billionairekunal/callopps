import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { MoveLeadsForm } from "@/components/leads/MoveLeadsForm";

const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default async function LeadTransfersPage() {
  await requireRole("super_admin", "admin", "team_leader");
  const db = await createClient();
  const [{ data: profs }, { data: openLeads }, { data: history }] = await Promise.all([
    db.from("profiles").select("user_id, full_name, role, status").eq("status", "active").in("role", ["caller", "team_leader"]).order("full_name"),
    db.from("leads").select("assigned_to").in("status", ["new", "in_progress"]).not("assigned_to", "is", null),
    db.from("lead_transfers").select("id, lead_id, from_user, to_user, reason, by_user, at, lead:leads(name)").order("at", { ascending: false }).limit(100),
  ]);
  const open = new Map<string, number>();
  openLeads?.forEach((l) => open.set(l.assigned_to!, (open.get(l.assigned_to!) ?? 0) + 1));
  const { data: names } = await db.from("profiles").select("user_id, full_name");
  const who = (u: string | null) => (u ? names?.find((p) => p.user_id === u)?.full_name ?? "Someone" : "Unassigned");
  const people = (profs ?? []).map((p) => ({ user_id: p.user_id, full_name: p.full_name, open: open.get(p.user_id) ?? 0 }));

  return (
    <>
      <PageHeader title="Lead Transfers" subtitle="Move leads between callers, with a full history of who moved what, when and why." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <MoveLeadsForm people={people} />
        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <h2 className="border-b px-5 py-3 font-semibold text-slate-900">History</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2">When (IST)</th><th className="px-4 py-2">Lead</th><th className="px-4 py-2">From → To</th><th className="px-4 py-2">Reason</th><th className="px-4 py-2">By</th></tr>
              </thead>
              <tbody className="divide-y">
                {!history?.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No transfers yet.</td></tr>}
                {history?.map((t) => {
                  const lead = Array.isArray(t.lead) ? t.lead[0] : t.lead;
                  return (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-500">{fmt.format(new Date(t.at))}</td>
                      <td className="px-4 py-2"><Link href={`/leads/${t.lead_id}`} className="font-medium hover:text-rose-600">{(lead as { name?: string } | null)?.name || "Unnamed"}</Link></td>
                      <td className="px-4 py-2 text-slate-600">{who(t.from_user)} → <span className="font-medium text-slate-800">{who(t.to_user)}</span></td>
                      <td className="max-w-56 truncate px-4 py-2 text-slate-500">{t.reason || "—"}</td>
                      <td className="px-4 py-2 text-slate-500">{who(t.by_user)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
