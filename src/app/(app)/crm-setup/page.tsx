import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/shell/PageHeader";
import { CrmSetup, type SetupData } from "@/components/setup/CrmSetup";

export default async function CrmSetupPage() {
  const me = await requireRole("super_admin", "admin");
  const db = await createClient();
  const [org, profiles, teams, tp, processes, categories, products, leadTypes, dispositions] = await Promise.all([
    db.from("orgs").select("name, idle_timeout_minutes, ai_enabled").single(),
    db.from("profiles").select("user_id, full_name, role, team_id, status").order("full_name"),
    db.from("teams").select("id, name, team_leader_id").order("name"),
    db.from("team_processes").select("team_id, process_id"),
    db.from("processes").select("id, name, active").order("name"),
    db.from("product_categories").select("id, name").order("name"),
    db.from("products").select("id, name, category_id").order("name"),
    db.from("lead_types").select("id, name").order("name"),
    db.from("dispositions").select("id, process_id, label, outcome, counts_presentation, sort").order("sort"),
  ]);
  // ponytail: one page of auth users (1000) is plenty for a call centre; paginate if a centre outgrows it
  const { data: auth } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
  const emails = new Map(auth?.users.map((u) => [u.id, u.email ?? ""]) ?? []);

  const data: SetupData = {
    me: { userId: me.userId, role: me.role },
    org: org.data ?? { name: "", idle_timeout_minutes: 30, ai_enabled: false },
    users: (profiles.data ?? []).map((p) => ({ ...p, email: emails.get(p.user_id) ?? "" })) as SetupData["users"],
    teams: teams.data ?? [], teamProcesses: tp.data ?? [], processes: processes.data ?? [],
    categories: categories.data ?? [], products: products.data ?? [], leadTypes: leadTypes.data ?? [],
    dispositions: (dispositions.data ?? []) as SetupData["dispositions"],
  };
  return (
    <>
      <PageHeader title="CRM Setup" subtitle="Users, teams, processes, products, dispositions and security for your centre" />
      <CrmSetup data={data} />
    </>
  );
}
