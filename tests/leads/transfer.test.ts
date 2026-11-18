import { test, expect, vi } from "vitest";
import { transferLeads, type TransferCtx, type TransferRepo } from "@/lib/leads/transfer";
import type { Role, Session } from "@/lib/auth/roles";

const L1 = "11111111-1111-4111-8111-111111111111", L2 = "22222222-2222-4222-8222-222222222222";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", OUT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const people = { [A]: { user_id: A, role: "caller", team_id: "T1", status: "active" }, [B]: { user_id: B, role: "caller", team_id: "T1", status: "active" },
  [OUT]: { user_id: OUT, role: "caller", team_id: "T2", status: "active" } } as const;

function ctx(role: Role, leads = [{ id: L1, assigned_to: A }, { id: L2, assigned_to: A }]) {
  const session: Session = { userId: "me", orgId: "org", role, teamId: "T1", aal: "aal2", fullName: "Me" };
  const repo: TransferRepo = {
    getLeads: vi.fn(async (ids: string[]) => leads.filter((l) => ids.includes(l.id))),
    profilesByIds: vi.fn(async (ids: string[]) => ids.map((i) => people[i as keyof typeof people]).filter(Boolean)),
    updateAssignee: vi.fn(async () => {}),
    insertTransfers: vi.fn(async () => {}),
    insertEvents: vi.fn(async () => {}),
  };
  const audit = vi.fn(async () => {});
  return { c: { session, repo, audit } as TransferCtx, repo, audit };
}

test("team leader cannot move a lead to someone outside the team", async () => {
  const { c, repo } = ctx("team_leader");
  await expect(transferLeads(c, { leadIds: [L1], toUser: OUT, reason: "x" })).rejects.toThrow("forbidden");
  expect(repo.updateAssignee).not.toHaveBeenCalled();
});
test("team leader cannot take a lead from someone outside the team", async () => {
  const { c } = ctx("team_leader", [{ id: L1, assigned_to: OUT }]);
  await expect(transferLeads(c, { leadIds: [L1], toUser: B, reason: "x" })).rejects.toThrow("forbidden");
});
test("team leader can move within the team", async () => {
  const { c, repo } = ctx("team_leader");
  expect(await transferLeads(c, { leadIds: [L1, L2], toUser: B, reason: "Leave" })).toEqual({ moved: 2 });
  expect(repo.updateAssignee).toHaveBeenCalledWith([L1, L2], B);
});
test("admin can move to anyone active", async () => {
  const { c } = ctx("admin");
  expect(await transferLeads(c, { leadIds: [L1], toUser: OUT, reason: "" })).toEqual({ moved: 1 });
});
test("callers cannot transfer", async () => {
  await expect(transferLeads(ctx("caller").c, { leadIds: [L1], toUser: B, reason: "" })).rejects.toThrow("forbidden");
});
test("writes one transfer and one event per lead, and an audit row", async () => {
  const { c, repo, audit } = ctx("admin");
  await transferLeads(c, { leadIds: [L1, L2], toUser: B, reason: "Rebalance" });
  expect(repo.insertTransfers).toHaveBeenCalledWith([
    { org_id: "org", lead_id: L1, from_user: A, to_user: B, reason: "Rebalance", by_user: "me" },
    { org_id: "org", lead_id: L2, from_user: A, to_user: B, reason: "Rebalance", by_user: "me" },
  ]);
  expect((repo.insertEvents as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveLength(2);
  expect(audit).toHaveBeenCalledWith("lead.transfer", "user", B, { count: 2, reason: "Rebalance" });
});
test("leads already with that person are skipped", async () => {
  const { c, repo } = ctx("admin", [{ id: L1, assigned_to: B }, { id: L2, assigned_to: A }]);
  expect(await transferLeads(c, { leadIds: [L1, L2], toUser: B, reason: "" })).toEqual({ moved: 1 });
  expect(repo.updateAssignee).toHaveBeenCalledWith([L2], B);
});
test("empty or unknown leads are rejected; inactive target rejected", async () => {
  await expect(transferLeads(ctx("admin").c, { leadIds: [], toUser: B, reason: "" })).rejects.toThrow();
  await expect(transferLeads(ctx("admin", [{ id: L1, assigned_to: A }]).c, { leadIds: [L1, L2], toUser: B, reason: "" })).rejects.toThrow(/not found/);
  await expect(transferLeads(ctx("admin").c, { leadIds: [L1], toUser: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", reason: "" })).rejects.toThrow(/active caller/);
});
