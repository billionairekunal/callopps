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

/** Import-specific repo: batches, sources, mappings and lookups, all through the admin's RLS client. */
export function importRepo(rls: SupabaseClient, orgId: string): import("./importService").ImportRepo {
  const base = leadRepo(rls, orgId);
  return {
    insertLeads: base.insertLeads, insertEvents: base.insertEvents, insertStatusHistory: base.insertStatusHistory,
    findByPhoneHashes: async (hashes) => {
      const out: { phone_hash: string; process_name: string | null }[] = [];
      for (let i = 0; i < hashes.length; i += 150) { // keep the request URL short
        const rows = ok(await rls.from("leads").select("phone_hash, process:processes(name)").eq("org_id", orgId).in("phone_hash", hashes.slice(i, i + 150))) ?? [];
        for (const r of rows as { phone_hash: string; process: { name: string } | { name: string }[] | null }[]) {
          const p = Array.isArray(r.process) ? r.process[0] : r.process;
          out.push({ phone_hash: r.phone_hash, process_name: p?.name ?? null });
        }
      }
      return out;
    },
    createSource: async (name) => (ok(await rls.from("lead_sources").insert({ org_id: orgId, name }).select("id").single()) as { id: string }).id,
    createBatch: async (row) => (ok(await rls.from("import_batches").insert({ ...row, org_id: orgId, created_by: (await rls.auth.getUser()).data.user!.id }).select("id").single()) as { id: string }).id,
    saveMapping: async (row) => void ok(await rls.from("import_mappings").upsert({ ...row, org_id: orgId, updated_at: new Date().toISOString() }, { onConflict: "org_id,source_name" })),
    getBatch: async (id) => {
      const b = ok(await rls.from("import_batches").select("source_id, source:lead_sources(name)").eq("id", id).maybeSingle()) as { source_id: string | null; source: { name: string } | { name: string }[] | null } | null;
      if (!b) return null;
      const s = Array.isArray(b.source) ? b.source[0] : b.source;
      return { source_id: b.source_id, source_name: s?.name ?? "Import" };
    },
    updateBatch: async (id, patch) => void ok(await rls.from("import_batches").update(patch).eq("id", id)),
    lookups: async () => {
      const [p, pr, lt] = await Promise.all([
        rls.from("processes").select("id, name"), rls.from("products").select("id, name"), rls.from("lead_types").select("id, name"),
      ]);
      return { processes: p.data ?? [], products: pr.data ?? [], leadTypes: lt.data ?? [] };
    },
  };
}

export async function importCtx(session: Session) {
  return { session, keys: () => getOrgKeys(session.orgId), repo: importRepo(await createClient(), session.orgId), audit: logAudit };
}
