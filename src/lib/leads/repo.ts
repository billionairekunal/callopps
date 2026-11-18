import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrgKeys } from "@/lib/crypto/orgKeys";
import { logAudit } from "@/lib/audit";
import type { Session } from "@/lib/auth/roles";
import type { LeadCtx, LeadRepo } from "./service";

class DbError extends Error { code = "db"; }
const ok = <T>(r: { data: T; error: { message: string } | null }): T => { if (r.error) throw new DbError(r.error.message); return r.data; };

/** Lead rows go through the user's RLS client (the database re-checks role); timeline rows are server-written. */
export function leadRepo(rls: SupabaseClient, orgId: string): LeadRepo {
  const svc = createAdminClient();
  return {
    findByPhoneHash: async (hash) => ok(await rls.from("leads").select("id, process_id").eq("org_id", orgId).eq("phone_hash", hash)) ?? [],
    insertLeads: async (rows) => (ok(await rls.from("leads").insert(rows).select("id")) ?? []).map((r: { id: string }) => r.id),
    insertEvents: async (rows) => { if (rows.length) ok(await svc.from("lead_events").insert(rows)); },
    insertStatusHistory: async (rows) => { if (rows.length) ok(await svc.from("lead_status_history").insert(rows)); },
  };
}

export async function leadCtx(session: Session): Promise<LeadCtx> {
  return { session, keys: () => getOrgKeys(session.orgId), repo: leadRepo(await createClient(), session.orgId), audit: logAudit };
}
