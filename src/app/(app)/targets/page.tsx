import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportScope } from "@/lib/reports/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { TargetsGrid } from "@/components/reports/TargetsGrid";

export default async function Targets({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const s = await requireRole("super_admin", "admin", "team_leader");
  const m = (await searchParams).month;
  const month = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);
  const svc = createAdminClient();
  const scope = await reportScope(s);
  let q = svc.from("profiles").select("user_id, full_name, team:teams!profiles_team_id_fkey(team_leader_id)").eq("org_id", s.orgId)
    .in("role", ["caller", "team_leader"]).eq("status", "active").order("full_name");
  if (scope) q = q.in("user_id", scope);
  const [{ data: people }, { data: t }, { data: names }] = await Promise.all([
    q, svc.from("targets").select("user_id, metric, value").eq("org_id", s.orgId).eq("month", `${month}-01`),
    svc.from("profiles").select("user_id, full_name").eq("org_id", s.orgId),
  ]);
  const nameOf = (id?: string | null) => names?.find((n) => n.user_id === id)?.full_name ?? null;
  const rows = (people ?? []).map((p) => {
    const team = (Array.isArray(p.team) ? p.team[0] : p.team) as { team_leader_id: string | null } | null;
    return {
      userId: p.user_id, name: p.full_name, tl: nameOf(team?.team_leader_id),
      values: Object.fromEntries((t ?? []).filter((x) => x.user_id === p.user_id).map((x) => [x.metric, x.value])),
    };
  });
  return (
    <>
      <PageHeader title="Targets" subtitle="Set the six monthly targets per agent: Fresh Connected, Follow-up Calls, Presentations, WhatsApp Sent, Leads and Closures." />
      <TargetsGrid key={month} month={month} rows={rows} />
    </>
  );
}
