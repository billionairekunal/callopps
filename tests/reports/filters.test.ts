import { test, expect } from "vitest";
import { rangeFor, parseFilters, filterQuery, prorate } from "@/lib/reports/filters";

const now = new Date("2026-11-19T06:00:00Z"); // Thu 19 Nov, 11:30 IST
const U = "11111111-1111-4111-8111-111111111111";

test("date presets in India time", () => {
  expect(rangeFor({ preset: "today" }, now)).toEqual({ from: "2026-11-18T18:30:00.000Z", to: "2026-11-19T18:30:00.000Z", label: "Today (2026-11-19)" });
  expect(rangeFor({ preset: "yesterday" }, now).from).toBe("2026-11-17T18:30:00.000Z");
  expect(rangeFor({ preset: "this_week" }, now).from).toBe("2026-11-15T18:30:00.000Z"); // Monday 16 Nov
  expect(rangeFor({ preset: "this_month" }, now)).toMatchObject({ from: "2026-10-31T18:30:00.000Z", to: "2026-11-30T18:30:00.000Z" });
  expect(rangeFor({ preset: "last_month" }, now)).toMatchObject({ from: "2026-09-30T18:30:00.000Z", to: "2026-10-31T18:30:00.000Z" });
  expect(rangeFor({ preset: "custom", from: "2026-11-01", to: "2026-11-05" }, now)).toMatchObject({ from: "2026-10-31T18:30:00.000Z", to: "2026-11-05T18:30:00.000Z" });
});
test("custom range with end before start or bad dates falls back to this month", () => {
  expect(rangeFor({ preset: "custom", from: "2026-11-09", to: "2026-11-01" }, now).label).toMatch(/This Month/);
  expect(rangeFor({ preset: "custom", from: "nope" }, now).label).toMatch(/This Month/);
});
test("parseFilters keeps only valid ids and known values", () => {
  const f = parseFilters({ preset: "today", processes: `${U},junk`, statuses: "won,hacked", agent_status: "active", city: " Pune " });
  expect(f).toMatchObject({ preset: "today", processes: [U], statuses: ["won"], agent_status: "active", city: "Pune" });
  expect(parseFilters({}).preset).toBe("this_month");
});
test("filterQuery round-trips", () => {
  const f = parseFilters({ preset: "custom", from: "2026-11-01", to: "2026-11-05", agents: U });
  expect(parseFilters(Object.fromEntries(new URLSearchParams(filterQuery(f))))).toEqual(f);
});
test("prorate targets by days of the range inside each month", () => {
  // 30-day November target 300, range = 10 days of November → 100
  expect(prorate([{ month: "2026-11-01", value: 300 }], "2026-10-31T18:30:00.000Z", "2026-11-10T18:30:00.000Z")).toBe(100);
  // spans Oct 31 (1 of 31 days of 310) + Nov 1 (1 of 30 days of 300) → 10 + 10
  expect(prorate([{ month: "2026-10-01", value: 310 }, { month: "2026-11-01", value: 300 }], "2026-10-30T18:30:00.000Z", "2026-11-01T18:30:00.000Z")).toBe(20);
});
