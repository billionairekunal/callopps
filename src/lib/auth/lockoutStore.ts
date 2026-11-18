import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateLockout, WINDOW_MIN } from "./lockout";

export async function checkLockout(email: string, now = new Date()) {
  const since = new Date(now.getTime() - WINDOW_MIN * 60_000).toISOString();
  const { data } = await createAdminClient().from("login_attempts")
    .select("attempted_at, success").eq("email", email.toLowerCase()).gte("attempted_at", since)
    .order("attempted_at", { ascending: false }).limit(20);
  return evaluateLockout(data ?? [], now);
}

export async function recordAttempt(email: string, success: boolean) {
  await createAdminClient().from("login_attempts").insert({ email: email.toLowerCase(), success });
}
