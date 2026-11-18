import { test, expect } from "vitest";
import { NAV, navFor, canAccess } from "@/lib/nav";

const labels = (n: typeof NAV) => n.map((s) => [s.section, s.items.map((i) => i.label)]);

test("nav order and labels match spec", () => {
  expect(labels(NAV)).toEqual([
    ["WORKSPACE", ["Pipeline / Overview", "Follow-Ups", "Lead Transfers", "Lead Management", "My tasks"]],
    ["ANALYTICS & PERFORMANCE", ["Reports and Analytics", "Process Business", "Daily Reports", "Targets", "Performance", "QA Audit"]],
    ["COMMUNICATION", ["Ops AI", "Communications", "Internal Chat", "WhatsApp Reports", "CRM Setup"]],
  ]);
});
test("caller sees no Lead Management, Reports, CRM Setup, Ops AI", () => {
  const all = navFor("caller").flatMap((s) => s.items.map((i) => i.label));
  for (const l of ["Lead Management", "Reports and Analytics", "CRM Setup", "Ops AI", "Lead Transfers"]) expect(all).not.toContain(l);
  expect(all).toContain("My tasks");
  expect(canAccess("caller", "/crm-setup")).toBe(false);
});
test("admin sees CRM Setup but not the audit log", () => {
  expect(navFor("admin").flatMap((s) => s.items.map((i) => i.label))).toContain("CRM Setup");
  expect(canAccess("admin", "/audit-log")).toBe(false);
});
test("super_admin can access every href including /audit-log", () => {
  for (const i of NAV.flatMap((s) => s.items)) expect(canAccess("super_admin", i.href)).toBe(true);
  expect(canAccess("super_admin", "/audit-log")).toBe(true);
});
test("sub-paths inherit access; unknown paths are open to signed-in users", () => {
  expect(canAccess("caller", "/crm-setup/users")).toBe(false);
  expect(canAccess("caller", "/forbidden")).toBe(true);
});
