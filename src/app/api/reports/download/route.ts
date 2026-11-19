import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth/session";
import { parseFilters } from "@/lib/reports/filters";
import { runReport } from "@/lib/reports/server";
import { basicSheets, leadSheet, describeFilters, toCsv, toXlsx } from "@/lib/reports/export";
import { fullDataRows, FULL_LIMIT } from "@/lib/reports/fullData";
import { toPdf } from "@/lib/reports/pdf";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export const maxDuration = 120; // big Full Data workbooks

const body = z.object({
  query: z.string().max(4000),
  access: z.enum(["basic", "full"]),
  view: z.enum(["current", "detailed"]),
  format: z.enum(["xlsx", "csv", "pdf"]),
});
const TYPES = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv; charset=utf-8", pdf: "application/pdf" };
const PDF_ROWS = 2_000;
const fail = (status: number, error: string) => Response.json({ error }, { status });

/** Builds the report file on the server (R6) and logs every download (R9). Basic: admins. Full Data: Super Admin only. */
export async function POST(req: Request) {
  let session;
  try { session = await requireRole("super_admin", "admin"); }
  catch (e) { return fail(e instanceof AuthError && e.reason === "forbidden" ? 403 : 401, "You don't have permission to download reports."); }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "Pick the report options again.");
  const d = parsed.data;
  if (d.access === "full" && session.role !== "super_admin") return fail(403, "Full Data downloads are for the Super Admin only.");

  const f = parseFilters(Object.fromEntries(new URLSearchParams(d.query)));
  const { raw, range, targets, labels } = await runReport(session, f, d.access === "full");
  let sheets;
  if (d.access === "full") {
    const ids = raw.lead_ids ?? [];
    if (ids.length > FULL_LIMIT) return fail(413, `This view has ${ids.length.toLocaleString("en-IN")} leads. Narrow the filters to ${FULL_LIMIT.toLocaleString("en-IN")} or fewer.`);
    if (d.format === "pdf" && ids.length > PDF_ROWS) return fail(413, `PDF is limited to ${PDF_ROWS.toLocaleString("en-IN")} leads. Use XLSX or CSV for this one.`);
    sheets = [leadSheet(await fullDataRows(session.orgId, ids, labels), d.view)];
  } else sheets = basicSheets(raw, labels, targets, d.view);

  const rows = sheets.reduce((n, s) => n + s.rows.length, 0);
  const label = `${d.access === "basic" ? "Basic Report" : "Full Data"} · ${d.view === "current" ? "Current View" : "Detailed View"}`;
  const stamp = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date());
  // R9: no record, no file.
  const { error: logErr } = await createAdminClient().from("report_exports").insert({
    org_id: session.orgId, user_id: session.userId, access: d.access, view: d.view, format: d.format, filters: f, rows,
  });
  if (logErr) { console.error("report_exports", logErr.message); return fail(500, "Could not record this download, so it was stopped. Try again."); }
  await logAudit(d.access === "full" ? "report.download_full" : "report.download", "report", undefined, { view: d.view, format: d.format, rows, range: range.label, filters: f });

  const file = d.format === "csv" ? Buffer.from("\uFEFF" + toCsv(sheets), "utf8")
    : d.format === "xlsx" ? await toXlsx(sheets)
    : toPdf({ subtitle: `${label} · ${range.label}`, generated: stamp, filters: describeFilters(f, labels, range.label, d.access) }, sheets);

  const name = `callopps-${d.access === "full" ? "full-data" : "report"}-${new Date().toISOString().slice(0, 10)}.${d.format}`;
  return new Response(new Uint8Array(file), { headers: {
    "Content-Type": TYPES[d.format], "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store",
  } });
}
