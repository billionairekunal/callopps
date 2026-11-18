import { test, expect } from "vitest";
import { searchKind } from "@/lib/leads/search";

test("searchKind", () => {
  expect(searchKind("98765 43210")).toEqual({ kind: "phone", phone: "9876543210" });
  expect(searchKind("3210")).toEqual({ kind: "last4", digits: "3210" });
  expect(searchKind(" ra ")).toEqual({ kind: "name", text: "ra" });
  expect(searchKind("r")).toEqual({ kind: "none" });
  expect(searchKind("123")).toEqual({ kind: "none" });
});
