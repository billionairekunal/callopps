"use server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { runAction } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";

/** Open (or create) a direct-message channel with someone in the same centre. */
export async function openDm(otherId: string) {
  return runAction(async () => {
    const s = await requireRole("super_admin", "admin", "team_leader", "caller");
    const other = z.string().uuid().parse(otherId);
    if (other === s.userId) throw new Error("Pick someone else.");
    const svc = createAdminClient();
    const { data: p } = await svc.from("profiles").select("user_id").eq("org_id", s.orgId).eq("user_id", other).eq("status", "active").maybeSingle();
    if (!p) throw new Error("That person isn't in your centre.");
    const key = [s.userId, other].sort().join(":");
    let { data: ch } = await svc.from("chat_channels").select("id").eq("org_id", s.orgId).eq("dm_key", key).maybeSingle();
    if (!ch) {
      const ins = await svc.from("chat_channels").insert({ org_id: s.orgId, kind: "dm", name: "Direct message", dm_key: key }).select("id").single();
      ch = ins.data ?? (await svc.from("chat_channels").select("id").eq("org_id", s.orgId).eq("dm_key", key).single()).data;
      if (!ch) throw new Error("Could not open the conversation.");
    }
    // Always (re)ensure both members, so a half-created DM heals itself.
    const { error } = await svc.from("chat_members").upsert([{ channel_id: ch.id, user_id: s.userId }, { channel_id: ch.id, user_id: other }]);
    if (error) throw new Error("Could not open the conversation.");
    return ch.id as string;
  });
}
