import { z } from "zod";
import { AuthError, type Session } from "@/lib/auth/roles";
import type { EventRow } from "@/lib/leads/service";

export type Outcome = "in_progress" | "won" | "lost";
type Lead = {
  id: string; assigned_to: string | null; process_id: string | null; status: string; phone_enc: string;
  disposition_id: string | null; next_followup_at: string | null;
};
export type CommitInput = {
  callId: string; leadId: string; actorId: string; connected: boolean; dispositionId: string | null; notes: string;
  followupAt: string | null; durationS: number | null; status: Outcome; fromStatus: string; leadDispositionId: string | null;
  updateLead: boolean;
};
export type CallRepo = {
  /** Through the user's RLS client: null when they can't see it. */
  getLead(id: string): Promise<Lead | null>;
  /** Server read of a call's lead (the caller owns the call, not necessarily the lead any more). */
  leadForCall(id: string): Promise<Lead | null>;
  createCall(row: { org_id: string; lead_id: string; caller_id: string }): Promise<string>;
  getCall(id: string): Promise<{ id: string; lead_id: string; caller_id: string; saved_at: string | null } | null>;
  disposition(id: string): Promise<{ id: string; process_id: string | null; outcome: Outcome } | null>;
  /** One transaction: saves the call (only if unsaved), updates the lead, writes history and timeline. False if already saved. */
  commit(input: CommitInput): Promise<boolean>;
  insertEvents(rows: EventRow[]): Promise<void>;
  /** Attendance activity for the current user. */
  touch(): Promise<void>;
};
export type CallCtx = {
  session: Session; repo: CallRepo;
  reveal: (phoneEnc: string) => Promise<string>;
  audit: (action: string, entity?: string, entityId?: string, meta?: Record<string, unknown>) => Promise<void>;
};

/** §14: after the first saved call, status follows the latest disposition's outcome. */
export const statusFor = (outcome: Outcome | null): Outcome => outcome ?? "in_progress";

/** Only the lead's assignee (or a super admin) dials; the number is revealed to them alone. */
export async function startCall(c: CallCtx, leadId: string): Promise<{ callId: string; phone: string }> {
  const { session: s } = c;
  const lead = await c.repo.getLead(z.string().uuid().parse(leadId));
  if (!lead) throw new Error("Lead not found.");
  if (s.role !== "super_admin" && lead.assigned_to !== s.userId) throw new AuthError("forbidden");
  const phone = await c.reveal(lead.phone_enc);
  const callId = await c.repo.createCall({ org_id: s.orgId, lead_id: lead.id, caller_id: s.userId });
  await c.repo.insertEvents([{ org_id: s.orgId, lead_id: lead.id, type: "call_started", payload: { call_id: callId }, actor_id: s.userId }]);
  await c.audit("call.start", "lead", lead.id);
  await c.repo.touch();
  return { callId, phone };
}

const schema = z.object({
  callId: z.string().uuid(),
  connected: z.boolean(),
  dispositionId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).optional(),
  followupAt: z.string().datetime({ offset: true }).nullable().optional(),
  durationS: z.number().int().min(0).max(86_400).nullable().optional(),
});

export async function saveOutcome(c: CallCtx, input: unknown): Promise<{ status: Outcome }> {
  const { session: s } = c;
  const d = schema.parse(input);
  const call = await c.repo.getCall(d.callId);
  if (!call) throw new Error("Call not found.");
  if (call.caller_id !== s.userId) throw new AuthError("forbidden");
  // The call is the caller's own, so read its lead directly: it may have been moved to someone else mid-call.
  const lead = await c.repo.leadForCall(call.lead_id);
  if (!lead) throw new Error("Lead not found.");
  const ownsLead = s.role === "super_admin" || lead.assigned_to === s.userId;

  // A retry after a lost response: the save already went through.
  if (call.saved_at) return { status: lead.status as Outcome };

  const disp = d.dispositionId ? await c.repo.disposition(d.dispositionId) : null;
  if (d.dispositionId && !disp) throw new Error("Pick a disposition from the list.");
  if (disp?.process_id && disp.process_id !== lead.process_id) throw new Error("That disposition belongs to another process.");
  if (d.connected && !disp) throw new Error("Pick a disposition for a connected call.");
  if (d.followupAt && new Date(d.followupAt).getTime() <= Date.now()) throw new Error("Pick a follow-up time in the future.");

  // No answer and no disposition: the lead keeps what it had (a new lead becomes In progress).
  const keep = !disp;
  const status = keep ? (lead.status === "new" ? "in_progress" : (lead.status as Outcome)) : statusFor(disp.outcome);
  const followupAt = d.followupAt ?? (keep ? lead.next_followup_at : null);
  await c.repo.commit({
    callId: call.id, leadId: lead.id, actorId: s.userId, connected: d.connected, dispositionId: disp?.id ?? null,
    notes: d.notes?.trim() ?? "", followupAt, durationS: d.durationS ?? null, status, fromStatus: lead.status,
    leadDispositionId: keep ? lead.disposition_id : disp.id,
    updateLead: ownsLead, // a moved lead keeps its new owner's status and follow-up; the call is still recorded
  }); // false = a double tap already saved it; same result either way
  await c.repo.touch();
  return { status: ownsLead ? status : (lead.status as Outcome) };
}
