"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { runAction } from "@/lib/actions";
import { transferCtx } from "@/lib/leads/repo";
import { transferLeads } from "@/lib/leads/transfer";
import { createClient } from "@/lib/supabase/server";

const MGMT = ["super_admin", "admin", "team_leader"] as const;

export async function assignLeads(leadIds: string[], toUser: string) {
  return runAction(async () => {
    const r = await transferLeads(await transferCtx(await requireRole(...MGMT)), { leadIds, toUser, reason: "Assigned" });
    revalidatePath("/leads"); revalidatePath("/lead-transfers");
    return r;
  });
}

const moveSchema = z.object({
  fromUser: z.string().uuid(), toUser: z.string().uuid(), reason: z.string().trim().min(1, "Say why you're moving these leads.").max(300),
  limit: z.number().int().min(1).max(100_000).nullable(),
});

/** Move a caller's open leads (all, or the first N) to someone else. */
export async function moveLeads(input: unknown) {
  return runAction(async () => {
    const session = await requireRole(...MGMT);
    const d = moveSchema.parse(input);
    if (d.fromUser === d.toUser) throw new Error("Pick two different people.");
    const db = await createClient();
    const ids: string[] = [];
    // Page through every open lead (or the first N), then move them 2,000 at a time.
    for (let from = 0; ; from += 1000) {
      const want = d.limit ? Math.min(1000, d.limit - ids.length) : 1000;
      if (want <= 0) break;
      const { data } = await db.from("leads").select("id").eq("assigned_to", d.fromUser).in("status", ["new", "in_progress"])
        .order("created_at").order("id").range(from, from + want - 1);
      ids.push(...(data ?? []).map((x) => x.id));
      if (!data || data.length < want) break;
    }
    if (!ids.length) throw new Error("That person has no open leads to move.");
    const ctx = await transferCtx(session);
    let moved = 0;
    for (let i = 0; i < ids.length; i += 2000) moved += (await transferLeads(ctx, { leadIds: ids.slice(i, i + 2000), toUser: d.toUser, reason: d.reason })).moved;
    revalidatePath("/lead-transfers"); revalidatePath("/leads");
    return { moved };
  });
}
