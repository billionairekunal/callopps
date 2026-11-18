import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { decideAccess, AuthError, type Role, type Session } from "./roles";

/** Validated session for this request: user + active profile + MFA level. Null session = no profile or deactivated. */
export const loadSession = cache(async (): Promise<{ hasUser: boolean; session: Session | null }> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { hasUser: false, session: null };
  const { data: p } = await supabase.from("profiles")
    .select("org_id, role, team_id, status, full_name").eq("user_id", user.id).maybeSingle();
  if (!p || p.status !== "active") return { hasUser: true, session: null };
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return {
    hasUser: true,
    session: {
      userId: user.id, orgId: p.org_id, role: p.role as Role, teamId: p.team_id,
      aal: aal?.currentLevel === "aal2" ? "aal2" : "aal1", fullName: p.full_name,
    },
  };
});

export async function getSession(): Promise<Session | null> {
  return (await loadSession()).session;
}

/** Use at the top of every server action and protected page. Throws AuthError. */
export async function requireRole(...roles: Role[]): Promise<Session> {
  return decideAccess(await loadSession(), roles);
}
export { AuthError };
