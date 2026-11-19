import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { enabled, admin, makeOrg, makeUser, makeRow, makeLead, cleanup, type TestUser } from "./helpers";

describe.skipIf(!enabled)("RLS: chat, communications, QA", () => {
  let org: string, orgB: string, tA: string, tB: string;
  let sa: TestUser, ad: TestUser, tl: TestUser, c1: TestUser, c2: TestUser, cB: TestUser, outsider: TestUser;
  let general: string, teamA: string, teamB: string, dm: string, generalB: string;

  beforeAll(async () => {
    org = await makeOrg("CHAT"); orgB = await makeOrg("CHATB");
    tA = await makeRow("teams", { org_id: org, name: "A" }); tB = await makeRow("teams", { org_id: org, name: "B" });
    sa = await makeUser(org, "super_admin", "active", true); ad = await makeUser(org, "admin", "active", true);
    tl = await makeUser(org, "team_leader"); c1 = await makeUser(org, "caller"); c2 = await makeUser(org, "caller"); cB = await makeUser(org, "caller");
    outsider = await makeUser(orgB, "caller");
    await admin().from("profiles").update({ team_id: tA }).in("user_id", [tl.id, c1.id, c2.id]);
    await admin().from("profiles").update({ team_id: tB }).eq("user_id", cB.id);
    general = await makeRow("chat_channels", { org_id: org, kind: "org", name: "General" });
    generalB = await makeRow("chat_channels", { org_id: orgB, kind: "org", name: "General" });
    teamA = await makeRow("chat_channels", { org_id: org, kind: "team", name: "Team A", team_id: tA });
    teamB = await makeRow("chat_channels", { org_id: org, kind: "team", name: "Team B", team_id: tB });
    dm = await makeRow("chat_channels", { org_id: org, kind: "dm", name: "dm", dm_key: [c1.id, c2.id].sort().join(":") });
    await admin().from("chat_members").insert([{ channel_id: dm, user_id: c1.id }, { channel_id: dm, user_id: c2.id }]);
    await admin().from("chat_messages").insert([
      { org_id: org, channel_id: general, user_id: tl.id, body: "hello all" },
      { org_id: org, channel_id: teamB, user_id: cB.id, body: "team b only" },
      { org_id: org, channel_id: dm, user_id: c2.id, body: "psst" },
    ]);
  }, 120_000);
  afterAll(cleanup, 60_000);

  const chans = async (u: TestUser) => ((await u.client.from("chat_channels").select("id")).data ?? []).map((r) => r.id).sort();

  test("channel visibility: org for all, team for its team (and super admin), dm for members", async () => {
    expect(await chans(c1)).toEqual([general, teamA, dm].sort());
    expect(await chans(cB)).toEqual([general, teamB].sort());
    expect(await chans(sa)).toEqual([general, teamA, teamB].sort());
    expect(await chans(outsider)).toEqual([generalB]);
  });
  test("posting: as yourself, only where you can read", async () => {
    expect((await c1.client.from("chat_messages").insert({ org_id: org, channel_id: general, body: "hi" })).error).toBeNull();
    expect((await c1.client.from("chat_messages").insert({ org_id: org, channel_id: teamB, body: "sneak" })).error).toBeTruthy();
    expect((await c1.client.from("chat_messages").insert({ org_id: org, channel_id: general, body: "x", user_id: c2.id })).error).toBeTruthy();
    expect((await outsider.client.from("chat_messages").insert({ org_id: org, channel_id: general, body: "x" })).error).toBeTruthy();
  });
  test("users cannot create channels or join a dm", async () => {
    expect((await c1.client.from("chat_channels").insert({ org_id: org, kind: "org", name: "x" })).error).toBeTruthy();
    expect((await cB.client.from("chat_members").insert({ channel_id: dm, user_id: cB.id })).error).toBeTruthy();
  });
  test("unread counts others' messages since last read", async () => {
    const before = (await c1.client.rpc("chat_unread")).data as { channel_id: string; unread: number }[];
    expect(before.find((r) => r.channel_id === dm)?.unread).toBe(1);
    expect((await c1.client.from("chat_reads").upsert({ channel_id: dm, last_read_at: new Date().toISOString() })).error).toBeNull();
    const after = (await c1.client.rpc("chat_unread")).data as { channel_id: string }[];
    expect(after.find((r) => r.channel_id === dm)).toBeUndefined();
    expect((await cB.client.from("chat_reads").upsert({ channel_id: dm })).error).toBeTruthy();
  });

  test("communications: super admin all, TL team, caller own, admin none, no direct writes", async () => {
    const lead = await makeLead(org, { assigned_to: c1.id });
    const leadB = await makeLead(org, { assigned_to: cB.id });
    await admin().from("communications").insert([
      { org_id: org, lead_id: lead, user_id: c1.id, channel: "whatsapp" },
      { org_id: org, lead_id: leadB, user_id: cB.id, channel: "sms" },
    ]);
    const n = async (u: TestUser) => ((await u.client.from("communications").select("id")).data ?? []).length;
    expect([await n(sa), await n(tl), await n(c1), await n(ad)]).toEqual([2, 1, 1, 0]);
    expect((await c1.client.from("communications").insert({ org_id: org, lead_id: lead, user_id: c1.id, channel: "sms" })).error).toBeTruthy();
  });
  test("QA audits: agent sees own scores, TL team, admin all, no direct writes", async () => {
    const lead = await makeLead(org, { assigned_to: c2.id });
    const call = await makeRow("calls", { org_id: org, lead_id: lead, caller_id: c2.id });
    await admin().from("qa_audits").insert({ org_id: org, call_id: call, lead_id: lead, agent_id: c2.id, auditor_id: tl.id, scores: {}, score: 80 });
    const n = async (u: TestUser) => ((await u.client.from("qa_audits").select("id")).data ?? []).length;
    expect([await n(c2), await n(c1), await n(tl), await n(ad), await n(cB)]).toEqual([1, 0, 1, 1, 0]);
    expect((await tl.client.from("qa_audits").insert({ org_id: org, call_id: call, lead_id: lead, agent_id: c2.id, auditor_id: tl.id, scores: {}, score: 1 })).error).toBeTruthy();
  });
  test("report_data counts WhatsApp actions as WhatsApp Sent", async () => {
    const { data } = await admin().rpc("report_data", { f: { org, from: new Date(Date.now() - 86_400_000).toISOString(), to: new Date(Date.now() + 86_400_000).toISOString(), now_end: new Date().toISOString() } });
    expect(data.agents.find((a: { id: string }) => a.id === c1.id).whatsapp_sent).toBe(1);
  });
});
