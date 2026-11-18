import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth/session";

type Actor = { orgId: string | null; userId: string | null };

/** Append to the audit log. Written with the service client so it can't be skipped; actor comes from the validated session unless given. */
export async function logAudit(action: string, entity?: string, entityId?: string, meta: Record<string, unknown> = {}, actor?: Actor) {
  const s: Actor = actor ?? (await getSession().then((x): Actor => (x ? { orgId: x.orgId, userId: x.userId } : { orgId: null, userId: null })));
  const { error } = await createAdminClient().from("audit_log").insert({
    org_id: s.orgId, actor_id: s.userId, action, entity: entity ?? null, entity_id: entityId ?? null, meta,
  });
  if (error) console.error("audit write failed", action, error.message);
}
