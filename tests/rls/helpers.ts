import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

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

export async function makeUser(orgId: string, role: string, status = "active"): Promise<TestUser> {
  const email = `rls-${randomUUID()}@callopps.test`, password = randomUUID() + "Aa1!";
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const p = await admin().from("profiles").insert({ user_id: data.user.id, org_id: orgId, full_name: role, role, status });
  if (p.error) throw p.error;
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  return { id: data.user.id, client };
}

export async function cleanup() {
  for (const id of created) await admin().auth.admin.deleteUser(id);
  if (orgs.length) await admin().from("orgs").delete().in("id", orgs);
}
