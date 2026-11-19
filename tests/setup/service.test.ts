import { test, expect, vi } from "vitest";
import * as svc from "@/lib/setup/service";
import type { Repo, SetupCtx } from "@/lib/setup/service";
import type { Session, Role } from "@/lib/auth/roles";

const pid = "8f8c9c51-2a6f-4b8e-9a2e-0d7b1c3e4f50";
function ctx(role: Role, over: Partial<Repo> = {}) {
  const session: Session = { userId: "me", orgId: "org", role, teamId: null, aal: "aal2", fullName: "Me" };
  const repo: Repo = {
    upsert: vi.fn(async () => ({ id: "new" })),
    remove: vi.fn(async () => {}),
    replaceTeamProcesses: vi.fn(async () => {}),
    countActiveSuperAdmins: vi.fn(async () => 2),
    getProfile: vi.fn(async () => ({ role: "caller" as Role, status: "active" as const })),
    updateProfile: vi.fn(async () => {}),
    inviteAuthUser: vi.fn(async () => "u-new"),
    insertProfile: vi.fn(async () => {}),
    signOutUser: vi.fn(async () => {}),
    updateOrg: vi.fn(async () => {}),
    ...over,
  };
  const audit = vi.fn(async () => {});
  const c: SetupCtx = { session, repo, audit };
  return { c, repo, audit };
}

test("admin inviting admin → forbidden", async () => {
  const { c } = ctx("admin");
  await expect(svc.inviteUser(c, { email: "a@b.in", fullName: "A", role: "admin" })).rejects.toThrow("forbidden");
  await expect(svc.inviteUser(c, { email: "a@b.in", fullName: "A", role: "super_admin" })).rejects.toThrow("forbidden");
});
test("super_admin inviting admin ok, profile in own org", async () => {
  const { c, repo, audit } = ctx("super_admin");
  await svc.inviteUser(c, { email: "a@b.in", fullName: "A", role: "admin" });
  expect(repo.insertProfile).toHaveBeenCalledWith({ user_id: "u-new", org_id: "org", full_name: "A", role: "admin", team_id: null });
  expect(audit).toHaveBeenCalledWith("setup.user.invite", "user", "u-new", { role: "admin" });
});
test("demoting last super_admin → error 'last super admin'", async () => {
  const { c } = ctx("super_admin", {
    countActiveSuperAdmins: vi.fn(async () => 1),
    getProfile: vi.fn(async () => ({ role: "super_admin" as Role, status: "active" as const })),
  });
  await expect(svc.changeUserRole(c, "other", "admin")).rejects.toThrow("last super admin");
  await expect(svc.setUserStatus(c, "other", "deactivated")).rejects.toThrow("last super admin");
});
test("only super_admin changes roles or org settings", async () => {
  const { c } = ctx("admin");
  await expect(svc.changeUserRole(c, "x", "caller")).rejects.toThrow("forbidden");
  await expect(svc.updateOrgSettings(c, { name: "C", idle_timeout_minutes: 30, ai_enabled: false })).rejects.toThrow("forbidden");
});
test("admin cannot deactivate a super_admin or admin", async () => {
  const { c } = ctx("admin", { getProfile: vi.fn(async () => ({ role: "admin" as Role, status: "active" as const })) });
  await expect(svc.setUserStatus(c, "x", "deactivated")).rejects.toThrow("forbidden");
});
test("deactivate signs the user out; you cannot deactivate yourself", async () => {
  const { c, repo } = ctx("admin");
  await svc.setUserStatus(c, "x", "deactivated");
  expect(repo.signOutUser).toHaveBeenCalledWith("x");
  await expect(svc.setUserStatus(c, "me", "deactivated")).rejects.toThrow("yourself");
});
test("every write action writes an audit row", async () => {
  const { c, audit } = ctx("super_admin");
  await svc.saveLookup(c, "processes", { name: "SGI" });
  await svc.deleteLookup(c, "processes", pid);
  await svc.saveDisposition(c, { process_id: pid, label: "Won it", outcome: "won", counts_presentation: false, sort: 1 });
  await svc.setTeamProcesses(c, pid, [pid]);
  await svc.setUserStatus(c, "x", "deactivated");
  await svc.changeUserRole(c, "x", "team_leader");
  await svc.updateOrgSettings(c, { name: "C", idle_timeout_minutes: 45, ai_enabled: true });
  expect((audit.mock.calls as unknown[][]).map((a) => a[0])).toEqual([
    "setup.processes.save", "setup.processes.delete", "setup.dispositions.save", "setup.team_processes.save",
    "setup.user.status", "setup.user.role", "setup.org.update",
  ]);
});
test("bad input rejected before touching the repo", async () => {
  const { c, repo } = ctx("super_admin");
  await expect(svc.saveLookup(c, "processes", { name: "" })).rejects.toThrow();
  await expect(svc.saveLookup(c, "orgs" as never, { name: "x" })).rejects.toThrow("unknown table");
  expect(repo.upsert).not.toHaveBeenCalled();
});
