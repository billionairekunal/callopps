import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { enabled, admin, makeOrg, makeUser, makeRow, makeLead, cleanup, type TestUser } from "./helpers";

describe.skipIf(!enabled)("RLS: calls and attendance", () => {
  let org: string, team: string;
  let sa: TestUser, ad: TestUser, tl: TestUser, c1: TestUser, c2: TestUser, cOut: TestUser;
  let call1: string, call2: string, callOut: string;

  beforeAll(async () => {
    org = await makeOrg("CALL");
    team = await makeRow("teams", { org_id: org, name: "T" });
    sa = await makeUser(org, "super_admin", "active", true);
    ad = await makeUser(org, "admin", "active", true);
    tl = await makeUser(org, "team_leader");
    c1 = await makeUser(org, "caller");
    c2 = await makeUser(org, "caller");
    cOut = await makeUser(org, "caller");
    await admin().from("profiles").update({ team_id: team }).in("user_id", [tl.id, c1.id, c2.id]);
    const mk = async (u: TestUser) => makeRow("calls", { org_id: org, lead_id: await makeLead(org, { assigned_to: u.id }), caller_id: u.id });
    call1 = await mk(c1); call2 = await mk(c2); callOut = await mk(cOut);
  }, 90_000);
  afterAll(cleanup, 60_000);

  const calls = async (u: TestUser) => ((await u.client.from("calls").select("id")).data ?? []).map((r) => r.id).sort();

  test("super admin sees every call", async () => {
    expect(await calls(sa)).toEqual([call1, call2, callOut].sort());
  });
  test("admin sees no call rows", async () => {
    expect(await calls(ad)).toEqual([]);
  });
  test("team leader sees their team's calls only", async () => {
    expect(await calls(tl)).toEqual([call1, call2].sort());
  });
  test("caller sees only own calls", async () => {
    expect(await calls(c1)).toEqual([call1]);
  });
  test("users cannot write calls or attendance", async () => {
    const lead = await makeLead(org, { assigned_to: c1.id });
    expect((await c1.client.from("calls").insert({ org_id: org, lead_id: lead, caller_id: c1.id })).error).toBeTruthy();
    expect((await c1.client.from("attendance_sessions").insert({ org_id: org, user_id: c1.id })).error).toBeTruthy();
  });
  test("users cannot call the attendance functions", async () => {
    expect((await c1.client.rpc("touch_attendance", { uid: c1.id, org })).error).toBeTruthy();
    expect((await c1.client.rpc("punch_out", { uid: c2.id })).error).toBeTruthy();
  });

  test("touch opens one session, punch out closes it, touch does not reopen, force does", async () => {
    const svc = admin();
    const open = async () => ((await svc.from("attendance_sessions").select("id, end_reason, punch_out").eq("user_id", c2.id)).data ?? []);
    await svc.rpc("touch_attendance", { uid: c2.id, org });
    await svc.rpc("touch_attendance", { uid: c2.id, org });
    expect((await open()).filter((s) => !s.punch_out)).toHaveLength(1);
    await svc.rpc("punch_out", { uid: c2.id });
    await svc.rpc("touch_attendance", { uid: c2.id, org });
    expect((await open()).filter((s) => !s.punch_out)).toHaveLength(0);
    await svc.rpc("touch_attendance", { uid: c2.id, org, force: true });
    expect((await open()).filter((s) => !s.punch_out)).toHaveLength(1);
  });

  test("a stale session is auto logged out and the next activity opens a new one", async () => {
    const svc = admin();
    await svc.from("attendance_sessions").insert({ org_id: org, user_id: c1.id, last_activity: new Date(Date.now() - 31 * 60_000).toISOString() });
    await svc.rpc("touch_attendance", { uid: c1.id, org });
    const rows = (await svc.from("attendance_sessions").select("end_reason, punch_out").eq("user_id", c1.id)).data ?? [];
    expect(rows.filter((r) => r.end_reason === "auto")).toHaveLength(1);
    expect(rows.filter((r) => !r.punch_out)).toHaveLength(1);
  });
  test("caller sees own attendance; admin sees all; team leader sees team", async () => {
    const users = async (u: TestUser) => new Set(((await u.client.from("attendance_sessions").select("user_id")).data ?? []).map((r) => r.user_id));
    expect([...await users(c1)]).toEqual([c1.id]);
    expect((await users(ad)).has(c2.id)).toBe(true);
    expect((await users(tl)).has(cOut.id)).toBe(false);
  });
});
