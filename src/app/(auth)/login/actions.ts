"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkLockout, recordAttempt } from "@/lib/auth/lockoutStore";
import { logAudit } from "@/lib/audit";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });
export type LoginState = { error?: string };

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  const { email, password } = parsed.data;

  const lock = await checkLockout(email);
  if (lock.locked) {
    const mins = Math.max(1, Math.ceil((lock.retryAt!.getTime() - Date.now()) / 60_000));
    return { error: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  await recordAttempt(email, !error);
  if (error || !data.user) {
    await logAudit("auth.login_failed", "user", undefined, { email }, { orgId: null, userId: null });
    return { error: "Invalid email or password." };
  }
  const { data: p } = await createAdminClient().from("profiles").select("org_id, role").eq("user_id", data.user.id).maybeSingle();
  await logAudit("auth.login", "user", data.user.id, {}, { orgId: p?.org_id ?? null, userId: data.user.id });
  // Go straight to the real next page: a server-action redirect that middleware re-redirects leaves a stale URL.
  redirect(p?.role === "super_admin" || p?.role === "admin" ? "/mfa" : p?.role === "caller" ? "/my-tasks" : "/reports");
}

export async function logout() {
  await logAudit("auth.logout");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
