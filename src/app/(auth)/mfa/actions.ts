"use server";
import { logAudit } from "@/lib/audit";
import { getSession } from "@/lib/auth/session";

export async function recordMfa(kind: "enrolled" | "verified") {
  if (!(await getSession())) return;
  await logAudit(kind === "enrolled" ? "auth.mfa_enrolled" : "auth.mfa_verified");
}
