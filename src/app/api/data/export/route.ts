import { requireRole, AuthError } from "@/lib/auth/session";
import { exportAll } from "@/lib/data/exportAll";
import { zipSheets } from "@/lib/data/pack";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export const maxDuration = 300;

/** S13: the Super Admin downloads all of the centre's data (one CSV per table, in a ZIP). Logged. */
export async function POST() {
  let s;
  try { s = await requireRole("super_admin"); }
  catch (e) { return Response.json({ error: "Only the Super Admin can export all data." }, { status: e instanceof AuthError && e.reason === "forbidden" ? 403 : 401 }); }
  try {
    const { data: org } = await createAdminClient().from("orgs").select("name").eq("id", s.orgId).single();
    const { sheets, counts } = await exportAll(s.orgId);
    await logAudit("data.export_all", "orgs", s.orgId, { counts });
    const stamp = new Date().toISOString().slice(0, 10);
    const zip = await zipSheets(sheets, `CallOpps data export\nCentre: ${org?.name ?? ""}\nDate: ${stamp}\n\nOne CSV per table. leads.csv holds full phone numbers, emails and sensitive fields: store this file securely.\n`);
    return new Response(new Uint8Array(zip), { headers: {
      "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="callopps-export-${stamp}.zip"`, "Cache-Control": "no-store",
    } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Export failed." }, { status: 500 });
  }
}
