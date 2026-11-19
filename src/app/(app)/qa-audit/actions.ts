"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { runAction } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { reportScope } from "@/lib/reports/server";
import { saveAudit as save } from "@/lib/qa/service";
import { checklistFor } from "@/lib/qa/checklist";

export async function saveAudit(input: unknown) {
  return runAction(async () => {
    const s = await requireRole("super_admin", "team_leader");
    const svc = createAdminClient();
    const r = await save({
      session: s, audit: logAudit, scope: () => reportScope(s),
      repo: {
        getCall: async (id) => (await svc.from("calls").select("id, lead_id, caller_id, saved_at").eq("org_id", s.orgId).eq("id", id).maybeSingle()).data,
        checklist: () => checklistFor(s.orgId),
        insert: async (row) => {
          const { error } = await svc.from("qa_audits").insert(row);
          if (error?.code === "23505") return false;
          if (error) throw Object.assign(new Error(error.message), { code: "db" });
          return true;
        },
      },
    }, input);
    revalidatePath("/qa-audit");
    return r;
  });
}

/** One item per line; ids are derived from the text and kept stable for unchanged lines. */
export async function saveChecklist(text: string) {
  return runAction(async () => {
    const s = await requireRole("super_admin", "admin");
    const lines = z.string().max(4000).parse(text).split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 20);
    if (lines.length < 1) throw new Error("Add at least one checklist item.");
    const old = await checklistFor(s.orgId);
    const items = lines.map((label, i) => old.find((o) => o.label === label) ?? { id: `i${Date.now().toString(36)}${i}`, label: label.slice(0, 200) });
    const { error } = await createAdminClient().from("qa_checklists").upsert({ org_id: s.orgId, items, updated_at: new Date().toISOString() });
    if (error) throw new Error("Could not save the checklist.");
    await logAudit("qa.checklist", "qa_checklist", undefined, { items: items.length });
    revalidatePath("/qa-audit");
  });
}
