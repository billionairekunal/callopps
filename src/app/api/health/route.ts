import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Uptime check: the app is up and can reach the database. Reveals nothing else. */
export async function GET() {
  const { error } = await createAdminClient().from("orgs").select("id", { head: true, count: "exact" }).limit(1);
  return Response.json({ ok: !error }, { status: error ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
