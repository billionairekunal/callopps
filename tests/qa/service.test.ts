import { test, expect, vi } from "vitest";
import { scoreOf, saveAudit, DEFAULT_ITEMS, type QaCtx } from "@/lib/qa/service";
import type { Role, Session } from "@/lib/auth/roles";

const CALL = "11111111-1111-4111-8111-111111111111";
const items = [{ id: "a", label: "Greeting" }, { id: "b", label: "Disposition" }, { id: "c", label: "Notes" }];

test("score is the share of passed items, ignoring N/A", () => {
  expect(scoreOf(items, { a: "pass", b: "fail", c: "na" })).toBe(50);
  expect(scoreOf(items, { a: "pass", b: "pass", c: "pass" })).toBe(100);
  expect(scoreOf(items, { a: "na", b: "na", c: "na" })).toBe(0);
  expect(DEFAULT_ITEMS.length).toBeGreaterThanOrEqual(5);
});

function ctx(role: Role, call: Partial<{ caller_id: string; saved_at: string | null }> = {}, scope: string[] | null = null) {
  const session: Session = { userId: "me", orgId: "org", role, teamId: "T", aal: "aal2", fullName: "Me" };
  const repo = {
    getCall: vi.fn(async (id: string) => (id === CALL ? { id, lead_id: "L", caller_id: "agent", saved_at: "2026-11-19T00:00:00Z", ...call } : null)),
    checklist: vi.fn(async () => items),
    insert: vi.fn(async () => true),
  };
  const c: QaCtx = { session, repo, scope: async () => scope, audit: vi.fn(async () => {}) };
  return { c, repo };
}
const input = { callId: CALL, scores: { a: "pass", b: "fail", c: "pass" }, remarks: "Good opening" };

test("a super admin audits any saved call; score computed on the server", async () => {
  const { c, repo } = ctx("super_admin");
  expect(await saveAudit(c, input)).toEqual({ score: 67 });
  expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ call_id: CALL, agent_id: "agent", auditor_id: "me", score: 67, remarks: "Good opening" }));
});
test("a team leader audits only their team, never their own calls; admins and callers cannot audit", async () => {
  await expect(saveAudit(ctx("team_leader", {}, ["me", "other"]).c, input)).rejects.toThrow("forbidden");
  expect((await saveAudit(ctx("team_leader", {}, ["me", "agent"]).c, input)).score).toBe(67);
  await expect(saveAudit(ctx("team_leader", { caller_id: "me" }, ["me"]).c, input)).rejects.toThrow(/own/i);
  await expect(saveAudit(ctx("admin").c, input)).rejects.toThrow("forbidden");
  await expect(saveAudit(ctx("caller").c, input)).rejects.toThrow("forbidden");
});
test("every checklist item needs an answer; unsaved or already-audited calls are refused", async () => {
  await expect(saveAudit(ctx("super_admin").c, { ...input, scores: { a: "pass" } })).rejects.toThrow(/every/i);
  await expect(saveAudit(ctx("super_admin", { saved_at: null }).c, input)).rejects.toThrow(/saved/i);
  const dup = ctx("super_admin"); dup.repo.insert.mockResolvedValueOnce(false);
  await expect(saveAudit(dup.c, input)).rejects.toThrow(/already/i);
});

test("an audit with every item N/A is refused (it would score a misleading 0%)", async () => {
  await expect(saveAudit(ctx("super_admin").c, { ...input, scores: { a: "na", b: "na", c: "na" } })).rejects.toThrow(/at least one/i);
});
