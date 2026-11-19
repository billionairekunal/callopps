"use server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { runAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { parseFilters } from "@/lib/reports/filters";
import { runReport } from "@/lib/reports/server";
import { aiContext } from "@/lib/ai/context";
import { askOps, AiNotConnected } from "@/lib/ai/ask";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  question: z.string().trim().min(2, "Ask a question.").max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(12),
});

/** §7.12: admins only, off unless the Super Admin turned it on; only aggregates leave CallOpps. */
export async function askOpsAi(input: unknown) {
  return runAction(async () => {
    const s = await requireRole("super_admin", "admin");
    const d = schema.parse(input);
    const { data: org } = await (await createClient()).from("orgs").select("ai_enabled").single();
    if (!org?.ai_enabled) throw new Error("Ops AI is turned off. A Super Admin can turn it on in CRM Setup → Security.");
    const [now, last] = await Promise.all([
      runReport(s, parseFilters({ preset: "this_month" })), runReport(s, parseFilters({ preset: "last_month" })),
    ]);
    const context = aiContext([{ label: now.range.label, raw: now.raw }, { label: last.range.label, raw: last.raw }], now.labels);
    await logAudit("ai.ask", "ops_ai", undefined, { chars: d.question.length });
    try {
      return await askOps(context, d.history, d.question);
    } catch (e) {
      if (e instanceof AiNotConnected) throw new Error("Ops AI isn't connected yet. Add an ANTHROPIC_API_KEY to the server settings.");
      throw e;
    }
  });
}
