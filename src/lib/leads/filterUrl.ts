import { searchKind } from "./search";

/** Query string for the lead filters. A full phone number is replaced by its blind-index token (`qh`) so it never sits in URLs, history or logs. */
export function filterQuery(values: Record<string, string>, phoneToken: string | null): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) {
    if (!v.trim() || k === "qh") continue;
    if (k === "q" && searchKind(v).kind === "phone") continue;
    p.set(k, v.trim());
  }
  if (phoneToken && searchKind(values.q ?? "").kind === "phone") p.set("qh", phoneToken);
  else if (!values.q?.trim() && /^[0-9a-f]{64}$/.test(values.qh ?? "")) p.set("qh", values.qh); // keep an active number search
  return p.toString();
}
