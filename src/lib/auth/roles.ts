export type Role = "super_admin" | "admin" | "team_leader" | "caller";
export type Session = {
  userId: string; orgId: string; role: Role; teamId: string | null; aal: "aal1" | "aal2"; fullName: string;
};
export type AuthReason = "unauthenticated" | "not-set-up" | "forbidden" | "aal2 required";
export class AuthError extends Error {
  constructor(public reason: AuthReason) { super(reason); }
}

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin", admin: "Admin", team_leader: "Team Leader", caller: "Caller",
};
// ponytail: two-step sign-in is off by the owner's choice; return `role === "super_admin" || role === "admin"` to require it again (plus a DB migration, see 20261119000022_no_mfa.sql).
export const needsMfa = (_role: Role) => false;

/** Pure access decision. `roles` empty = any signed-in, set-up user. MFA is checked before role. */
export function decideAccess(input: { hasUser: boolean; session: Session | null }, roles: Role[]): Session {
  if (!input.hasUser) throw new AuthError("unauthenticated");
  const s = input.session;
  if (!s) throw new AuthError("not-set-up");
  if (needsMfa(s.role) && s.aal !== "aal2") throw new AuthError("aal2 required");
  if (roles.length && !roles.includes(s.role)) throw new AuthError("forbidden");
  return s;
}
