import { cleanPhone } from "./phone";
import type { Field } from "./detect";

export type PreviewStatus = "ok" | "invalid" | "blank" | "dup_file" | "dup_existing" | "dup_other_process";
export type PreviewRow = { index: number; phone: string | null; alt: string | null; status: PreviewStatus; reason?: string; values: Record<string, string> };

/** Clean every row and classify it for the preview screen (D7, D8, D9). */
export function buildPreview(
  rows: string[][], headers: string[], mapping: Record<string, Field>,
  existing: Map<string, { processName: string | null }>, targetProcess: string | null,
): PreviewRow[] {
  const col = (f: Field) => headers.findIndex((h) => mapping[h] === f);
  const pi = col("phone"), ai = col("alt_phone");
  const seen = new Set<string>();
  const target = targetProcess?.trim().toLowerCase() ?? null;

  return rows.map((r, index) => {
    const values = Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? "").trim()]));
    const c = cleanPhone(pi >= 0 ? r[pi] : "");
    const altClean = ai >= 0 ? cleanPhone(r[ai]) : null;
    const alt = altClean?.valid ? altClean.primary : c.alternate;
    const base = { index, phone: c.primary, alt, values };
    if (!c.valid) return { ...base, status: c.reason === "blank" ? "blank" : "invalid", reason: c.reason };
    const phone = c.primary!;
    if (seen.has(phone)) return { ...base, status: "dup_file" };
    seen.add(phone);
    const ex = existing.get(phone);
    if (ex) {
      const same = target === null || (ex.processName ?? "").toLowerCase() === target;
      return { ...base, status: same ? "dup_existing" : "dup_other_process" };
    }
    return { ...base, status: "ok" };
  });
}
