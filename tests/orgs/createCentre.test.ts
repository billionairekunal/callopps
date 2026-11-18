import { test, expect } from "vitest";
import { createCentre, type CentreDeps } from "@/lib/orgs/createCentre";
import { generateKey } from "@/lib/crypto/fieldCrypto";

function fakeDeps(failAt?: string) {
  const calls: { step: string; arg: any }[] = [];
  const rec = (step: string, ret: any = undefined) => async (arg: any) => {
    calls.push({ step, arg });
    if (step === failAt) throw new Error("boom");
    return ret;
  };
  const deps: CentreDeps = {
    master: generateKey(),
    insertOrg: rec("org", "org-1"),
    insertKeys: rec("keys"),
    createOwner: rec("owner", "user-1"),
    insertProfile: rec("profile"),
    audit: rec("audit"),
    deleteOrg: rec("deleteOrg"),
  };
  return { calls, deps };
}

test("createCentre writes org, keys, owner profile and audit in order", async () => {
  const { calls, deps } = fakeDeps();
  const r = await createCentre({ name: "Reliable", ownerEmail: "o@x.in", ownerName: "Owner" }, deps);
  expect(r).toEqual({ orgId: "org-1", ownerUserId: "user-1" });
  expect(calls.map((c) => c.step)).toEqual(["org", "keys", "owner", "profile", "audit"]);
  const keys = calls[1].arg;
  expect(keys.key_id).toBe("k1");
  expect(keys.data_key_wrapped.startsWith("v1:master:")).toBe(true);
  expect(keys.hash_key_wrapped.startsWith("v1:master:")).toBe(true);
  expect(calls[3].arg).toMatchObject({ user_id: "user-1", org_id: "org-1", role: "super_admin" });
  expect(calls[4].arg).toMatchObject({ org_id: "org-1", action: "centre.created" });
});

test("failure after org insert removes the half-made org", async () => {
  const { calls, deps } = fakeDeps("owner");
  await expect(createCentre({ name: "R", ownerEmail: "o@x.in", ownerName: "O" }, deps)).rejects.toThrow("boom");
  expect(calls.at(-1)).toEqual({ step: "deleteOrg", arg: "org-1" });
});
