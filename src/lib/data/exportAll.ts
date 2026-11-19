import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgKeys } from "@/lib/crypto/orgKeys";
import { decryptField } from "@/lib/crypto/fieldCrypto";
import type { Sheet } from "@/lib/reports/export";
import { rowsToSheet } from "./pack";

export const EXPORT_LEAD_LIMIT = 200_000; // ponytail: built in memory; stream per table beyond this

const TABLES = [
  "teams", "processes", "team_processes", "product_categories", "products", "lead_types", "dispositions", "lead_sources",
  "calls", "lead_events", "lead_status_history", "lead_transfers", "communications", "message_templates",
  "qa_audits", "qa_checklists", "attendance_sessions", "targets", "import_batches", "import_mappings",
  "saved_reports", "report_exports", "chat_channels", "chat_messages", "audit_log",
] as const;

async function all(table: string, orgId: string) {
  const svc = createAdminClient();
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc.from(table).select("*").eq("org_id", orgId).range(from, from + 999);
    if (error) throw new Error(`Could not read ${table}.`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** S13: everything the centre has, as one CSV per table. Contact fields are decrypted; hashes and key material are left out. */
export async function exportAll(orgId: string): Promise<{ sheets: Sheet[]; counts: Record<string, number> }> {
  const svc = createAdminClient();
  const { count } = await svc.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  if ((count ?? 0) > EXPORT_LEAD_LIMIT) throw new Error(`This centre has more than ${EXPORT_LEAD_LIMIT.toLocaleString("en-IN")} leads. Ask us for a database export instead.`);
  const keys = await getOrgKeys(orgId);
  const dec = (v: unknown) => (typeof v === "string" && v ? decryptField(v, () => keys.dataKey) : "");
  const leads = (await all("leads", orgId)).map(({ phone_enc, phone_hash, alt_phone_enc, alt_phone_hash, email_enc, email_hash, sensitive_enc, ...rest }) => {
    void phone_hash; void alt_phone_hash; void email_hash;
    return { ...rest, phone: dec(phone_enc), alt_phone: dec(alt_phone_enc), email: dec(email_enc), sensitive: sensitive_enc ? JSON.parse(dec(sensitive_enc)) : null };
  });
  const people = await all("profiles", orgId);
  const emails = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    for (const u of data?.users ?? []) emails.set(u.id, u.email ?? "");
    if (!data || data.users.length < 1000) break;
  }
  const users = people.map((p) => ({ ...p, email: emails.get(String(p.user_id)) ?? "" }));
  const sheets = [rowsToSheet("leads", leads), rowsToSheet("users", users)];
  for (const t of TABLES) sheets.push(rowsToSheet(t, await all(t, orgId)));
  return { sheets, counts: Object.fromEntries(sheets.map((s) => [s.name, s.rows.length])) };
}
