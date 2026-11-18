import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { unwrapKey, masterKey } from "./keyWrap";

export type OrgKeys = { keyId: string; dataKey: Buffer; hashKey: Buffer };
// ponytail: in-memory per-process cache; key rotation needs a cache bust (restart) until rotation ships
const cache = new Map<string, OrgKeys>();

export async function getOrgKeys(orgId: string): Promise<OrgKeys> {
  const hit = cache.get(orgId);
  if (hit) return hit;
  const { data, error } = await createAdminClient()
    .from("org_keys").select("key_id, data_key_wrapped, hash_key_wrapped").eq("org_id", orgId).single();
  if (error || !data) throw new Error("org keys missing");
  const m = masterKey();
  const keys = { keyId: data.key_id, dataKey: unwrapKey(data.data_key_wrapped, m), hashKey: unwrapKey(data.hash_key_wrapped, m) };
  cache.set(orgId, keys);
  return keys;
}
