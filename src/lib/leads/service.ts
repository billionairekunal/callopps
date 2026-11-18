import { z } from "zod";
import { AuthError, type Role, type Session } from "@/lib/auth/roles";
import { blindIndex } from "@/lib/crypto/fieldCrypto";
import { cleanPhone } from "./phone";
import { buildLeadRow, type LeadInsert } from "./row";
import { isContactValue } from "./detect";

type Keys = { keyId: string; dataKey: Buffer; hashKey: Buffer };
export type EventRow = { org_id: string; lead_id: string; type: string; payload: Record<string, unknown>; actor_id: string };
export type StatusRow = { org_id: string; lead_id: string; from_status: string | null; to_status: string; actor_id: string };
export type LeadRepo = {
  findByPhoneHash(hash: string): Promise<{ id: string; process_id: string | null }[]>;
  insertLeads(rows: LeadInsert[]): Promise<string[]>;
  insertEvents(rows: EventRow[]): Promise<void>;
  insertStatusHistory(rows: StatusRow[]): Promise<void>;
  validAssignees(ids: string[]): Promise<string[]>;
};
export type LeadCtx = {
  session: Session;
  keys: () => Promise<Keys>;
  repo: LeadRepo;
  audit: (action: string, entity?: string, entityId?: string, meta?: Record<string, unknown>) => Promise<void>;
};

export const ADMINS: Role[] = ["super_admin", "admin"];
export const requireAdmin = (c: { session: Session }) => { if (!ADMINS.includes(c.session.role)) throw new AuthError("forbidden"); };

const id = z.string().uuid().nullable().optional();
export const addLeadSchema = z.object({
  phone: z.string(),
  alt: z.string().optional(),
  name: z.string().max(200).optional(),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]).optional(),
  city: z.string().max(120).optional(),
  process_id: id, product_id: id, lead_type_id: id, assigned_to: id,
  extra: z.record(z.string(), z.string().max(2000)).optional(),
  force: z.boolean().optional(),
});

/** Add one customer by hand (D10). Only a phone is required (D4). */
export async function addLead(c: LeadCtx, input: unknown): Promise<{ id: string } | { duplicateOf: string }> {
  requireAdmin(c);
  const d = addLeadSchema.parse(input);
  const phone = cleanPhone(d.phone);
  if (!phone.valid) throw new Error("Enter a valid 10-digit mobile number.");
  const alt = d.alt ? cleanPhone(d.alt) : null;
  if (d.alt && !alt?.valid) throw new Error("The alternate number isn't a valid mobile number.");

  const keys = await c.keys();
  if (!d.force) {
    const same = (await c.repo.findByPhoneHash(blindIndex(phone.primary!, keys.hashKey)))
      .find((l) => (l.process_id ?? null) === (d.process_id ?? null));
    if (same) return { duplicateOf: same.id };
  }
  if (d.assigned_to && !(await c.repo.validAssignees([d.assigned_to])).length) throw new Error("Assign only to an active caller or team leader.");
  const fields = Object.entries(d.extra ?? {}).filter(([k, v]) => k.trim() && v.trim());
  // Phones/emails typed into extra fields are encrypted like the main number.
  const extra = Object.fromEntries(fields.filter(([, v]) => !isContactValue(v)));
  const secret = Object.fromEntries(fields.filter(([, v]) => isContactValue(v)));
  const row = buildLeadRow({
    phone: phone.primary!, alt: alt?.primary ?? phone.alternate, name: d.name, email: d.email || null, city: d.city, extra,
    process_id: d.process_id, product_id: d.product_id, lead_type_id: d.lead_type_id, assigned_to: d.assigned_to,
    created_by: c.session.userId,
  }, keys, c.session.orgId, secret);
  const [leadId] = await c.repo.insertLeads([row]);
  const base = { org_id: c.session.orgId, lead_id: leadId, actor_id: c.session.userId };
  await c.repo.insertEvents([{ ...base, type: "created", payload: { via: "manual" } }]);
  await c.repo.insertStatusHistory([{ ...base, from_status: null, to_status: "new" }]);
  await c.audit("lead.create", "lead", leadId, { manual: true });
  return { id: leadId };
}
