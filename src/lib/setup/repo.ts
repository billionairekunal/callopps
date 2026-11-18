import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Session } from "@/lib/auth/roles";
import type { Repo } from "./service";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const ok = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };

/** Setup tables go through the user's RLS client (database re-checks role + org); profiles/auth use the service client scoped to the org. */
export function supabaseRepo(rls: SupabaseClient, session: Session): Repo {
  const admin = createAdminClient();
  const org = session.orgId;
  return {
    upsert: async (table, row) => {
      const r = ok(await rls.from(table).upsert(row).select("id").single<{ id: string }>());
      if (!r) throw new Error("Not allowed");
      return r;
    },
    remove: async (table, id) => void ok(await rls.from(table).delete().eq("id", id).eq("org_id", org)),
    replaceTeamProcesses: async (teamId, ids) => {
      ok(await rls.from("team_processes").delete().eq("team_id", teamId).eq("org_id", org));
      if (ids.length) ok(await rls.from("team_processes").insert(ids.map((process_id) => ({ team_id: teamId, process_id, org_id: org }))));
    },
    countActiveSuperAdmins: async () =>
      (await admin.from("profiles").select("user_id", { count: "exact", head: true })
        .eq("org_id", org).eq("role", "super_admin").eq("status", "active")).count ?? 0,
    getProfile: async (userId) =>
      ok(await admin.from("profiles").select("role, status").eq("user_id", userId).eq("org_id", org).maybeSingle()),
    updateProfile: async (userId, patch) => void ok(await admin.from("profiles").update(patch).eq("user_id", userId).eq("org_id", org)),
    inviteAuthUser: async (email) => {
      const r = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${siteUrl()}/auth/callback` });
      if (r.error) throw new Error(r.error.message);
      return r.data.user.id;
    },
    insertProfile: async (row) => void ok(await admin.from("profiles").insert(row)),
    signOutUser: async (userId) => {
      // ponytail: revokes refresh tokens; the current access token lives until expiry (≤1h) but middleware rejects deactivated profiles on every request
      await admin.rpc("revoke_user_sessions", { target: userId });
    },
    updateOrg: async (patch) => void ok(await rls.from("orgs").update(patch).eq("id", org)),
  };
}
