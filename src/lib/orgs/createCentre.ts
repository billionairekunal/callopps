import type { SupabaseClient } from "@supabase/supabase-js";
import { generateKey } from "@/lib/crypto/fieldCrypto";
import { wrapKey, masterKey } from "@/lib/crypto/keyWrap";

export type CentreInput = { name: string; ownerEmail: string; ownerName: string; ownerPassword?: string };
export type CentreDeps = {
  master: Buffer;
  insertOrg: (row: { name: string }) => Promise<string>;
  insertKeys: (row: { org_id: string; key_id: string; data_key_wrapped: string; hash_key_wrapped: string }) => Promise<void>;
  createOwner: (u: { email: string; password?: string }) => Promise<string>;
  insertProfile: (row: { user_id: string; org_id: string; full_name: string; role: "super_admin" }) => Promise<void>;
  audit: (row: { org_id: string; actor_id: string | null; action: string; meta: object }) => Promise<void>;
  deleteOrg: (orgId: string) => Promise<void>;
};

export async function createCentre(input: CentreInput, deps: CentreDeps): Promise<{ orgId: string; ownerUserId: string }> {
  const orgId = await deps.insertOrg({ name: input.name });
  try {
    await deps.insertKeys({
      org_id: orgId, key_id: "k1",
      data_key_wrapped: wrapKey(generateKey(), deps.master),
      hash_key_wrapped: wrapKey(generateKey(), deps.master),
    });
    const ownerUserId = await deps.createOwner({ email: input.ownerEmail, password: input.ownerPassword });
    await deps.insertProfile({ user_id: ownerUserId, org_id: orgId, full_name: input.ownerName, role: "super_admin" });
    await deps.audit({ org_id: orgId, actor_id: null, action: "centre.created", meta: { name: input.name } });
    return { orgId, ownerUserId };
  } catch (e) {
    await deps.deleteOrg(orgId);
    throw e;
  }
}

const must = <T>(r: { data: T | null; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data as T;
};

/** Real deps over the service-role client. With a password the owner is created directly (demo); otherwise invited by email. */
export function supabaseCentreDeps(db: SupabaseClient): CentreDeps {
  return {
    master: masterKey(),
    insertOrg: async (row) => must(await db.from("orgs").insert(row).select("id").single<{ id: string }>()).id,
    insertKeys: async (row) => void must(await db.from("org_keys").insert(row)),
    createOwner: async ({ email, password }) => {
      const r = password
        ? await db.auth.admin.createUser({ email, password, email_confirm: true })
        : await db.auth.admin.inviteUserByEmail(email);
      if (r.error) throw r.error;
      return r.data.user!.id;
    },
    insertProfile: async (row) => void must(await db.from("profiles").insert(row)),
    audit: async (row) => void must(await db.from("audit_log").insert(row)),
    deleteOrg: async (id) => void (await db.from("orgs").delete().eq("id", id)),
  };
}
