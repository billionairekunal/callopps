import { test, expect } from "vitest";
import { idleExpired, latestActivity } from "@/lib/auth/idle";

test("expires only after the full idle window", () => {
  expect(idleExpired(0, 29 * 60_000, 30)).toBe(false);
  expect(idleExpired(0, 30 * 60_000, 30)).toBe(true);
});
test("activity in any tab counts: newest of local and shared wins", () => {
  expect(latestActivity(1000, "5000")).toBe(5000);
  expect(latestActivity(9000, "5000")).toBe(9000);
  expect(latestActivity(9000, null)).toBe(9000);
  expect(latestActivity(9000, "garbage")).toBe(9000);
});
