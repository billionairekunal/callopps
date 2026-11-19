import { test, expect } from "vitest";
import JSZip from "jszip";
import { purgeConfirmed, rowsToSheet, zipSheets } from "@/lib/data/pack";

test("delete needs the exact phrase with the centre name", () => {
  expect(purgeConfirmed("DELETE Demo Centre", "Demo Centre")).toBe(true);
  expect(purgeConfirmed("  DELETE Demo Centre ", "Demo Centre")).toBe(true);
  expect(purgeConfirmed("delete demo centre", "Demo Centre")).toBe(false);
  expect(purgeConfirmed("DELETE", "Demo Centre")).toBe(false);
});
test("rows become a sheet; nested values are JSON; columns are the union of keys", () => {
  const s = rowsToSheet("calls", [{ a: 1, b: { x: 1 } }, { a: 2, c: null }]);
  expect(s.columns).toEqual(["a", "b", "c"]);
  expect(s.rows).toEqual([[1, '{"x":1}', ""], [2, "", ""]]);
});
test("zip holds one CSV per sheet plus a README", async () => {
  const buf = await zipSheets([rowsToSheet("leads", [{ name: "Ravi", phone: "9876543210" }])], "Exported for Demo");
  const z = await JSZip.loadAsync(buf);
  expect(Object.keys(z.files).sort()).toEqual(["README.txt", "leads.csv"]);
  expect(await z.file("leads.csv")!.async("string")).toContain("Ravi,9876543210");
});

test("every exported table has a stable sort order (so paging never skips or repeats rows)", async () => {
  const { EXPORT_TABLES } = await import("@/lib/data/tables");
  for (const [t, order] of Object.entries(EXPORT_TABLES)) expect(order.length, t).toBeGreaterThan(0);
  expect(Object.keys(EXPORT_TABLES)).toEqual(expect.arrayContaining(["calls", "lead_events", "audit_log", "team_processes", "orgs"]));
});
