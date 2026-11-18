"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { passwordSchema } from "@/lib/auth/password";


export async function setPassword(_: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const pw = passwordSchema.safeParse(form.get("password"));
  if (!pw.success) return { error: pw.error.issues[0].message };
  if (form.get("password") !== form.get("confirm")) return { error: "Passwords don't match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return { error: error.message };
  await logAudit("auth.password_set");
  redirect("/");
}
