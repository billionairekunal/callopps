import { cleanPhone } from "./phone";

export type Field = "phone" | "alt_phone" | "name" | "email" | "city" | "process" | "product" | "lead_type" | "extra" | "ignore";
export const FIELD_LABEL: Record<Field, string> = {
  phone: "Phone (required)", alt_phone: "Alternate phone", name: "Name", email: "Email", city: "City",
  process: "Process", product: "Product / course", lead_type: "Lead type", extra: "Extra field", ignore: "Don't import",
};

export function normalizeHeaders(raw: unknown[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const base = String(h ?? "").trim() || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

// Checked in this order, so "Course Name" is a product and "College Name" a process, not a name.
const SYNONYMS: [Exclude<Field, "alt_phone" | "extra" | "ignore">, RegExp][] = [
  ["email", /e-?mail|\bmail\b/i],
  ["phone", /mobile|phone|contact|\bcell\b|\bmob\b|whats\s?app/i],
  ["process", /process|campaign|college|client/i],
  ["product", /course|product|program/i],
  ["lead_type", /lead\s?type|temperature|priority|hot|warm/i],
  ["city", /city|town|location|district/i],
  ["name", /name|customer|student|candidate/i],
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
    const hit = SYNONYMS.find(([, re]) => re.test(h))?.[0];
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
