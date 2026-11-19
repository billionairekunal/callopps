import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** The org's General channel and one channel per team always exist (idempotent). */
export async function ensureChannels(orgId: string) {
  const svc = createAdminClient();
  const [{ data: chans }, { data: teams }] = await Promise.all([
    svc.from("chat_channels").select("id, kind, team_id, name").eq("org_id", orgId).in("kind", ["org", "team"]),
    svc.from("teams").select("id, name").eq("org_id", orgId),
  ]);
  const rows: { org_id: string; kind: string; name: string; team_id?: string }[] = [];
  if (!chans?.some((c) => c.kind === "org")) rows.push({ org_id: orgId, kind: "org", name: "General" });
  for (const t of teams ?? []) if (!chans?.some((c) => c.team_id === t.id)) rows.push({ org_id: orgId, kind: "team", name: t.name, team_id: t.id });
  for (const r of rows) await svc.from("chat_channels").insert(r); // unique indexes make a race harmless
  for (const t of teams ?? []) {
    const ch = chans?.find((c) => c.team_id === t.id);
    if (ch && ch.name !== t.name) await svc.from("chat_channels").update({ name: t.name }).eq("id", ch.id);
  }
}
