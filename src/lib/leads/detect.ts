import { cleanPhone } from "./phone";

export type Field = "phone" | "alt_phone" | "name" | "email" | "city" | "process" | "product" | "lead_type" | "extra" | "ignore";
export const FIELD_LABEL: Record<Field, string> = {
  phone: "Phone (required)", alt_phone: "Alternate phone", name: "Name", email: "Email", city: "City",
  process: "Process", product: "Product / course", lead_type: "Lead type", extra: "Extra field", ignore: "Don't import",
};

export function normalizeHeaders(raw: unknown[]): string[] {
  const bases = raw.map((h, i) => String(h ?? "").trim() || `Column ${i + 1}`);
  const taken = new Set(bases), used = new Set<string>();
  return bases.map((base) => {
    // A repeated header gets the next "(n)" that no other column uses, so values never overwrite each other.
    let name = base, n = 1;
    while (used.has(name) || (name !== base && taken.has(name))) name = `${base} (${++n})`;
    used.add(name);
    return name;
  });
}

// Checked in this order, so "Course Name" is a product and "College Name" a process, not a name.
const SYNONYMS: [Exclude<Field, "alt_phone" | "extra" | "ignore">, RegExp][] = [
  ["email", /e-?mail|\bmail\b/i],
  ["phone", /mobile|phone|contact|\bcell\b|\bmob\b|whats\s?app/i],
  ["process", /process|campaign|college/i],
  ["product", /course|product|program/i],
  ["lead_type", /lead\s?type|temperature|priority|hot|warm/i],
  ["city", /city|town|location|district/i],
  ["name", /name|customer|student|candidate|person/i],
];
const ALT = /alt|alternate|second|other|2nd|whats\s?app/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Guess each column's field: header words first, then the data in the first 50 rows (D2). */
export function detectColumns(headers: string[], sample: string[][]): Record<string, Field> {
  const out: Record<string, Field> = {};
  const taken = new Set<Field>();
  const claim = (h: string, f: Field) => { out[h] = f; if (f !== "extra" && f !== "ignore") taken.add(f); };
  const phoneSlot = (h: string): Field | null =>
    !taken.has("phone") && !ALT.test(h) ? "phone" : !taken.has("alt_phone") ? "alt_phone" : !taken.has("phone") ? "phone" : null;

  for (const h of headers) {
    // "Contact Person" / "Contact Name" are names, not phone columns.
    const hit = SYNONYMS.find(([f, re]) => re.test(h) && !(f === "phone" && /person|name/i.test(h)))?.[0];
    if (!hit) continue;
    const f = hit === "phone" ? phoneSlot(h) : taken.has(hit) ? null : hit;
    if (f) claim(h, f);
  }
  const rows = sample.slice(0, 50);
  headers.forEach((h, i) => {
    if (out[h]) return;
    const vals = rows.map((r) => String(r[i] ?? "").trim()).filter(Boolean);
    const share = (pred: (v: string) => boolean) => (vals.length ? vals.filter(pred).length / vals.length : 0);
    if (share((v) => cleanPhone(v).valid) >= 0.6) { const f = phoneSlot(h); if (f) return claim(h, f); }
    if (!taken.has("email") && share((v) => EMAIL.test(v)) >= 0.6) return claim(h, "email");
    claim(h, "extra");
  });
  return out;
}

const PHONE_WORDS = SYNONYMS.find(([f]) => f === "phone")![1], EMAIL_WORDS = SYNONYMS.find(([f]) => f === "email")![1];

/** Columns left as "extra" that still hold phone numbers or emails: they must be encrypted, never stored plain. */
export function contactColumns(headers: string[], sample: string[][], mapping: Record<string, Field>): string[] {
  return headers.filter((h, i) => {
    if (mapping[h] !== "extra") return false;
    if (PHONE_WORDS.test(h) || EMAIL_WORDS.test(h)) return true;
    const vals = sample.slice(0, 50).map((r) => String(r[i] ?? "").trim()).filter(Boolean);
    return vals.length > 0 && vals.filter(isContactValue).length / vals.length >= 0.6;
  });
}

/** True for a value that is a mobile number or an email address. */
export const isContactValue = (v: string) => cleanPhone(v).valid || EMAIL.test(v.trim());
