import { encryptField, blindIndex, last4 } from "@/lib/crypto/fieldCrypto";

type Keys = { keyId: string; dataKey: Buffer; hashKey: Buffer };
export type LeadInput = {
  phone: string; alt?: string | null; name?: string | null; email?: string | null; city?: string | null;
  extra?: Record<string, string>;
  process_id?: string | null; product_id?: string | null; lead_type_id?: string | null;
  source_id?: string | null; assigned_to?: string | null; created_by?: string | null;
};

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return user && domain ? `${user[0]}•••@${domain}` : "•••";
}

/** The row to insert: phone/alt/email encrypted with hashes for search and dedupe; sensitive columns as one encrypted blob. */
export function buildLeadRow(input: LeadInput, keys: Keys, orgId: string, sensitive: Record<string, string>) {
  const enc = (v: string) => encryptField(v, keys.dataKey, keys.keyId);
  const hash = (v: string) => blindIndex(v, keys.hashKey);
  const email = input.email?.trim().toLowerCase() || null;
  const alt = input.alt || null;
  return {
    org_id: orgId,
    phone_enc: enc(input.phone), phone_hash: hash(input.phone), phone_last4: last4(input.phone),
    alt_phone_enc: alt ? enc(alt) : null, alt_phone_hash: alt ? hash(alt) : null, alt_phone_last4: alt ? last4(alt) : null,
    email_enc: email ? enc(email) : null, email_hash: email ? hash(email) : null, email_mask: email ? maskEmail(email) : null,
    name: input.name?.trim() || null,
    city: input.city?.trim() || null,
    extra: input.extra ?? {},
    sensitive_enc: Object.keys(sensitive).length ? enc(JSON.stringify(sensitive)) : null,
    process_id: input.process_id ?? null, product_id: input.product_id ?? null, lead_type_id: input.lead_type_id ?? null,
    source_id: input.source_id ?? null, assigned_to: input.assigned_to ?? null, created_by: input.created_by ?? null,
  };
}
export type LeadInsert = ReturnType<typeof buildLeadRow>;
