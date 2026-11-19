"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { runAction } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportScope } from "@/lib/reports/server";
import { METRICS } from "@/lib/reports/build";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Pick a month."),
  rows: z.array(z.object({ userId: z.string().uuid(), values: z.record(z.string(), z.number().int().min(0).max(10_000_000).nullable()) })).max(500),
});

/** Admins set targets for anyone; team leaders for their own team only. */
export async function saveTargets(input: unknown) {
  return runAction(async () => {
    const s = await requireRole("super_admin", "admin", "team_leader");
    const d = schema.parse(input);
    const svc = createAdminClient();
    const ids = [...new Set(d.rows.map((r) => r.userId))];
    const scope = await reportScope(s);
    const { data: ok } = await svc.from("profiles").select("user_id").eq("org_id", s.orgId).in("role", ["caller", "team_leader"]).in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const allowed = new Set((ok ?? []).map((p) => p.user_id).filter((id) => !scope || scope.includes(id)));
    if (ids.some((id) => !allowed.has(id))) throw new Error("You can only set targets for your own agents.");
    const month = `${d.month}-01`;
    const metrics = METRICS.map(([m]) => m as string);
    const upserts = [], clears: { user: string; metric: string }[] = [];
    for (const r of d.rows) for (const m of metrics) {
      const v = r.values[m];
      if (v == null) clears.push({ user: r.userId, metric: m });
      else upserts.push({ org_id: s.orgId, user_id: r.userId, month, metric: m, value: v, updated_by: s.userId, updated_at: new Date().toISOString() });
    }
    if (upserts.length) {
      const { error } = await svc.from("targets").upsert(upserts, { onConflict: "org_id,user_id,month,metric" });
      if (error) throw new Error("Could not save targets.");
    }
    // One delete per metric (at most six), for everyone whose cell was cleared.
    for (const m of metrics) {
      const users = clears.filter((c) => c.metric === m).map((c) => c.user);
      if (users.length) await svc.from("targets").delete().eq("org_id", s.orgId).eq("month", month).eq("metric", m).in("user_id", users);
    }
    await logAudit("targets.save", "targets", undefined, { month, agents: ids.length });
    revalidatePath("/targets"); revalidatePath("/reports");
  });
}
