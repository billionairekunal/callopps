import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { enabled, admin, makeOrg, makeUser, cleanup, type TestUser } from "./helpers";

describe.skipIf(!enabled)("RLS", () => {
  let orgA: string, orgB: string;
  let sa: TestUser, ad: TestUser, caller: TestUser, adB: TestUser, gone: TestUser;

  beforeAll(async () => {
    orgA = await makeOrg("A"); orgB = await makeOrg("B");
    sa = await makeUser(orgA, "super_admin");
    ad = await makeUser(orgA, "admin");
    caller = await makeUser(orgA, "caller");
    adB = await makeUser(orgB, "admin");
    gone = await makeUser(orgA, "admin", "deactivated");
    await admin().from("audit_log").insert({ org_id: orgA, actor_id: sa.id, action: "test.seed" });
  }, 60_000);
  afterAll(cleanup, 60_000);

  test("caller cannot insert process", async () => {
    const r = await caller.client.from("processes").insert({ org_id: orgA, name: "X" }).select();
    expect(r.error?.code ?? (r.data?.length === 0 ? "42501" : "ok")).toBe("42501");
  });
  test("admin can insert process in own org", async () => {
    const r = await ad.client.from("processes").insert({ org_id: orgA, name: "SGI" }).select();
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(1);
  });
  test("admin cannot insert into another org", async () => {
    const r = await ad.client.from("processes").insert({ org_id: orgB, name: "X" });
    expect(r.error).not.toBeNull();
  });
  test("org B admin sees zero org A processes", async () => {
    const r = await adB.client.from("processes").select("id").eq("org_id", orgA);
    expect(r.data).toEqual([]);
  });
  test("caller can read setup tables of own org", async () => {
    const r = await caller.client.from("processes").select("id");
    expect(r.data!.length).toBeGreaterThan(0);
  });
  test("admin cannot read audit_log", async () => {
    const r = await ad.client.from("audit_log").select("id");
    expect(r.data).toEqual([]);
  });
  test("super_admin reads audit_log", async () => {
    const r = await sa.client.from("audit_log").select("id");
    expect(r.data!.length).toBeGreaterThan(0);
  });
  test("nobody can update or delete audit_log", async () => {
    await sa.client.from("audit_log").update({ action: "tampered" }).eq("org_id", orgA);
    await sa.client.from("audit_log").delete().eq("org_id", orgA);
    const r = await admin().from("audit_log").select("action").eq("org_id", orgA);
    expect(r.data!.map((x) => x.action)).toContain("test.seed");
    expect(r.data!.map((x) => x.action)).not.toContain("tampered");
  });
  test("users insert audit rows only as themselves", async () => {
    const ok = await caller.client.from("audit_log").insert({ org_id: orgA, actor_id: caller.id, action: "x" });
    expect(ok.error).toBeNull();
    const forged = await caller.client.from("audit_log").insert({ org_id: orgA, actor_id: sa.id, action: "x" });
    expect(forged.error).not.toBeNull();
  });
  test("deactivated user sees nothing", async () => {
    const r = await gone.client.from("processes").select("id");
    expect(r.data).toEqual([]);
  });
  test("nobody but service role reads org_keys", async () => {
    await admin().from("org_keys").insert({ org_id: orgA, key_id: "k1", data_key_wrapped: "x", hash_key_wrapped: "y" });
    const r = await sa.client.from("org_keys").select("*");
    expect(r.data).toEqual([]);
  });
  test("caller cannot change their own role", async () => {
    await caller.client.from("profiles").update({ role: "super_admin" }).eq("user_id", caller.id);
    const r = await admin().from("profiles").select("role").eq("user_id", caller.id).single();
    expect(r.data!.role).toBe("caller");
  });
  test("caller cannot see other profiles; admin sees org", async () => {
    expect((await caller.client.from("profiles").select("user_id")).data).toHaveLength(1);
    expect((await ad.client.from("profiles").select("user_id")).data!.length).toBeGreaterThanOrEqual(4);
  });
});
