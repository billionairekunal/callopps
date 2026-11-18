import { test, expect } from "vitest";
import { filterQuery } from "@/lib/leads/filterUrl";

test("a full phone number never goes into the URL: it is swapped for a hash token", () => {
  expect(filterQuery({ q: "98765 43210", status: "new", city: "" }, "ab".repeat(32))).toBe(`status=new&qh=${"ab".repeat(32)}`);
});
test("name and last-4 searches stay readable", () => {
  expect(filterQuery({ q: "Asha", process: "p1" }, null)).toBe("q=Asha&process=p1");
  expect(filterQuery({ q: "3210" }, null)).toBe("q=3210");
});
test("a phone query without a token is dropped rather than leaked", () => {
  expect(filterQuery({ q: "9876543210" }, null)).toBe("");
});
test("an active number search survives other filter changes until the box is used", () => {
  const t = "cd".repeat(32);
  expect(filterQuery({ q: "", qh: t, status: "won" }, null)).toBe(`status=won&qh=${t}`);
  expect(filterQuery({ q: "Asha", qh: t }, null)).toBe("q=Asha");
});
