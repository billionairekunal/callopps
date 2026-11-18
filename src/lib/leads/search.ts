import { cleanPhone } from "./phone";

export type SearchKind = { kind: "phone"; phone: string } | { kind: "last4"; digits: string } | { kind: "name"; text: string } | { kind: "none" };

export function searchKind(q: string): SearchKind {
  const t = q.trim();
  const c = cleanPhone(t);
  if (c.valid) return { kind: "phone", phone: c.primary! };
  if (/^\d{4}$/.test(t)) return { kind: "last4", digits: t };
  if (t.length >= 2 && !/^[\d\s+()-]+$/.test(t)) return { kind: "name", text: t };
  return { kind: "none" };
}
