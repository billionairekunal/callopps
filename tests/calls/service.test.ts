import { test, expect, vi } from "vitest";
import { startCall, saveOutcome, statusFor, type CallCtx, type CallRepo } from "@/lib/calls/service";
import type { Role, Session } from "@/lib/auth/roles";

const LEAD = "11111111-1111-4111-8111-111111111111", CALL = "22222222-2222-4222-8222-222222222222";
const D_WON = "33333333-3333-4333-8333-333333333333", D_OTHER = "44444444-4444-4444-8444-444444444444";
const ME = "me";

function ctx(role: Role = "caller", over: Partial<CallRepo> = {}, lead: Partial<{ assigned_to: string | null; status: string }> = {}) {
  const session: Session = { userId: ME, orgId: "org", role, teamId: "T1", aal: "aal2", fullName: "Me" };
  const repo: CallRepo = {
    getLead: vi.fn(async (id: string) => (id === LEAD ? { id, assigned_to: ME, process_id: "P1", status: "new", phone_enc: "enc", ...lead } : null)),
    createCall: vi.fn(async () => CALL),
    getCall: vi.fn(async (id: string) => (id === CALL ? { id, lead_id: LEAD, caller_id: ME, saved_at: null } : null)),
    disposition: vi.fn(async (id: string) => (id === D_WON ? { id, process_id: "P1", outcome: "won" as const } : id === D_OTHER ? { id, process_id: "P2", outcome: "lost" as const } : null)),
    hasSavedCall: vi.fn(async () => false),
    saveCall: vi.fn(async () => true),
    updateLead: vi.fn(async () => {}),
    insertEvents: vi.fn(async () => {}),
    insertStatusHistory: vi.fn(async () => {}),
    touch: vi.fn(async () => {}),
    ...over,
  };
  const c: CallCtx = { session, repo, reveal: vi.fn(async () => "9876543210"), audit: vi.fn(async () => {}) };
  return { c, repo };
}

test("statusFor follows the disposition outcome, else in progress", () => {
  expect(statusFor("won")).toBe("won");
  expect(statusFor("lost")).toBe("lost");
  expect(statusFor(null)).toBe("in_progress");
});

test("assignee starts a call: number revealed, pending call row, event, audit, activity", async () => {
  const { c, repo } = ctx();
  expect(await startCall(c, LEAD)).toEqual({ callId: CALL, phone: "9876543210" });
  expect(repo.createCall).toHaveBeenCalledWith(expect.objectContaining({ lead_id: LEAD, caller_id: ME, org_id: "org" }));
  expect(repo.insertEvents).toHaveBeenCalledWith([expect.objectContaining({ type: "call_started", lead_id: LEAD })]);
  expect(c.audit).toHaveBeenCalledWith("call.start", "lead", LEAD);
  expect(repo.touch).toHaveBeenCalled();
});
test("someone else's lead cannot be called (no number revealed)", async () => {
  const { c } = ctx("team_leader", {}, { assigned_to: "other" });
  await expect(startCall(c, LEAD)).rejects.toThrow("forbidden");
  expect(c.reveal).not.toHaveBeenCalled();
});
test("admin cannot reveal by calling; super admin can call any visible lead", async () => {
  await expect(startCall(ctx("admin", {}, { assigned_to: "other" }).c, LEAD)).rejects.toThrow("forbidden");
  expect((await startCall(ctx("super_admin", {}, { assigned_to: "other" }).c, LEAD)).phone).toBe("9876543210");
});
test("an invisible lead is not found", async () => {
  await expect(startCall(ctx().c, "55555555-5555-4555-8555-555555555555")).rejects.toThrow("not found");
});

const future = () => new Date(Date.now() + 86_400_000).toISOString();

test("saving a connected call: status from disposition, history, follow-up set", async () => {
  const { c, repo } = ctx();
  const due = future();
  expect(await saveOutcome(c, { callId: CALL, connected: true, dispositionId: D_WON, notes: "Paid", followupAt: due, durationS: 120 }))
    .toEqual({ status: "won" });
  expect(repo.saveCall).toHaveBeenCalledWith(CALL, expect.objectContaining({ connected: true, disposition_id: D_WON, duration_s: 120, is_followup: false, followup_at: due }));
  expect(repo.updateLead).toHaveBeenCalledWith(LEAD, { status: "won", disposition_id: D_WON, next_followup_at: due });
  expect(repo.insertStatusHistory).toHaveBeenCalledWith([expect.objectContaining({ from_status: "new", to_status: "won", disposition_id: D_WON })]);
  expect(repo.insertEvents).toHaveBeenCalledWith([expect.objectContaining({ type: "call", payload: expect.objectContaining({ connected: true, notes: "Paid" }) })]);
});
test("connected needs a disposition", async () => {
  await expect(saveOutcome(ctx().c, { callId: CALL, connected: true })).rejects.toThrow(/disposition/i);
});
test("not connected without disposition: in progress, follow-up cleared, no history when unchanged", async () => {
  const { c, repo } = ctx("caller", { hasSavedCall: vi.fn(async () => true) }, { status: "in_progress" });
  expect(await saveOutcome(c, { callId: CALL, connected: false })).toEqual({ status: "in_progress" });
  expect(repo.saveCall).toHaveBeenCalledWith(CALL, expect.objectContaining({ is_followup: true, followup_at: null }));
  expect(repo.updateLead).toHaveBeenCalledWith(LEAD, { status: "in_progress", disposition_id: null, next_followup_at: null });
  expect(repo.insertStatusHistory).not.toHaveBeenCalled();
});
test("a disposition from another process is refused", async () => {
  await expect(saveOutcome(ctx().c, { callId: CALL, connected: true, dispositionId: D_OTHER })).rejects.toThrow(/process/i);
});
test("follow-up in the past is refused", async () => {
  await expect(saveOutcome(ctx().c, { callId: CALL, connected: false, followupAt: new Date(Date.now() - 3_600_000).toISOString() }))
    .rejects.toThrow(/future/i);
});
test("someone else's call, or one already saved, cannot be saved", async () => {
  const other = ctx("caller", { getCall: vi.fn(async () => ({ id: CALL, lead_id: LEAD, caller_id: "x", saved_at: null })) });
  await expect(saveOutcome(other.c, { callId: CALL, connected: false })).rejects.toThrow("forbidden");
  const saved = ctx("caller", { saveCall: vi.fn(async () => false) });
  await expect(saveOutcome(saved.c, { callId: CALL, connected: false })).rejects.toThrow(/already saved/i);
  expect(saved.repo.updateLead).not.toHaveBeenCalled();
});
