import { z } from "zod";
import { AuthError, type Role, type Session } from "@/lib/auth/roles";
import { LOOKUP_TABLES, lookupSchema, dispositionSchema, inviteSchema, orgSettingsSchema, type LookupTable } from "./schemas";

export type Repo = {
  upsert(table: string, row: Record<string, unknown>): Promise<{ id: string }>;
  remove(table: string, id: string): Promise<void>;
  replaceTeamProcesses(teamId: string, processIds: string[]): Promise<void>;
  countActiveSuperAdmins(): Promise<number>;
  getProfile(userId: string): Promise<{ role: Role; status: "active" | "deactivated" } | null>;
  updateProfile(userId: string, patch: Record<string, unknown>): Promise<void>;
  inviteAuthUser(email: string): Promise<string>;
  insertProfile(row: { user_id: string; org_id: string; full_name: string; role: Role; team_id: string | null }): Promise<void>;
  signOutUser(userId: string): Promise<void>;
  updateOrg(patch: Record<string, unknown>): Promise<void>;
};
export type SetupCtx = {
  session: Session;
  repo: Repo;
  audit: (action: string, entity?: string, entityId?: string, meta?: Record<string, unknown>) => Promise<void>;
};

const uuid = z.string().uuid();
const forbid = () => { throw new AuthError("forbidden"); };
const superOnly = (c: SetupCtx) => c.session.role !== "super_admin" && forbid();
const isTop = (r: Role) => r === "super_admin" || r === "admin";

function lookupTable(t: string): LookupTable {
  if (!(LOOKUP_TABLES as readonly string[]).includes(t)) throw new Error("unknown table");
  return t as LookupTable;
}

export async function saveLookup(c: SetupCtx, table: LookupTable, row: unknown) {
  const t = lookupTable(table);
  const data = lookupSchema.parse(row);
  const { id } = await c.repo.upsert(t, { ...data, org_id: c.session.orgId });
  await c.audit(`setup.${t}.save`, t, id, { name: data.name });
  return id;
}

export async function deleteLookup(c: SetupCtx, table: LookupTable, id: string) {
  const t = lookupTable(table);
  await c.repo.remove(t, uuid.parse(id));
  await c.audit(`setup.${t}.delete`, t, id);
}

export async function saveDisposition(c: SetupCtx, row: unknown) {
  const data = dispositionSchema.parse(row);
  const { id } = await c.repo.upsert("dispositions", { ...data, org_id: c.session.orgId });
  await c.audit("setup.dispositions.save", "dispositions", id, { label: data.label, outcome: data.outcome });
  return id;
}

export async function setTeamProcesses(c: SetupCtx, teamId: string, processIds: string[]) {
  await c.repo.replaceTeamProcesses(uuid.parse(teamId), z.array(uuid).parse(processIds));
  await c.audit("setup.team_processes.save", "teams", teamId, { processIds });
}

export async function inviteUser(c: SetupCtx, input: unknown) {
  const data = inviteSchema.parse(input);
  if (isTop(data.role)) superOnly(c);
  const userId = await c.repo.inviteAuthUser(data.email);
  await c.repo.insertProfile({ user_id: userId, org_id: c.session.orgId, full_name: data.fullName, role: data.role, team_id: data.teamId ?? null });
  await c.audit("setup.user.invite", "user", userId, { role: data.role });
  return userId;
}

async function guardLastSuperAdmin(c: SetupCtx, userId: string, losingSuper: boolean) {
  const p = await c.repo.getProfile(userId);
  if (!p) throw new Error("user not found");
  if (losingSuper && p.role === "super_admin" && p.status === "active" && (await c.repo.countActiveSuperAdmins()) <= 1)
    throw new Error("last super admin");
  return p;
}

export async function setUserStatus(c: SetupCtx, userId: string, status: "active" | "deactivated") {
  if (userId === c.session.userId) throw new Error("You can't change your own status yourself");
  const p = await guardLastSuperAdmin(c, userId, status === "deactivated");
  if (isTop(p.role)) superOnly(c);
  await c.repo.updateProfile(userId, { status });
  if (status === "deactivated") await c.repo.signOutUser(userId);
  await c.audit("setup.user.status", "user", userId, { status });
}

export async function changeUserRole(c: SetupCtx, userId: string, role: Role, teamId?: string | null) {
  superOnly(c);
  await guardLastSuperAdmin(c, userId, role !== "super_admin");
  await c.repo.updateProfile(userId, teamId === undefined ? { role } : { role, team_id: teamId });
  await c.audit("setup.user.role", "user", userId, { role });
}

export async function updateOrgSettings(c: SetupCtx, input: unknown) {
  superOnly(c);
  const data = orgSettingsSchema.parse(input);
  await c.repo.updateOrg(data);
  await c.audit("setup.org.update", "orgs", c.session.orgId, data);
}
