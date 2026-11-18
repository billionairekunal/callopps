import { test, expect } from "vitest";
import { cleanPhone } from "@/lib/leads/phone";

const ok = (raw: unknown, primary: string, alternate: string | null = null) =>
  expect(cleanPhone(raw)).toEqual({ primary, alternate, valid: true });

test("strips formatting and Indian prefixes", () => {
  ok("+91 98765-43210", "9876543210");
  ok("09876543210", "9876543210");
  ok("919876543210", "9876543210");
  ok("0091 98765 43210", "9876543210");
  ok("(987) 654.3210", "9876543210");
});
test("Excel numbers, including scientific notation", () => {
  ok(9876543210, "9876543210");
  ok(9.87654321e9, "9876543210");
  ok("9.87654321E+09", "9876543210");
});
test("splits two numbers in one cell", () => {
  ok("98765 43210 / 91234 56789", "9876543210", "9123456789");
  ok("9876543210,9123456789", "9876543210", "9123456789");
  ok("9876543210 9123456789", "9876543210", "9123456789");
});
test("invalid numbers carry a reason", () => {
  expect(cleanPhone("12345")).toMatchObject({ valid: false, reason: "too_short" });
  expect(cleanPhone("5876543210")).toMatchObject({ valid: false, reason: "not_mobile" });
  expect(cleanPhone("98765432101234")).toMatchObject({ valid: false, reason: "too_long" });
  expect(cleanPhone("")).toMatchObject({ valid: false, reason: "blank", primary: null });
  expect(cleanPhone(null)).toMatchObject({ valid: false, reason: "blank" });
});

test("rounded scientific notation is rejected, not guessed", () => {
  expect(cleanPhone("9.88E+09")).toMatchObject({ valid: false, reason: "precision_lost" });
  expect(cleanPhone("9.87654321E+09")).toMatchObject({ valid: true, primary: "9876543210" });
});
