export type CleanPhone = {
  primary: string | null; alternate: string | null; valid: boolean;
  reason?: "blank" | "too_short" | "too_long" | "not_mobile" | "precision_lost";
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
  const sci = s.match(/^(\d+)(?:\.(\d+))?e\+?\d+$/i); // "9.87654321E+09" from spreadsheets
  if (sci) {
    // Excel can show "9.88E+09": the real digits are gone, so never guess a number from it.
    // Fewer than 8 significant digits means Excel rounded it (a real mobile rarely ends in 3+ zeros).
    if ((sci[1] + (sci[2] ?? "")).replace(/^0+/, "").length < 8) return { primary: null, alternate: null, valid: false, reason: "precision_lost" };
    s = Math.round(Number(s)).toString();
  }

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
