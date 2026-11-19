import { z } from "zod";
import { AuthError, type Session } from "@/lib/auth/roles";

export type Channel = "whatsapp" | "sms";
export type CommsRepo = {
  getLead(id: string): Promise<{ id: string; name: string | null; assigned_to: string | null; phone_enc: string } | null>;
  template(id: string): Promise<{ id: string; channel: Channel; body: string } | null>;
  insert(row: { org_id: string; lead_id: string; user_id: string; channel: Channel; template_id: string | null; body: string }): Promise<void>;
  insertEvent(row: { org_id: string; lead_id: string; type: string; payload: Record<string, unknown>; actor_id: string }): Promise<void>;
  touch(): Promise<void>;
};
export type CommsCtx = {
  session: Session; repo: CommsRepo;
  reveal: (enc: string) => Promise<string>;
  audit: (action: string, entity?: string, entityId?: string, meta?: Record<string, unknown>) => Promise<void>;
};

const FALLBACK: Record<string, string> = { name: "there" };
export const fillTemplate = (body: string, vars: Record<string, string | null | undefined>) =>
  body.replace(/\{(\w+)\}/g, (m, k: string) => (Object.hasOwn(vars, k) ? vars[k]?.trim() || FALLBACK[k] || "" : m));

export const messageLink = (channel: Channel, phone: string, text: string) =>
  channel === "whatsapp" ? `https://wa.me/91${phone}?text=${encodeURIComponent(text)}` : `sms:+91${phone}?body=${encodeURIComponent(text)}`;

const schema = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(["whatsapp", "sms"]),
  templateId: z.string().uuid().nullable().optional(),
  body: z.string().trim().min(1, "Write a message.").max(1000),
});

/** Click-to-WhatsApp / SMS (§7.13): like a call, only the assignee (or a super admin) gets the number. Logged as an activity. */
export async function openMessage(c: CommsCtx, input: unknown): Promise<{ url: string }> {
  const s = c.session;
  const d = schema.parse(input);
  const lead = await c.repo.getLead(d.leadId);
  if (!lead) throw new Error("Lead not found.");
  if (s.role !== "super_admin" && lead.assigned_to !== s.userId) throw new AuthError("forbidden");
  const tpl = d.templateId ? await c.repo.template(d.templateId) : null;
  if (d.templateId && (!tpl || tpl.channel !== d.channel)) throw new Error("Pick a template for this channel.");
  const phone = await c.reveal(lead.phone_enc);
  await c.repo.insert({ org_id: s.orgId, lead_id: lead.id, user_id: s.userId, channel: d.channel, template_id: tpl?.id ?? null, body: d.body });
  await c.repo.insertEvent({ org_id: s.orgId, lead_id: lead.id, type: "message", payload: { channel: d.channel, body: d.body.slice(0, 200) }, actor_id: s.userId });
  await c.audit("message.open", "lead", lead.id, { channel: d.channel });
  await c.repo.touch();
  return { url: messageLink(d.channel, phone, d.body) };
}
