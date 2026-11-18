import { z } from "zod";
import { AuthError, type Session } from "@/lib/auth/roles";

type Person = { user_id: string; role: string; team_id: string | null; status: string };
export type TransferRepo = {
  getLeads(ids: string[]): Promise<{ id: string; assigned_to: string | null }[]>;
  profilesByIds(ids: string[]): Promise<Person[]>;
  updateAssignee(ids: string[], toUser: string): Promise<void>;
  insertTransfers(rows: { org_id: string; lead_id: string; from_user: string | null; to_user: string; reason: string; by_user: string }[]): Promise<void>;
  insertEvents(rows: { org_id: string; lead_id: string; type: string; payload: Record<string, unknown>; actor_id: string }[]): Promise<void>;
};
export type TransferCtx = {
  session: Session; repo: TransferRepo;
  audit: (action: string, entity?: string, entityId?: string, meta?: Record<string, unknown>) => Promise<void>;
};

const schema = z.object({
  leadIds: z.array(z.string().uuid()).min(1, "Pick at least one lead.").max(2000),
  toUser: z.string().uuid(),
  reason: z.string().max(300),
});

/** Assign or move leads. Admins: any lead to any active caller/TL. Team leaders: only within their own team. */
export async function transferLeads(c: TransferCtx, input: unknown): Promise<{ moved: number }> {
  const { role, teamId, orgId, userId } = c.session;
  if (role === "caller") throw new AuthError("forbidden");
  const d = schema.parse(input);
  const ids = [...new Set(d.leadIds)];

  const leads = await c.repo.getLeads(ids);
  if (leads.length !== ids.length) throw new Error("Some leads were not found or you can't see them.");
  const fromUsers = [...new Set(leads.map((l) => l.assigned_to).filter((x): x is string => !!x))];
  const people = new Map((await c.repo.profilesByIds([...new Set([d.toUser, ...fromUsers])])).map((p) => [p.user_id, p]));
  const target = people.get(d.toUser);
  if (!target || target.status !== "active" || !["caller", "team_leader"].includes(target.role))
    throw new Error("Pick an active caller or team leader.");

  if (role === "team_leader") {
    const inTeam = (u: string | null) => u === userId || (!!u && !!teamId && people.get(u)?.team_id === teamId);
    if (!inTeam(d.toUser) || leads.some((l) => l.assigned_to && !inTeam(l.assigned_to))) throw new AuthError("forbidden");
  }

  const moving = leads.filter((l) => l.assigned_to !== d.toUser);
  if (!moving.length) return { moved: 0 };
  await c.repo.updateAssignee(moving.map((l) => l.id), d.toUser);
  await c.repo.insertTransfers(moving.map((l) => ({ org_id: orgId, lead_id: l.id, from_user: l.assigned_to, to_user: d.toUser, reason: d.reason, by_user: userId })));
  await c.repo.insertEvents(moving.map((l) => ({ org_id: orgId, lead_id: l.id, type: "transfer", payload: { from: l.assigned_to, to: d.toUser }, actor_id: userId })));
  await c.audit("lead.transfer", "user", d.toUser, { count: moving.length, reason: d.reason });
  return { moved: moving.length };
}
