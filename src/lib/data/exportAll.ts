import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgKeys } from "@/lib/crypto/orgKeys";
import { decryptField } from "@/lib/crypto/fieldCrypto";
import type { Sheet } from "@/lib/reports/export";
import { rowsToSheet } from "./pack";
import { EXPORT_TABLES } from "./tables";

export const EXPORT_ROW_LIMIT = 1_500_000; // ponytail: built in memory; stream per table beyond this

const orgCol = (t: string) => (t === "orgs" ? "id" : "org_id");

async function all(table: string, orgId: string, order: string[]) {
  const svc = createAdminClient();
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    let q = svc.from(table).select("*").eq(orgCol(table), orgId);
    for (const c of order) q = q.order(c);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`Could not read ${table}.`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** S13: everything the centre has, as one CSV per table. Contact fields are decrypted; hashes and key material are left out. */
export async function exportAll(orgId: string): Promise<{ sheets: Sheet[]; counts: Record<string, number> }> {
  const svc = createAdminClient();
  const sizes = await Promise.all(["leads", "profiles", ...Object.keys(EXPORT_TABLES)].map(async (t) =>
    (await svc.from(t).select("*", { count: "exact", head: true }).eq(orgCol(t), orgId)).count ?? 0));
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total > EXPORT_ROW_LIMIT) throw new Error(`This centre has ${total.toLocaleString("en-IN")} rows in total, too many for a one-click export. Ask us for a database export instead.`);

  const keys = await getOrgKeys(orgId);
  const dec = (v: unknown) => {
    if (typeof v !== "string" || !v) return "";
    try { return decryptField(v, () => keys.dataKey); } catch { return "(could not decrypt)"; } // one bad row must not sink the export
  };
  const leads = (await all("leads", orgId, ["id"])).map(({ phone_enc, phone_hash, alt_phone_enc, alt_phone_hash, email_enc, email_hash, sensitive_enc, ...rest }) => {
    void phone_hash; void alt_phone_hash; void email_hash;
    const secret = dec(sensitive_enc);
    let sensitive: unknown = null;
    try { sensitive = secret ? JSON.parse(secret) : null; } catch { sensitive = secret; }
    return { ...rest, phone: dec(phone_enc), alt_phone: dec(alt_phone_enc), email: dec(email_enc), sensitive };
  });

  const people = await all("profiles", orgId, ["user_id"]);
  const emails = new Map<string, string>();
  for (let i = 0; i < people.length; i += 10) // only this centre's users, a few at a time
    await Promise.all(people.slice(i, i + 10).map(async (p) => {
      const { data } = await svc.auth.admin.getUserById(String(p.user_id));
      emails.set(String(p.user_id), data.user?.email ?? "");
    }));
  const users = people.map((p) => ({ ...p, email: emails.get(String(p.user_id)) ?? "" }));

  const sheets = [rowsToSheet("leads", leads), rowsToSheet("users", users)];
  for (const [t, order] of Object.entries(EXPORT_TABLES)) sheets.push(rowsToSheet(t, await all(t, orgId, order)));
  return { sheets, counts: Object.fromEntries(sheets.map((s) => [s.name, s.rows.length])) };
}
