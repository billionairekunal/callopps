import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { enabled, admin, makeOrg, makeUser, makeRow, makeLead, cleanup, type TestUser } from "./helpers";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();

describe.skipIf(!enabled)("report_data", () => {
  let org: string, team: string, proc: string, dWon: string, dInt: string;
  let tl: TestUser, a: TestUser, b: TestUser, c: TestUser;
  const now = Date.now();
  const from = iso(now - 10 * DAY), to = iso(now + DAY);

  beforeAll(async () => {
    org = await makeOrg("REP");
    team = await makeRow("teams", { org_id: org, name: "T" });
    proc = await makeRow("processes", { org_id: org, name: "P" });
    dWon = await makeRow("dispositions", { org_id: org, process_id: proc, label: "Admission", outcome: "won", counts_presentation: true });
    dInt = await makeRow("dispositions", { org_id: org, process_id: proc, label: "Interested", outcome: "in_progress" });
    tl = await makeUser(org, "team_leader"); a = await makeUser(org, "caller"); b = await makeUser(org, "caller"); c = await makeUser(org, "caller");
    await admin().from("teams").update({ team_leader_id: tl.id }).eq("id", team);
    await admin().from("profiles").update({ team_id: team }).in("user_id", [tl.id, a.id, b.id]);
    const svc = { from: (t: string) => ({ insert: async (rows: unknown) => { const r = await admin().from(t).insert(rows as never); if (r.error) throw new Error(`${t}: ${r.error.message}`); return r; } }) };
    // a: lead 1 created in range, called twice (fresh connected, then a follow-up), won.
    const l1 = await makeLead(org, { assigned_to: a.id, process_id: proc, status: "won", disposition_id: dWon, created_at: iso(now - 2 * DAY) });
    await svc.from("calls").insert([
      { org_id: org, lead_id: l1, caller_id: a.id, saved_at: iso(now - 2 * DAY), connected: true, disposition_id: dInt, is_followup: false },
      { org_id: org, lead_id: l1, caller_id: a.id, saved_at: iso(now - DAY), connected: true, disposition_id: dWon, is_followup: true },
    ]);
    await svc.from("lead_status_history").insert([
      { org_id: org, lead_id: l1, from_status: "new", to_status: "in_progress", actor_id: a.id, at: iso(now - 2 * DAY) },
      { org_id: org, lead_id: l1, from_status: "in_progress", to_status: "won", actor_id: a.id, at: iso(now - DAY) },
    ]);
    // b: an old lead (created before the range), lost in range; one overdue open lead.
    const l2 = await makeLead(org, { assigned_to: b.id, process_id: proc, status: "lost", created_at: iso(now - 40 * DAY) });
    await svc.from("lead_status_history").insert({ org_id: org, lead_id: l2, from_status: "new", to_status: "lost", actor_id: b.id, at: iso(now - 3 * DAY) });
    await makeLead(org, { assigned_to: b.id, process_id: proc, status: "in_progress", next_followup_at: iso(now - 3_600_000), created_at: iso(now - 50 * DAY) });
    // c: outside the team; one lead in range.
    await makeLead(org, { assigned_to: c.id, created_at: iso(now - DAY) });
    await svc.from("attendance_sessions").insert(
      { org_id: org, user_id: a.id, punch_in: iso(now - DAY), punch_out: iso(now - DAY + 3_600_000), last_activity: iso(now - DAY + 3_600_000), end_reason: "punch_out", day: iso(now - DAY + 330 * 60_000).slice(0, 10) });
    await svc.from("attendance_sessions").insert({ org_id: org, user_id: c.id, punch_in: iso(now - 600_000), last_activity: iso(now - 60_000) });
  }, 120_000);
  afterAll(cleanup, 60_000);

  const run = async (extra: Record<string, unknown> = {}) => {
    const { data, error } = await admin().rpc("report_data", { f: { org, from, to, now_end: to, ...extra } });
    if (error) throw error;
    return data;
  };

  test("KPIs follow the metric definitions", async () => {
    const r = await run();
    expect(r.kpis).toMatchObject({ total: 2, won: 1, lost: 1, in_progress: 0, overdue: 1, followups: 1, calls: 2, connected: 2, attendance: 2, active_agents: 2 });
  });
  test("scope limits leads, calls and agents to the team", async () => {
    const r = await run({ scope: [tl.id, a.id, b.id] });
    expect(r.kpis.total).toBe(1); // c's lead is out
    expect(r.agents.map((x: { id: string }) => x.id).sort()).toEqual([tl.id, a.id, b.id].sort());
    expect(r.kpis.attendance).toBe(1);
  });
  test("per-agent target actuals", async () => {
    const ag = (await run()).agents.find((x: { id: string }) => x.id === a.id);
    expect(ag).toMatchObject({ calls: 2, fresh_connected: 1, followup_calls: 1, presentations: 1, leads: 1, closures: 1, seconds: 3600 });
  });
  test("breakdowns by grouping sets, with a total row", async () => {
    const g = (await run()).groups as { dim: string; a: string | null; b: string | null; s: string | null; leads: number; won: number; lost: number; followups: number }[];
    expect(g.find((x) => x.dim === "total")).toMatchObject({ leads: 2, won: 1, lost: 1, followups: 1 });
    expect(g.find((x) => x.dim === "process" && x.a === proc)).toMatchObject({ leads: 1, won: 1, lost: 1 });
    expect(g.find((x) => x.dim === "status" && x.s === "won")).toMatchObject({ won: 1 });
    expect(g.find((x) => x.dim === "agent_disposition" && x.a === a.id && x.b === dWon)).toMatchObject({ leads: 1 });
  });
  test("filters: status and agent", async () => {
    expect((await run({ statuses: ["won"] })).kpis.total).toBe(1);
    expect((await run({ agents: [b.id] })).kpis).toMatchObject({ total: 0, lost: 1, overdue: 1, calls: 0 });
  });
  test("disposition breakdown counts calls, with breakdown filters", async () => {
    const r = await run();
    expect(r.dispositions).toHaveLength(2);
    expect((await run({ b_dispositions: [dWon] })).dispositions).toEqual([{ id: dWon, count: 1 }]);
  });
  test("attendance and hours", async () => {
    const r = await run();
    expect(r.attendance.find((x: { user_id: string }) => x.user_id === c.id).status).toBe("active");
    expect(r.attendance.find((x: { user_id: string }) => x.user_id === a.id).status).toBe("logged_out");
    expect(r.hours.active_now).toBe(1);
  });
  test("only the server can run it", async () => {
    expect((await a.client.rpc("report_data", { f: { org, from, to, now_end: to } })).error).toBeTruthy();
  });
});

