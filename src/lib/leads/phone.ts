export type CleanPhone = {
  primary: string | null; alternate: string | null; valid: boolean;
  reason?: "blank" | "too_short" | "too_long" | "not_mobile";
};

const MOBILE = /^[6-9]\d{9}$/;

/** Digits of one number with Indian prefixes (+91, 0091, 91, 0) removed. */
function normalize(part: string): string {
  let d = part.replace(/\D/g, "");
  if (d.length === 14 && d.startsWith("0091")) d = d.slice(4);
  else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

function reasonFor(d: string): CleanPhone["reason"] | undefined {
  if (!d) return "blank";
  if (d.length < 10) return "too_short";
  if (d.length > 10) return "too_long";
  return MOBILE.test(d) ? undefined : "not_mobile";
}

/** Clean a phone cell from any lead file (D7). Handles Excel numbers, prefixes and two numbers in one cell. */
export function cleanPhone(raw: unknown): CleanPhone {
  let s = raw == null ? "" : typeof raw === "number" ? (Number.isFinite(raw) ? Math.round(raw).toString() : "") : String(raw).trim();
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) s = Math.round(Number(s)).toString(); // "9.87654321E+09" from spreadsheets

  let parts = s.split(/[\/,;|]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    const all = s.replace(/\D/g, "");
    // "9876543210 9123456789": two mobile numbers run together.
    if (all.length === 20 && MOBILE.test(all.slice(0, 10)) && MOBILE.test(all.slice(10))) parts = [all.slice(0, 10), all.slice(10)];
  }
  const primary = normalize(parts[0] ?? "");
  const alt = parts[1] ? normalize(parts[1]) : "";
  const reason = reasonFor(primary);
  return {
    primary: primary || null,
    alternate: alt && !reasonFor(alt) ? alt : null,
    valid: !reason,
    ...(reason ? { reason } : {}),
  };
}
