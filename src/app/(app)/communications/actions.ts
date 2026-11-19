"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { runAction } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrgKeys } from "@/lib/crypto/orgKeys";
import { decryptField } from "@/lib/crypto/fieldCrypto";
import { logAudit } from "@/lib/audit";
import { touchAttendance } from "@/lib/calls/repo";
import { openMessage as open, fillTemplate, type CommsCtx } from "@/lib/comms/service";

const SENDERS = ["super_admin", "team_leader", "caller"] as const;

async function commsCtx(): Promise<CommsCtx> {
  const s = await requireRole(...SENDERS);
  const rls = await createClient(), svc = createAdminClient();
  return {
    session: s, audit: logAudit,
    reveal: async (enc) => { const k = await getOrgKeys(s.orgId); return decryptField(enc, () => k.dataKey); },
    repo: {
      getLead: async (id) => (await rls.from("leads").select("id, name, assigned_to, phone_enc").eq("id", id).maybeSingle()).data,
      template: async (id) => (await svc.from("message_templates").select("id, channel, body").eq("org_id", s.orgId).eq("id", id).maybeSingle()).data,
      insert: async (row) => { const { error } = await svc.from("communications").insert(row); if (error) throw Object.assign(new Error(error.message), { code: "db" }); },
      insertEvent: async (row) => { await svc.from("lead_events").insert(row); },
      touch: () => touchAttendance(s),
    },
  };
}

export async function openMessage(input: unknown) {
  return runAction(async () => { const r = await open(await commsCtx(), input); revalidatePath("/communications"); return r; });
}

/** Templates for a channel, filled in for this lead (names only; no contact data). */
export async function messageTemplates(leadId: string, channel: "whatsapp" | "sms") {
  return runAction(async () => {
    const s = await requireRole(...SENDERS);
    const rls = await createClient();
    const [{ data: lead }, { data: org }, { data: tpls }] = await Promise.all([
      rls.from("leads").select("name").eq("id", z.string().uuid().parse(leadId)).maybeSingle(),
      rls.from("orgs").select("name").single(),
      rls.from("message_templates").select("id, name, body").eq("channel", z.enum(["whatsapp", "sms"]).parse(channel)).order("name"),
    ]);
    const vars = { name: lead?.name, agent: s.fullName, centre: org?.name };
    return (tpls ?? []).map((t) => ({ id: t.id, name: t.name, text: fillTemplate(t.body, vars) }));
  });
}

const tplSchema = z.object({
  name: z.string().trim().min(1, "Name the template.").max(80),
  channel: z.enum(["whatsapp", "sms"]),
  body: z.string().trim().min(1, "Write the message.").max(1000),
});
export async function saveTemplate(input: unknown) {
  return runAction(async () => {
    const s = await requireRole("super_admin", "admin");
    const d = tplSchema.parse(input);
    const { error } = await createAdminClient().from("message_templates").insert({ ...d, org_id: s.orgId });
    if (error) throw new Error("Could not save the template.");
    await logAudit("template.create", "message_template", undefined, { name: d.name });
    revalidatePath("/communications");
  });
}
export async function deleteTemplate(id: string) {
  return runAction(async () => {
    const s = await requireRole("super_admin", "admin");
    await createAdminClient().from("message_templates").delete().eq("org_id", s.orgId).eq("id", z.string().uuid().parse(id));
    await logAudit("template.delete", "message_template", id);
    revalidatePath("/communications");
  });
}
