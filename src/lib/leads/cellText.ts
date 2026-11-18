/** Turn an ExcelJS cell value (number, rich text, link, formula, date…) into plain text. */
export function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(Math.round(v * 1e6) / 1e6) && Math.abs(v) >= 1e6 ? Math.round(v).toString() : String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: unknown; result?: unknown; hyperlink?: string };
    if ("error" in o) return ""; // #N/A, #REF! …
    if (o.richText) return o.richText.map((r) => r.text).join("").trim();
    if ("result" in o) return cellText(o.result);
    if (o.text != null) return cellText(o.text);
  }
  return String(v).trim();
}
