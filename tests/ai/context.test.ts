import { test, expect } from "vitest";
import { aiContext } from "@/lib/ai/context";

const raw = {
  kpis: { total: 10, in_progress: 4, won: 3, lost: 1, overdue: 2, due_today: 1, active_agents: 2, followups: 6, attendance: 4, calls: 20, connected: 12 },
  daily: [{ day: "2026-11-19", followups: 2, wins: 1, calls: 5 }],
  groups: [{ dim: "total", a: null, b: null, s: null, leads: 10, followups: 6, in_progress: 4, won: 3, lost: 1 },
    { dim: "process", a: "p1", b: null, s: null, leads: 10, followups: 6, in_progress: 4, won: 3, lost: 1 }],
  dispositions: [{ id: "d1", count: 5 }],
  agents: [{ id: "u1", name: "Asha", tl: "Reena", status: "active", calls: 20, connected: 12, lost: 1, seconds: 7200,
    fresh_connected: 5, followup_calls: 6, presentations: 2, whatsapp_sent: 3, leads: 10, closures: 3 }],
  attendance: [{ user_id: "u1", day: "2026-11-19", punch_in: "x", punch_out: null, last_activity: "y", seconds: 7200, status: "active" }],
  hours: { seconds: 7200, active_now: 1, first_login: null, last_activity: null },
  lead_ids: ["11111111-1111-4111-8111-111111111111"],
};

test("the AI gets totals with names, never ids, lead ids or contact fields", () => {
  const ctx = aiContext([{ label: "This Month", raw: raw as never }], { p1: "SGI", d1: "Interested", u1: "Asha" });
  const json = JSON.stringify(ctx);
  expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no uuids at all
  expect(json).not.toMatch(/phone|email|lead_ids/i);
  expect(ctx[0].kpis).toMatchObject({ total_leads: 10, win_rate_pct: 75 });
  expect(ctx[0].breakdowns.process[0]).toMatchObject({ name: "SGI", won: 3 });
  expect(ctx[0].agents[0]).toMatchObject({ name: "Asha", closures: 3, logged_hours: 2 });
  expect(ctx[0].dispositions).toEqual([{ name: "Interested", calls: 5 }]);
});
