import { test, expect, vi } from "vitest";
import { startCall, saveOutcome, statusFor, type CallCtx, type CallRepo } from "@/lib/calls/service";
import type { Role, Session } from "@/lib/auth/roles";

const LEAD = "11111111-1111-4111-8111-111111111111", CALL = "22222222-2222-4222-8222-222222222222";
const D_WON = "33333333-3333-4333-8333-333333333333", D_OTHER = "44444444-4444-4444-8444-444444444444";
const D_PREV = "66666666-6666-4666-8666-666666666666";
const ME = "me";
type LeadOver = Partial<{ assigned_to: string | null; status: string; disposition_id: string | null; next_followup_at: string | null }>;

function ctx(role: Role = "caller", over: Partial<CallRepo> = {}, lead: LeadOver = {}) {
  const session: Session = { userId: ME, orgId: "org", role, teamId: "T1", aal: "aal2", fullName: "Me" };
  const repo: CallRepo = {
    getLead: vi.fn(async (id: string) => (id === LEAD ? {
      id, assigned_to: ME, process_id: "P1", status: "new", phone_enc: "enc", disposition_id: null, next_followup_at: null, ...lead,
    } : null)),
    leadForCall: vi.fn(async (id: string) => (id === LEAD ? {
      id, assigned_to: ME, process_id: "P1", status: "new", phone_enc: "enc", disposition_id: null, next_followup_at: null, ...lead,
    } : null)),
    createCall: vi.fn(async () => CALL),
    getCall: vi.fn(async (id: string) => (id === CALL ? { id, lead_id: LEAD, caller_id: ME, saved_at: null } : null)),
    disposition: vi.fn(async (id: string) => (id === D_WON ? { id, process_id: "P1", outcome: "won" as const } : id === D_OTHER ? { id, process_id: "P2", outcome: "lost" as const } : null)),
    commit: vi.fn(async () => true),
    insertEvents: vi.fn(async () => {}),
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

test("saving a connected call commits call, lead and history in one step", async () => {
  const { c, repo } = ctx();
  const due = future();
  expect(await saveOutcome(c, { callId: CALL, connected: true, dispositionId: D_WON, notes: "Paid", followupAt: due, durationS: 120 }))
    .toEqual({ status: "won" });
  expect(repo.commit).toHaveBeenCalledWith(expect.objectContaining({
    callId: CALL, leadId: LEAD, connected: true, dispositionId: D_WON, notes: "Paid", followupAt: due, durationS: 120,
    status: "won", fromStatus: "new", leadDispositionId: D_WON, actorId: ME,
  }));
});
test("connected needs a disposition", async () => {
  await expect(saveOutcome(ctx().c, { callId: CALL, connected: true })).rejects.toThrow(/disposition/i);
});
test("no answer without a disposition keeps the lead's disposition, follow-up and status", async () => {
  const due = future();
  const { c, repo } = ctx("caller", {}, { status: "won", disposition_id: D_PREV, next_followup_at: due });
  expect(await saveOutcome(c, { callId: CALL, connected: false })).toEqual({ status: "won" });
  expect(repo.commit).toHaveBeenCalledWith(expect.objectContaining({ status: "won", leadDispositionId: D_PREV, followupAt: due, dispositionId: null }));
});
test("no answer on a new lead moves it to in progress; a new follow-up replaces the old one", async () => {
  const due = future();
  const { c, repo } = ctx("caller", {}, { next_followup_at: "2020-01-01T00:00:00Z" });
  await saveOutcome(c, { callId: CALL, connected: false, followupAt: due });
  expect(repo.commit).toHaveBeenCalledWith(expect.objectContaining({ status: "in_progress", followupAt: due }));
});
test("a disposition from another process is refused", async () => {
  await expect(saveOutcome(ctx().c, { callId: CALL, connected: true, dispositionId: D_OTHER })).rejects.toThrow(/process/i);
});
test("follow-up in the past is refused", async () => {
  await expect(saveOutcome(ctx().c, { callId: CALL, connected: false, followupAt: new Date(Date.now() - 3_600_000).toISOString() }))
    .rejects.toThrow(/future/i);
});
test("someone else's call cannot be saved", async () => {
  const other = ctx("caller", { getCall: vi.fn(async () => ({ id: CALL, lead_id: LEAD, caller_id: "x", saved_at: null })) });
  await expect(saveOutcome(other.c, { callId: CALL, connected: false })).rejects.toThrow("forbidden");
});
test("retrying a call that is already saved succeeds without writing again", async () => {
  const done = ctx("caller", { getCall: vi.fn(async () => ({ id: CALL, lead_id: LEAD, caller_id: ME, saved_at: "2026-11-19T00:00:00Z" })) }, { status: "won" });
  expect(await saveOutcome(done.c, { callId: CALL, connected: false })).toEqual({ status: "won" });
  expect(done.repo.commit).not.toHaveBeenCalled();
  const raced = ctx("caller", { commit: vi.fn(async () => false) });
  expect(await saveOutcome(raced.c, { callId: CALL, connected: false })).toEqual({ status: "in_progress" });
});

test("a lead moved to someone else mid-call: the call is still saved, the lead is left to its new owner", async () => {
  const { c, repo } = ctx("caller", { getLead: vi.fn(async () => null), leadForCall: vi.fn(async () => ({ id: LEAD, assigned_to: "other", process_id: "P1", status: "in_progress", phone_enc: "e", disposition_id: null, next_followup_at: null })) });
  expect(await saveOutcome(c, { callId: CALL, connected: false, notes: "rang" })).toEqual({ status: "in_progress" });
  expect(repo.commit).toHaveBeenCalledWith(expect.objectContaining({ updateLead: false, notes: "rang" }));
});
