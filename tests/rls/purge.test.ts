import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { enabled, admin, makeOrg, makeUser, makeRow, makeLead, cleanup, type TestUser } from "./helpers";

describe.skipIf(!enabled)("purge_org_data", () => {
  let a: string, b: string, ca: TestUser, cb: TestUser, leadB: string;
  beforeAll(async () => {
    a = await makeOrg("PURGEA"); b = await makeOrg("PURGEB");
    ca = await makeUser(a, "caller"); cb = await makeUser(b, "caller");
    for (let i = 0; i < 3; i++) {
      const l = await makeLead(a, { assigned_to: ca.id });
      await makeRow("calls", { org_id: a, lead_id: l, caller_id: ca.id });
      await admin().from("lead_events").insert({ org_id: a, lead_id: l, type: "created" });
    }
    leadB = await makeLead(b, { assigned_to: cb.id });
    await makeRow("processes", { org_id: a, name: "Keep me" });
  }, 90_000);
  afterAll(cleanup, 60_000);

  test("deletes one centre's customer data only, keeps setup, and is server-only", async () => {
    expect((await ca.client.rpc("purge_org_data", { org: a })).error).toBeTruthy();
    const { data } = await admin().rpc("purge_org_data", { org: a });
    expect(data).toEqual({ leads: 3 });
    const count = async (t: string, org: string) => (await admin().from(t).select("*", { count: "exact", head: true }).eq("org_id", org)).count;
    expect([await count("leads", a), await count("calls", a), await count("lead_events", a)]).toEqual([0, 0, 0]);
    expect(await count("processes", a)).toBe(1);
    expect((await admin().from("leads").select("id").eq("id", leadB)).data).toHaveLength(1);
  });
});
