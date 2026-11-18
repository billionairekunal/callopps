"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireRole } from "@/lib/auth/session";
import { AuthError, type Role } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { supabaseRepo } from "@/lib/setup/repo";
import * as svc from "@/lib/setup/service";
import type { LookupTable } from "@/lib/setup/schemas";

export type Result = { ok: true } | { ok: false; error: string };

async function run(fn: (c: svc.SetupCtx) => Promise<unknown>): Promise<Result> {
  try {
    const session = await requireRole("super_admin", "admin");
    await fn({ session, repo: supabaseRepo(await createClient(), session), audit: logAudit });
    revalidatePath("/crm-setup");
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.reason === "forbidden" ? "Only a Super Admin can do that." : "Please sign in again." };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function saveLookup(table: LookupTable, row: unknown) { return run((c) => svc.saveLookup(c, table, row)); }
export async function deleteLookup(table: LookupTable, id: string) { return run((c) => svc.deleteLookup(c, table, id)); }
export async function saveDisposition(row: unknown) { return run((c) => svc.saveDisposition(c, row)); }
export async function deleteDisposition(id: string) {
  return run(async (c) => { await c.repo.remove("dispositions", id); await c.audit("setup.dispositions.delete", "dispositions", id); });
}
export async function setTeamProcesses(teamId: string, ids: string[]) { return run((c) => svc.setTeamProcesses(c, teamId, ids)); }
export async function inviteUser(input: unknown) { return run((c) => svc.inviteUser(c, input)); }
export async function setUserStatus(userId: string, status: "active" | "deactivated") { return run((c) => svc.setUserStatus(c, userId, status)); }
export async function changeUserRole(userId: string, role: Role) { return run((c) => svc.changeUserRole(c, userId, role)); }
export async function setUserTeam(userId: string, teamId: string | null) {
  return run(async (c) => { await c.repo.updateProfile(userId, { team_id: teamId }); await c.audit("setup.user.team", "user", userId, { teamId }); });
}
export async function updateOrgSettings(input: unknown) { return run((c) => svc.updateOrgSettings(c, input)); }
