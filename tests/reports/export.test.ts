import { test, expect } from "vitest";
import { toCsv, basicSheets, leadSheet } from "@/lib/reports/export";

const raw = {
  kpis: { total: 2, in_progress: 0, won: 1, lost: 1, overdue: 0, due_today: 0, active_agents: 1, followups: 3, attendance: 1, calls: 4, connected: 2 },
  daily: [{ day: "2026-11-19", followups: 3, wins: 1, calls: 4 }],
  groups: [{ dim: "total", a: null, b: null, s: null, leads: 2, followups: 3, in_progress: 0, won: 1, lost: 1 }],
  dispositions: [], agents: [], attendance: [], hours: { seconds: 0, active_now: 0, first_login: null, last_activity: null },
};

test("CSV escapes quotes, commas and newlines, and guards formula injection", () => {
  const csv = toCsv([{ name: "T", columns: ["A", "B"], rows: [['say "hi"', "x,y"], ["line\nbreak", "=SUM(A1)"]] }]);
  expect(csv).toBe('T\r\nA,B\r\n"say ""hi""","x,y"\r\n"line\nbreak",\'=SUM(A1)\r\n');
});
test("basic current view: summary + five breakdowns; detailed adds more", () => {
  const cur = basicSheets(raw as never, {}, {}, "current");
  expect(cur.map((s) => s.name)).toEqual(["Summary", "Product Category", "Product", "Agent", "Status", "Lead Type"]);
  expect(cur[0].rows).toContainEqual(["Win Rate", "50%"]);
  const det = basicSheets(raw as never, {}, {}, "detailed");
  expect(det.length).toBeGreaterThan(cur.length);
  expect(det.map((s) => s.name)).toContain("Agent × Disposition");
  // breakdown sheets end with a Total row
  expect(cur[1].rows.at(-1)?.[0]).toBe("Total");
});
test("lead sheet: detailed adds extra and sensitive columns", () => {
  const leads = [{ name: "A", phone: "9876543210", extra: { Board: "CBSE" }, sensitive: { PAN: "X" } } as never];
  expect(leadSheet(leads, "current").columns).not.toContain("Board");
  const d = leadSheet(leads, "detailed");
  expect(d.columns).toEqual(expect.arrayContaining(["Board", "PAN (sensitive)"]));
  expect(d.rows[0]).toContain("CBSE");
});
