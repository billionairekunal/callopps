import { test, expect } from "vitest";
import { decideAccess, needsMfa, type Session } from "@/lib/auth/roles";

const s = (role: Session["role"], aal: Session["aal"] = "aal2"): Session =>
  ({ userId: "u", orgId: "o", role, teamId: null, aal, fullName: "x" });

test("caller hitting admin action → forbidden", () => {
  expect(() => decideAccess({ hasUser: true, session: s("caller", "aal1") }, ["super_admin", "admin"])).toThrow("forbidden");
});
test("admins get in with a password only (two-step sign-in is off)", () => {
  expect(decideAccess({ hasUser: true, session: s("admin", "aal1") }, ["admin"]).role).toBe("admin");
  expect(decideAccess({ hasUser: true, session: s("super_admin", "aal1") }, []).role).toBe("super_admin");
});
test("admin at aal2 passes", () => {
  expect(decideAccess({ hasUser: true, session: s("admin") }, ["admin"]).role).toBe("admin");
});
test("team_leader at aal1 passes (no MFA needed)", () => {
  expect(decideAccess({ hasUser: true, session: s("team_leader", "aal1") }, ["team_leader"]).role).toBe("team_leader");
});
test("no roles listed = any signed-in role", () => {
  expect(decideAccess({ hasUser: true, session: s("caller", "aal1") }, []).role).toBe("caller");
});
test("no user → unauthenticated", () => {
  expect(() => decideAccess({ hasUser: false, session: null }, [])).toThrow("unauthenticated");
});
test("no profile / deactivated → not-set-up", () => {
  expect(() => decideAccess({ hasUser: true, session: null }, [])).toThrow("not-set-up");
});
test("needsMfa", () => {
  expect([needsMfa("super_admin"), needsMfa("admin"), needsMfa("team_leader"), needsMfa("caller")]).toEqual([false, false, false, false]); // two-step sign-in is off
});