describe.skipIf(!enabled)("RLS: targets, saved reports, exports", () => {
  let org: string, team: string, tl: TestUser, mine: TestUser, other: TestUser, ad: TestUser;
  beforeAll(async () => {
    org = await makeOrg("TGT");
    team = await makeRow("teams", { org_id: org, name: "T" });
    tl = await makeUser(org, "team_leader"); mine = await makeUser(org, "caller"); other = await makeUser(org, "caller");
    ad = await makeUser(org, "admin", "active", true);
    await admin().from("profiles").update({ team_id: team }).in("user_id", [tl.id, mine.id]);
    for (const u of [mine, other]) await admin().from("targets").insert({ org_id: org, user_id: u.id, month: "2026-11-01", metric: "closures", value: 10 });
    await admin().from("report_exports").insert({ org_id: org, user_id: ad.id, access: "basic", view: "current", format: "csv", filters: {} });
  }, 90_000);
  afterAll(cleanup, 60_000);
  const users = async (u: TestUser) => ((await u.client.from("targets").select("user_id")).data ?? []).map((r) => r.user_id).sort();

  test("targets: caller sees own, TL sees team, nobody writes directly", async () => {
    expect(await users(mine)).toEqual([mine.id]);
    expect(await users(tl)).toEqual([mine.id]);
    expect((await users(ad)).length).toBe(2);
    expect((await tl.client.from("targets").insert({ org_id: org, user_id: mine.id, month: "2026-12-01", metric: "leads", value: 1 })).error).toBeTruthy();
  });
  test("export log is visible to the Super Admin only", async () => {
    expect((await ad.client.from("report_exports").select("id")).data).toEqual([]);
    expect((await mine.client.from("saved_reports").insert({ org_id: org, user_id: mine.id, name: "x", filters: {} })).error).toBeTruthy();
  });
});

describe.skipIf(!enabled)("report_data at volume", () => {
  let org: string;
  beforeAll(async () => {
    org = await makeOrg("VOL");
    const u = await makeUser(org, "caller");
    const now = Date.now();
    const ids: string[] = [];
    for (let b = 0; b < 20; b++) {
      const rows = Array.from({ length: 1000 }, (_, i) => ({ org_id: org, phone_enc: "v1:k:x:y:z", phone_hash: `v${b}-${i}`, phone_last4: "0000",
        assigned_to: u.id, status: i % 3 ? "in_progress" : "won", created_at: new Date(now - (i % 25) * 86_400_000).toISOString() }));
      const { data, error } = await admin().from("leads").insert(rows).select("id");
      if (error) throw error;
      ids.push(...data.map((d) => d.id));
    }
    for (let b = 0; b < 5; b++) {
      const { error } = await admin().from("calls").insert(ids.slice(b * 1000, b * 1000 + 1000).map((lead_id, i) => ({
        org_id: org, lead_id, caller_id: u.id, saved_at: new Date(now - (i % 20) * 86_400_000).toISOString(), connected: true, is_followup: i % 2 === 0 })));
      if (error) throw error;
    }
  }, 300_000);
  afterAll(cleanup, 120_000);

  test("20k leads and 5k calls report in under 5 seconds", async () => {
    const t = Date.now();
    const { data, error } = await admin().rpc("report_data", { f: { org, from: new Date(Date.now() - 30 * 86_400_000).toISOString(), to: new Date(Date.now() + 86_400_000).toISOString(), now_end: new Date().toISOString() } });
    if (error) throw error;
    expect(data.kpis.calls).toBe(5000);
    expect(Date.now() - t).toBeLessThan(5000);
  }, 120_000);
});
