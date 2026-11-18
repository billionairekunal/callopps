import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID, createHmac } from "node:crypto";

/** RFC 6238 TOTP (SHA-1, 30s, 6 digits) for enrolling test factors. */
function totp(secret: string) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/=+$/, "")].map((c) => A.indexOf(c).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(ctr).digest(), o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

export const enabled = process.env.RLS_TEST === "1" || process.env.npm_lifecycle_event === "test:rls";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const admin = () =>
  createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export type TestUser = { id: string; client: SupabaseClient };
const created: string[] = [];
const orgs: string[] = [];

export async function makeOrg(name: string) {
  const { data, error } = await admin().from("orgs").insert({ name: `rlstest-${name}` }).select("id").single();
  if (error) throw error;
  orgs.push(data.id);
  return data.id as string;
}

export async function makeUser(orgId: string, role: string, status = "active", mfa = false): Promise<TestUser> {
  const email = `rls-${randomUUID()}@callopps.test`, password = randomUUID() + "Aa1!";
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const p = await admin().from("profiles").insert({ user_id: data.user.id, org_id: orgId, full_name: role, role, status });
  if (p.error) throw p.error;
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  if (mfa) {
    const e = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "test" });
    if (e.error) throw e.error;
    const v = await client.auth.mfa.challengeAndVerify({ factorId: e.data.id, code: totp(e.data.totp.secret) });
    if (v.error) throw v.error;
  }
  return { id: data.user.id, client };
}

export async function cleanup() {
  for (const id of created) await admin().auth.admin.deleteUser(id);
  if (orgs.length) await admin().from("orgs").delete().in("id", orgs);
}

export async function makeRow<T extends Record<string, unknown>>(table: string, row: T): Promise<string> {
  const { data, error } = await admin().from(table).insert(row).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export function makeLead(orgId: string, extra: Record<string, unknown> = {}) {
  const n = Math.floor(Math.random() * 1e9);
  return makeRow("leads", {
    org_id: orgId, phone_enc: "v1:k1:x:y:z", phone_hash: `h${n}`, phone_last4: String(n).slice(-4).padStart(4, "0"), ...extra,
  });
}
