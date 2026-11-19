import { z } from "zod";
import { AuthError, type Session } from "@/lib/auth/roles";

export type Item = { id: string; label: string };
export type Answer = "pass" | "fail" | "na";
export const DEFAULT_ITEMS: Item[] = [
  { id: "greeting", label: "Greeted and introduced themselves and the centre" },
  { id: "needs", label: "Understood the lead's need (course, budget, timing)" },
  { id: "info", label: "Gave correct information" },
  { id: "disposition", label: "Chose the right disposition" },
  { id: "followup", label: "Set a follow-up when one was needed" },
  { id: "notes", label: "Notes are clear and useful" },
  { id: "manner", label: "Polite and professional throughout" },
];

/** % of applicable items passed (N/A doesn't count either way). */
export function scoreOf(items: Item[], scores: Record<string, Answer>): number {
  const used = items.filter((i) => scores[i.id] && scores[i.id] !== "na");
  return used.length ? Math.round((used.filter((i) => scores[i.id] === "pass").length / used.length) * 100) : 0;
}

export type QaCtx = {
  session: Session;
  repo: {
    getCall(id: string): Promise<{ id: string; lead_id: string; caller_id: string; saved_at: string | null } | null>;
    checklist(): Promise<Item[]>;
    /** False when the call already has an audit. */
    insert(row: { org_id: string; call_id: string; lead_id: string; agent_id: string; auditor_id: string; scores: Record<string, Answer>; score: number; remarks: string }): Promise<boolean>;
  };
  scope: () => Promise<string[] | null>;
  audit: (action: string, entity?: string, entityId?: string, meta?: Record<string, unknown>) => Promise<void>;
};

const schema = z.object({
  callId: z.string().uuid(),
  scores: z.record(z.string(), z.enum(["pass", "fail", "na"])),
  remarks: z.string().trim().max(1000).optional(),
});

/** §7.11 + §15: the Super Admin audits any call; a team leader audits their team's calls (not their own). */
export async function saveAudit(c: QaCtx, input: unknown): Promise<{ score: number }> {
  const s = c.session;
  if (s.role !== "super_admin" && s.role !== "team_leader") throw new AuthError("forbidden");
  const d = schema.parse(input);
  const call = await c.repo.getCall(d.callId);
  if (!call) throw new Error("Call not found.");
  if (!call.saved_at) throw new Error("Only saved calls can be audited.");
  if (call.caller_id === s.userId) throw new Error("You can't audit your own call.");
  const scope = await c.scope();
  if (scope && !scope.includes(call.caller_id)) throw new AuthError("forbidden");
  const items = await c.repo.checklist();
  if (items.some((i) => !d.scores[i.id])) throw new Error("Answer every checklist item (Pass, Fail or N/A).");
  const scores = Object.fromEntries(items.map((i) => [i.id, d.scores[i.id]])) as Record<string, Answer>;
  if (Object.values(scores).every((v) => v === "na")) throw new Error("Score at least one item Pass or Fail (an all-N/A audit has no score).");
  const score = scoreOf(items, scores);
  const ok = await c.repo.insert({ org_id: s.orgId, call_id: call.id, lead_id: call.lead_id, agent_id: call.caller_id, auditor_id: s.userId, scores, score, remarks: d.remarks ?? "" });
  if (!ok) throw new Error("This call was already audited.");
  await c.audit("qa.audit", "call", call.id, { score });
  return { score };
}
