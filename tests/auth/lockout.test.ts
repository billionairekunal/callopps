import { test, expect } from "vitest";
import { evaluateLockout } from "@/lib/auth/lockout";

const now = new Date("2026-11-19T10:00:00Z");
const ago = (min: number, success = false) => ({ attempted_at: new Date(now.getTime() - min * 60_000).toISOString(), success });

test("4 failures not locked", () => {
  expect(evaluateLockout([ago(1), ago(2), ago(3), ago(4)], now).locked).toBe(false);
});
test("5th failure locks for 15 min from the latest failure", () => {
  const r = evaluateLockout([ago(1), ago(2), ago(3), ago(4), ago(5)], now);
  expect(r.locked).toBe(true);
  expect(r.retryAt!.toISOString()).toBe(new Date(now.getTime() + 14 * 60_000).toISOString());
});
test("success resets", () => {
  expect(evaluateLockout([ago(1), ago(2), ago(3, true), ago(4), ago(5), ago(6)], now).locked).toBe(false);
});
test("failures older than 15 min ignored", () => {
  expect(evaluateLockout([ago(1), ago(2), ago(16), ago(17), ago(18)], now).locked).toBe(false);
});
