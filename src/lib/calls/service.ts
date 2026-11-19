import { z } from "zod";
import { AuthError, type Session } from "@/lib/auth/roles";
import type { EventRow } from "@/lib/leads/service";

export type Outcome = "in_progress" | "won" | "lost";
type Lead = { id: string; assigned_to: string | null; process_id: string | null; status: string; phone_enc: string };
type CallPatch = {
  saved_at: string; connected: boolean; disposition_id: string | null; notes: string;
  followup_at: string | null; duration_s: number | null; is_followup: boolean;
};
export type CallRepo = {
  /** Through the user's RLS client: null when they can't see it. */
  getLead(id: string): Promise<Lead | null>;
  createCall(row: { org_id: string; lead_id: string; caller_id: string }): Promise<string>;
  getCall(id: string): Promise<{ id: string; lead_id: string; caller_id: string; saved_at: string | null } | null>;
  disposition(id: string): Promise<{ id: string; process_id: string | null; outcome: Outcome } | null>;
  hasSavedCall(leadId: string): Promise<boolean>;
  /** Atomic: only saves a call that is not saved yet. False when it already was. */
  saveCall(id: string, patch: CallPatch): Promise<boolean>;
  updateLead(id: string, patch: { status: string; disposition_id: string | null; next_followup_at: string | null }): Promise<void>;
  insertEvents(rows: EventRow[]): Promise<void>;
  insertStatusHistory(rows: { org_id: string; lead_id: string; from_status: string; to_status: string; disposition_id: string | null; actor_id: string }[]): Promise<void>;
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
  const lead = await c.repo.getLead(call.lead_id);
  if (!lead) throw new Error("Lead not found.");

  const disp = d.dispositionId ? await c.repo.disposition(d.dispositionId) : null;
  if (d.dispositionId && !disp) throw new Error("Pick a disposition from the list.");
  if (disp?.process_id && disp.process_id !== lead.process_id) throw new Error("That disposition belongs to another process.");
  if (d.connected && !disp) throw new Error("Pick a disposition for a connected call.");
  if (d.followupAt && new Date(d.followupAt).getTime() <= Date.now()) throw new Error("Pick a follow-up time in the future.");

  const status = statusFor(disp?.outcome ?? null);
  const followup = d.followupAt ?? null;
  const saved = await c.repo.saveCall(call.id, {
    saved_at: new Date().toISOString(), connected: d.connected, disposition_id: disp?.id ?? null, notes: d.notes?.trim() ?? "",
    followup_at: followup, duration_s: d.durationS ?? null, is_followup: await c.repo.hasSavedCall(lead.id),
  });
  if (!saved) throw new Error("This call was already saved.");

  await c.repo.updateLead(lead.id, { status, disposition_id: disp?.id ?? null, next_followup_at: followup });
  const base = { org_id: s.orgId, lead_id: lead.id, actor_id: s.userId };
  if (lead.status !== status) await c.repo.insertStatusHistory([{ ...base, from_status: lead.status, to_status: status, disposition_id: disp?.id ?? null }]);
  await c.repo.insertEvents([{ ...base, type: "call", payload: {
    call_id: call.id, connected: d.connected, disposition_id: disp?.id ?? null, notes: d.notes?.trim() ?? "", followup_at: followup, duration_s: d.durationS ?? null,
  } }]);
  await c.repo.touch();
  return { status };
}
