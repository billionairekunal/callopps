import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { enabled, admin, makeOrg, makeUser, makeRow, makeLead, cleanup, type TestUser } from "./helpers";

describe.skipIf(!enabled)("RLS: leads", () => {
  let orgA: string, orgB: string, teamX: string, teamY: string, procX: string, procY: string, procB: string;
  let ad: TestUser, adB: TestUser, tl: TestUser, c1: TestUser, c2: TestUser, cY: TestUser;
  let leadC1: string, leadC1OtherProc: string, leadC2: string, leadCY: string;

  beforeAll(async () => {
    orgA = await makeOrg("LA"); orgB = await makeOrg("LB");
    teamX = await makeRow("teams", { org_id: orgA, name: "X" });
    teamY = await makeRow("teams", { org_id: orgA, name: "Y" });
    procX = await makeRow("processes", { org_id: orgA, name: "PX" });
    procY = await makeRow("processes", { org_id: orgA, name: "PY" });
    procB = await makeRow("processes", { org_id: orgB, name: "PB" });
    await admin().from("team_processes").insert([
      { team_id: teamX, process_id: procX, org_id: orgA }, { team_id: teamY, process_id: procY, org_id: orgA },
    ]);
    ad = await makeUser(orgA, "admin", "active", true);
    adB = await makeUser(orgB, "admin", "active", true);
    tl = await makeUser(orgA, "team_leader");
    c1 = await makeUser(orgA, "caller");
    c2 = await makeUser(orgA, "caller");
    cY = await makeUser(orgA, "caller");
    await admin().from("profiles").update({ team_id: teamX }).in("user_id", [tl.id, c1.id, c2.id]);
    await admin().from("profiles").update({ team_id: teamY }).eq("user_id", cY.id);
    leadC1 = await makeLead(orgA, { assigned_to: c1.id, process_id: procX });
    leadC1OtherProc = await makeLead(orgA, { assigned_to: c1.id, process_id: procY });
    leadC2 = await makeLead(orgA, { assigned_to: c2.id, process_id: procX });
    leadCY = await makeLead(orgA, { assigned_to: cY.id, process_id: procY });
  }, 90_000);
  afterAll(cleanup, 60_000);

  const ids = async (u: TestUser) => ((await u.client.from("leads").select("id")).data ?? []).map((r) => r.id).sort();

  test("caller sees only own assigned leads in their team's processes", async () => {
    expect(await ids(c1)).toEqual([leadC1]);
  });
  test("caller does not see own lead in a process outside their team", async () => {
    expect(await ids(c1)).not.toContain(leadC1OtherProc);
  });
  test("team leader sees team leads, not other team's", async () => {
    const seen = await ids(tl);
    expect(seen).toEqual(expect.arrayContaining([leadC1, leadC2]));
    expect(seen).not.toContain(leadCY);
  });
  test("admin sees all org leads; other org admin sees none", async () => {
    expect(await ids(ad)).toEqual([leadC1, leadC1OtherProc, leadC2, leadCY].sort());
    expect(await ids(adB)).toEqual([]);
  });
  test("caller cannot insert or update leads", async () => {
    const ins = await c1.client.from("leads").insert({ org_id: orgA, phone_enc: "x", phone_hash: "x", phone_last4: "0000" });
    expect(ins.error).not.toBeNull();
    await c1.client.from("leads").update({ status: "won" }).eq("id", leadC1);
    expect((await admin().from("leads").select("status").eq("id", leadC1).single()).data!.status).toBe("new");
  });
  test("team leader can reassign within team but not outside it", async () => {
    await tl.client.from("leads").update({ assigned_to: c2.id }).eq("id", leadC1);
    expect((await admin().from("leads").select("assigned_to").eq("id", leadC1).single()).data!.assigned_to).toBe(c2.id);
    const out = await tl.client.from("leads").update({ assigned_to: cY.id }).eq("id", leadC2);
    expect(out.error).not.toBeNull();
    expect((await admin().from("leads").select("assigned_to").eq("id", leadC2).single()).data!.assigned_to).toBe(c2.id);
    await admin().from("leads").update({ assigned_to: c1.id }).eq("id", leadC1);
  });
  test("cross-org process_id on a lead is rejected", async () => {
    const r = await admin().from("leads").insert({ org_id: orgA, process_id: procB, phone_enc: "x", phone_hash: "x", phone_last4: "0000" });
    expect(r.error?.code).toBe("23503");
  });
  test("cross-org team on a profile is rejected", async () => {
    const r = await admin().from("profiles").update({ team_id: teamX }).eq("user_id", adB.id);
    expect(r.error?.code).toBe("23503");
  });
  test("timeline rows visible only with the lead", async () => {
    await admin().from("lead_events").insert([
      { org_id: orgA, lead_id: leadC1, type: "note", payload: {} }, { org_id: orgA, lead_id: leadCY, type: "note", payload: {} },
    ]);
    const r = await c1.client.from("lead_events").select("lead_id");
    expect(r.data!.map((x) => x.lead_id)).toEqual([leadC1]);
  });
});

describe.skipIf(!enabled)("RLS: lead columns", () => {
  afterAll(cleanup, 60_000);
  test("team leader can change assignee/status but not phone, extra or process", async () => {
    const orgC = await makeOrg("LC");
    const team = await makeRow("teams", { org_id: orgC, name: "T" });
    const proc = await makeRow("processes", { org_id: orgC, name: "P" });
    const tl2 = await makeUser(orgC, "team_leader");
    const cc = await makeUser(orgC, "caller");
    await admin().from("profiles").update({ team_id: team }).in("user_id", [tl2.id, cc.id]);
    const lead = await makeLead(orgC, { assigned_to: cc.id });
    const bad = await tl2.client.from("leads").update({ phone_hash: "forged", extra: { x: "1" }, process_id: proc }).eq("id", lead);
    expect(bad.error).not.toBeNull();
    const good = await tl2.client.from("leads").update({ assigned_to: tl2.id, status: "in_progress" }).eq("id", lead);
    expect(good.error).toBeNull();
    const row = (await admin().from("leads").select("phone_hash, status, process_id").eq("id", lead).single()).data!;
    expect(row.phone_hash).not.toBe("forged");
    expect(row).toMatchObject({ status: "in_progress", process_id: null });
  }, 60_000);
});
