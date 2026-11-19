import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrgKeys } from "@/lib/crypto/orgKeys";
import { decryptField } from "@/lib/crypto/fieldCrypto";
import { logAudit } from "@/lib/audit";
import type { Session } from "@/lib/auth/roles";
import type { CallCtx, CallRepo } from "./service";

class DbError extends Error { code = "db"; }
const ok = <T>(r: { data: T; error: { message: string } | null }): T => { if (r.error) throw new DbError(r.error.message); return r.data; };

/** Attendance activity (§14): open, extend or auto-close the user's session. Agents only. */
export async function touchAttendance(s: Session, force = false) {
  if (s.role !== "caller" && s.role !== "team_leader") return;
  const { error } = await createAdminClient().rpc("touch_attendance", { uid: s.userId, org: s.orgId, force });
  if (error) console.error("attendance touch failed", error.message);
}

/** Reads of the lead go through RLS (the database decides visibility); call/timeline writes are server-only. */
export async function callCtx(s: Session): Promise<CallCtx> {
  const rls = await createClient();
  const svc = createAdminClient();
  const repo: CallRepo = {
    getLead: async (id) => ok(await rls.from("leads").select("id, assigned_to, process_id, status, phone_enc, disposition_id, next_followup_at").eq("id", id).maybeSingle()),
    leadForCall: async (id) => ok(await svc.from("leads").select("id, assigned_to, process_id, status, phone_enc, disposition_id, next_followup_at").eq("org_id", s.orgId).eq("id", id).maybeSingle()),
    createCall: async (row) => (ok(await svc.from("calls").insert(row).select("id").single()) as { id: string }).id,
    getCall: async (id) => ok(await svc.from("calls").select("id, lead_id, caller_id, saved_at").eq("org_id", s.orgId).eq("id", id).maybeSingle()),
    disposition: async (id) => ok(await svc.from("dispositions").select("id, process_id, outcome").eq("org_id", s.orgId).eq("id", id).maybeSingle()),
    commit: async (p) => ok(await svc.rpc("save_call_outcome", { p })) as boolean,
    insertEvents: async (rows) => { if (rows.length) ok(await svc.from("lead_events").insert(rows)); },
    touch: () => touchAttendance(s),
  };
  return {
    session: s, repo, audit: logAudit,
    reveal: async (enc) => { const k = await getOrgKeys(s.orgId); return decryptField(enc, () => k.dataKey); },
  };
}
