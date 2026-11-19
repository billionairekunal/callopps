import { test, expect } from "vitest";
import { istDay, dueBucket, awaySeconds } from "@/lib/calls/time";

test("istDay is midnight to midnight India time", () => {
  // 2026-11-19 20:00 UTC = 2026-11-20 01:30 IST
  expect(istDay(new Date("2026-11-19T20:00:00Z"))).toEqual({ start: "2026-11-19T18:30:00.000Z", end: "2026-11-20T18:30:00.000Z" });
  expect(istDay(new Date("2026-11-19T10:00:00Z")).start).toBe("2026-11-18T18:30:00.000Z");
});
test("dueBucket: overdue, today, upcoming", () => {
  const now = new Date("2026-11-19T06:00:00Z"); // 11:30 IST
  expect(dueBucket("2026-11-19T05:00:00Z", now)).toBe("overdue");
  expect(dueBucket("2026-11-19T12:00:00Z", now)).toBe("today");
  expect(dueBucket("2026-11-19T19:00:00Z", now)).toBe("upcoming"); // 00:30 IST next day
});
test("awaySeconds rounds and ignores nonsense", () => {
  expect(awaySeconds(1000, 62_400)).toBe(61);
  expect(awaySeconds(null, 5000)).toBeNull();
  expect(awaySeconds(5000, 1000)).toBeNull();
});
