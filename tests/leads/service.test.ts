import { test, expect, vi } from "vitest";
import * as svc from "@/lib/leads/service";
import type { LeadCtx, LeadRepo } from "@/lib/leads/service";
import type { Role, Session } from "@/lib/auth/roles";
import { generateKey } from "@/lib/crypto/fieldCrypto";

const P = "8f8c9c51-2a6f-4b8e-9a2e-0d7b1c3e4f50";
const keys = { keyId: "k1", dataKey: generateKey(), hashKey: generateKey() };
function ctx(role: Role, over: Partial<LeadRepo> = {}) {
  const session: Session = { userId: "me", orgId: "org", role, teamId: null, aal: "aal2", fullName: "Me" };
  const repo: LeadRepo = {
    findByPhoneHash: vi.fn(async () => []),
    insertLeads: vi.fn(async (rows: unknown[]) => rows.map((_, i) => `lead-${i}`)),
    insertEvents: vi.fn(async () => {}),
    insertStatusHistory: vi.fn(async () => {}),
    ...over,
  };
  const audit = vi.fn(async () => {});
  const c: LeadCtx = { session, keys: async () => keys, repo, audit };
  return { c, repo, audit };
}

test("phone is required and must be a valid mobile", async () => {
  const { c, repo } = ctx("admin");
  await expect(svc.addLead(c, { phone: "" })).rejects.toThrow(/valid 10-digit/);
  await expect(svc.addLead(c, { phone: "12345" })).rejects.toThrow(/valid 10-digit/);
  expect(repo.insertLeads).not.toHaveBeenCalled();
});
test("callers and team leaders cannot add leads", async () => {
  for (const r of ["caller", "team_leader"] as Role[])
    await expect(ctx(r).c && svc.addLead(ctx(r).c, { phone: "9876543210" })).rejects.toThrow("forbidden");
});
test("duplicate in the same process returns duplicateOf unless forced", async () => {
  const { c, repo } = ctx("admin", { findByPhoneHash: vi.fn(async () => [{ id: "old", process_id: P }]) });
  expect(await svc.addLead(c, { phone: "+91 98765 43210", process_id: P })).toEqual({ duplicateOf: "old" });
  expect(repo.insertLeads).not.toHaveBeenCalled();
  expect(await svc.addLead(c, { phone: "9876543210", process_id: P, force: true })).toEqual({ id: "lead-0" });
});
test("same phone in another process is allowed", async () => {
  const { c } = ctx("admin", { findByPhoneHash: vi.fn(async () => [{ id: "old", process_id: "other" }]) });
  expect(await svc.addLead(c, { phone: "9876543210", process_id: P })).toEqual({ id: "lead-0" });
});
test("writes encrypted row, created event, status history and audit", async () => {
  const { c, repo, audit } = ctx("super_admin");
  await svc.addLead(c, { phone: "9876543210", name: "Asha", extra: { "Loan Amount": "5L" } });
  const row = (repo.insertLeads as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
  expect(JSON.stringify(row)).not.toContain("9876543210");
  expect(row).toMatchObject({ org_id: "org", name: "Asha", phone_last4: "3210", created_by: "me", extra: { "Loan Amount": "5L" } });
  expect(repo.insertEvents).toHaveBeenCalledWith([expect.objectContaining({ lead_id: "lead-0", type: "created", actor_id: "me", org_id: "org" })]);
  expect(repo.insertStatusHistory).toHaveBeenCalledWith([expect.objectContaining({ lead_id: "lead-0", to_status: "new" })]);
  expect(audit).toHaveBeenCalledWith("lead.create", "lead", "lead-0", { manual: true });
});
