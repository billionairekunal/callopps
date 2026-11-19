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
import { createAdminClient } from "@/lib/supabase/admin";

const PER_HOUR = 30;
const HISTORY_CHARS = 24_000;
// ponytail: per-instance memory cache; fine for one server, use a shared store if scaled out
const cache = new Map<string, { at: number; context: unknown }>();

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
    const { count } = await createAdminClient().from("audit_log").select("id", { count: "exact", head: true })
      .eq("org_id", s.orgId).eq("actor_id", s.userId).eq("action", "ai.ask").gte("at", new Date(Date.now() - 3_600_000).toISOString());
    if ((count ?? 0) >= PER_HOUR) throw new Error(`You've asked ${PER_HOUR} questions in the last hour. Try again a bit later.`);
    let hit = cache.get(s.orgId);
    if (!hit || Date.now() - hit.at > 5 * 60_000) {
      const [now, last] = await Promise.all([
        runReport(s, parseFilters({ preset: "this_month" })), runReport(s, parseFilters({ preset: "last_month" })),
      ]);
      hit = { at: Date.now(), context: aiContext([{ label: now.range.label, raw: now.raw }, { label: last.range.label, raw: last.raw }], now.labels) };
      cache.set(s.orgId, hit);
    }
    // Keep only the most recent turns that fit; the browser-sent history is untrusted, so cap it here.
    const history: typeof d.history = [];
    let used = 0;
    for (const t of [...d.history].reverse()) { used += t.content.length; if (used > HISTORY_CHARS) break; history.unshift(t); }
    while (history[0]?.role === "assistant") history.shift();
    await logAudit("ai.ask", "ops_ai", undefined, { chars: d.question.length });
    try {
      return await askOps(hit.context, history, d.question);
    } catch (e) {
      if (e instanceof AiNotConnected) throw new Error("Ops AI isn't connected yet. Add an ANTHROPIC_API_KEY to the server settings.");
      throw e;
    }
  });
}
