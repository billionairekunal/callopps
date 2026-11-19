import { test, expect } from "vitest";
import { routeDecision } from "@/lib/auth/route";

const caller = { role: "caller" as const, status: "active" as const };
const admin = { role: "admin" as const, status: "active" as const };
const aal = (current: "aal1" | "aal2", next: "aal1" | "aal2" = current) => ({ current, next });

test("signed out goes to /login except public paths", () => {
  expect(routeDecision("/reports", null, null, aal("aal1"))).toEqual({ redirect: "/login" });
  expect(routeDecision("/login", null, null, aal("aal1"))).toEqual({ next: true });
  expect(routeDecision("/auth/callback", null, null, aal("aal1"))).toEqual({ next: true });
});
test("no profile or deactivated → /not-set-up", () => {
  expect(routeDecision("/reports", "u", null, aal("aal1"))).toEqual({ redirect: "/not-set-up" });
  expect(routeDecision("/reports", "u", { ...caller, status: "deactivated" }, aal("aal1"))).toEqual({ redirect: "/not-set-up" });
  expect(routeDecision("/set-password", "u", { ...caller, status: "deactivated" }, aal("aal1"))).toEqual({ redirect: "/not-set-up" });
});
test("caller on a management route gets a 403 rewrite, including sub-paths", () => {
  expect(routeDecision("/crm-setup", "u", caller, aal("aal1"))).toEqual({ forbidden: true });
  expect(routeDecision("/audit-log", "u", caller, aal("aal1"))).toEqual({ forbidden: true });
  expect(routeDecision("/leads/123", "u", caller, aal("aal1"))).toEqual({ forbidden: true });
  expect(routeDecision("/my-tasks", "u", caller, aal("aal1"))).toEqual({ next: true });
});
test("admin with an enrolled factor at aal1 must pass MFA before set-password", () => {
  expect(routeDecision("/set-password", "u", admin, aal("aal1", "aal2"))).toEqual({ redirect: "/mfa" });
  expect(routeDecision("/reports", "u", admin, aal("aal1", "aal2"))).toEqual({ redirect: "/mfa" });
});
test("newly invited admin (no factor yet) may set a password first", () => {
  expect(routeDecision("/set-password", "u", admin, aal("aal1", "aal1"))).toEqual({ next: true });
  expect(routeDecision("/reports", "u", admin, aal("aal1", "aal1"))).toEqual({ redirect: "/mfa" });
});
test("signed-in users on auth pages go home", () => {
  expect(routeDecision("/login", "u", caller, aal("aal1"))).toEqual({ redirect: "/my-tasks" });
  expect(routeDecision("/mfa", "u", admin, aal("aal2"))).toEqual({ redirect: "/reports" });
  expect(routeDecision("/", "u", admin, aal("aal2"))).toEqual({ redirect: "/reports" });
  expect(routeDecision("/mfa", "u", admin, aal("aal1", "aal2"))).toEqual({ next: true });
});

test("the health check is public (uptime monitors aren't signed in)", () => {
  expect(routeDecision("/api/health", null, null, { current: "aal1", next: "aal1" })).toEqual({ next: true });
});
