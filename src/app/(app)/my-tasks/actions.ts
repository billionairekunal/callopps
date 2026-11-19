"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { runAction } from "@/lib/actions";
import { callCtx, touchAttendance } from "@/lib/calls/repo";
import { startCall as start, saveOutcome as save } from "@/lib/calls/service";
import { createAdminClient } from "@/lib/supabase/admin";

const CALLERS = ["super_admin", "team_leader", "caller"] as const;

export async function startCall(leadId: string) {
  return runAction(async () => start(await callCtx(await requireRole(...CALLERS)), leadId));
}

export async function saveOutcome(input: unknown) {
  return runAction(async () => {
    const r = await save(await callCtx(await requireRole(...CALLERS)), input);
    for (const p of ["/my-tasks", "/follow-ups", "/pipeline"]) revalidatePath(p);
    return r;
  });
}

export async function punchIn() {
  return runAction(async () => { await touchAttendance(await requireRole("team_leader", "caller"), true); revalidatePath("/", "layout"); });
}

export async function punchOut() {
  return runAction(async () => {
    const s = await requireRole("team_leader", "caller");
    const { error } = await createAdminClient().rpc("punch_out", { uid: s.userId });
    if (error) throw new Error("Could not punch out. Try again.");
    revalidatePath("/", "layout");
  });
}

export async function outcomeOptions() {
  return runAction(async () => {
    await requireRole(...CALLERS);
    const { dispositionOptions } = await import("@/lib/calls/queries");
    return dispositionOptions();
  });
}

/** Activity ping from an active tab. Returns whether an attendance session is open now. */
export async function heartbeat() {
  return runAction(async () => {
    const s = await requireRole("team_leader", "caller");
    await touchAttendance(s);
    const { myAttendance } = await import("@/lib/calls/queries");
    return (await myAttendance(s))?.open ?? false;
  });
}
