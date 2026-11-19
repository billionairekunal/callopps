import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgKeys } from "@/lib/crypto/orgKeys";
import { decryptField } from "@/lib/crypto/fieldCrypto";
import type { LeadRow } from "./export";

export const FULL_LIMIT = 50_000;

/** Customer-level rows for a Full Data export, decrypted. Callers must have checked the user is a Super Admin. */
export async function fullDataRows(orgId: string, ids: string[], labels: Record<string, string>): Promise<LeadRow[]> {
  const svc = createAdminClient();
  const keys = await getOrgKeys(orgId);
  const dec = (b: string | null) => (b ? decryptField(b, () => keys.dataKey) : null);
  const out: LeadRow[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await svc.from("leads").select(`name, phone_enc, alt_phone_enc, email_enc, city, status, created_at, updated_at,
      next_followup_at, extra, sensitive_enc, process_id, product_id, lead_type_id, disposition_id, assigned_to, source_id, product:products(category_id)`)
      .eq("org_id", orgId).in("id", ids.slice(i, i + 200));
    if (error) throw new Error("Could not read the leads for this export.");
    for (const l of data ?? []) {
      const p = (Array.isArray(l.product) ? l.product[0] : l.product) as { category_id: string | null } | null;
      const name = (id: string | null) => (id ? labels[id] ?? null : null);
      out.push({
        name: l.name, phone: dec(l.phone_enc)!, alt: dec(l.alt_phone_enc), email: dec(l.email_enc), city: l.city,
        process: name(l.process_id), category: name(p?.category_id ?? null), product: name(l.product_id), leadType: name(l.lead_type_id),
        status: l.status, disposition: name(l.disposition_id), agent: name(l.assigned_to), source: name(l.source_id),
        created_at: l.created_at, updated_at: l.updated_at, next_followup_at: l.next_followup_at,
        extra: (l.extra ?? {}) as Record<string, string>, sensitive: l.sensitive_enc ? JSON.parse(dec(l.sensitive_enc)!) : null,
      });
    }
  }
  return out;
}
