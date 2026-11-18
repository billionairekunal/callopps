import { canAccess, homeFor } from "@/lib/nav";
import { needsMfa, type Role } from "./roles";

export type Decision = { next: true } | { redirect: string } | { forbidden: true };
type Profile = { role: Role; status: "active" | "deactivated" } | null;

const PUBLIC = ["/login", "/auth/callback"];
const AUTH_PAGES = ["/login", "/mfa", "/not-set-up", "/"];

/** Pure middleware routing: sign-in, set-up, MFA, then role access. `aal.next === "aal2"` means a factor is enrolled. */
export function routeDecision(path: string, userId: string | null, p: Profile, aal: { current: string; next: string }): Decision {
  const to = (r: string): Decision => (r === path ? { next: true } : { redirect: r });
  if (!userId) return PUBLIC.includes(path) ? { next: true } : to("/login");
  if (!p || p.status !== "active") return to("/not-set-up");

  if (needsMfa(p.role) && aal.current !== "aal2") {
    // A newly invited admin has no factor yet: let them set a password, then enrol.
    if (path === "/set-password" && aal.next !== "aal2") return { next: true };
    return to("/mfa");
  }
  if (path === "/set-password") return { next: true };
  if (AUTH_PAGES.includes(path)) return to(homeFor(p.role));
  return canAccess(p.role, path) ? { next: true } : { forbidden: true };
}
