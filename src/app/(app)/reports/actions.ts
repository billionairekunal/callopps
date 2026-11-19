"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { runAction } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFilters, rangeFor } from "@/lib/reports/filters";

const MGMT = ["super_admin", "admin", "team_leader"] as const;

/** R5: save the current filters with their resolved dates, so reopening shows the same period. */
export async function saveReport(name: string, query: string) {
  return runAction(async () => {
    const s = await requireRole(...MGMT);
    const n = z.string().trim().min(1, "Give the report a name.").max(120).parse(name);
    const f = parseFilters(Object.fromEntries(new URLSearchParams(query)));
    const r = rangeFor(f);
    const day = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);
    const saved = { ...f, preset: "custom", from: day(r.from), to: day(new Date(Date.parse(r.to) - 1).toISOString()) };
    const { error } = await createAdminClient().from("saved_reports").insert({ org_id: s.orgId, user_id: s.userId, name: n, filters: saved });
    if (error) throw new Error("Could not save this report.");
    revalidatePath("/reports");
  });
}

export async function deleteReport(id: string) {
  return runAction(async () => {
    const s = await requireRole(...MGMT);
    await createAdminClient().from("saved_reports").delete().eq("org_id", s.orgId).eq("user_id", s.userId).eq("id", z.string().uuid().parse(id));
    revalidatePath("/reports");
  });
}
