import { test, expect } from "vitest";
import { winRate, breakdown, funnel, targetRows, fmtDuration } from "@/lib/reports/build";

const groups = [
  { dim: "total", a: null, b: null, s: null, leads: 10, followups: 30, in_progress: 4, won: 3, lost: 1 },
  { dim: "category", a: "c1", b: null, s: null, leads: 7, followups: 20, in_progress: 3, won: 3, lost: 0 },
  { dim: "category", a: null, b: null, s: null, leads: 3, followups: 10, in_progress: 1, won: 0, lost: 1 },
  { dim: "process_disposition", a: "p1", b: "d1", s: null, leads: 2, followups: 1, in_progress: 0, won: 2, lost: 0 },
  { dim: "status", a: null, b: null, s: "won", leads: 3, followups: 0, in_progress: 0, won: 3, lost: 0 },
];
const labels = { c1: "UG", p1: "SGI", d1: "Admission" };

test("winRate is Won ÷ (Won + Lost)", () => {
  expect(winRate(3, 1)).toBe(75);
  expect(winRate(0, 0)).toBe(0);
});
test("breakdown labels rows, names the empty group, sorts by leads, adds a Total row", () => {
  const t = breakdown(groups, "category", labels);
  expect(t.columns[0]).toBe("Product Category");
  expect(t.rows.map((r) => r.cells)).toEqual([["UG"], ["No Category"]]);
  expect(t.rows[0]).toMatchObject({ leads: 7, winRate: 100 });
  expect(t.total).toMatchObject({ leads: 10, followups: 30, winRate: 75 });
});
test("pair and status breakdowns", () => {
  expect(breakdown(groups, "process_disposition", labels).rows[0].cells).toEqual(["SGI", "Admission"]);
  expect(breakdown(groups, "status", labels).rows[0].cells).toEqual(["Won"]);
});
test("funnel shows % of total, which can pass 100%", () => {
  expect(funnel({ total: 10, followups: 30, in_progress: 4, won: 3 })).toEqual([
    { label: "Total Leads", value: 10, pct: 100 }, { label: "Touched Follow-up", value: 30, pct: 300 },
    { label: "In Progress", value: 4, pct: 40 }, { label: "Won", value: 3, pct: 30 },
  ]);
});
test("target rows: actual vs pro-rated target", () => {
  const agents = [{ id: "u1", name: "A", closures: 5, leads: 2, fresh_connected: 10, followup_calls: 3, presentations: 1 }];
  const rows = targetRows(agents, { u1: { closures: 10 } });
  expect(rows.find((r) => r.metric === "closures")).toMatchObject({ actual: 5, target: 10, pct: 50 });
  expect(rows.find((r) => r.metric === "whatsapp_sent")).toMatchObject({ actual: 0, target: 0, pct: 0 });
});
test("durations read like the screenshots", () => {
  expect(fmtDuration(6 * 3600 + 14 * 60)).toBe("6 hrs, 14 mins");
  expect(fmtDuration(45 * 60)).toBe("45 mins");
});
