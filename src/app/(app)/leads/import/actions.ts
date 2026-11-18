"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { runAction } from "@/lib/actions";
import { importCtx } from "@/lib/leads/repo";
import * as imp from "@/lib/leads/importService";
import { createClient } from "@/lib/supabase/server";
import type { Field } from "@/lib/leads/detect";

const ctx = async () => importCtx(await requireRole("super_admin", "admin"));

export async function checkExisting(phones: string[]) { return runAction(async () => imp.checkExisting(await ctx(), phones)); }
export async function startImport(input: unknown) { return runAction(async () => imp.startImport(await ctx(), input)); }
export async function importChunk(batchId: string, rows: unknown, opts: unknown) {
  return runAction(async () => imp.importChunk(await ctx(), batchId, rows, opts));
}
export async function finishImport(batchId: string, counts: unknown) {
  return runAction(async () => { await imp.finishImport(await ctx(), batchId, counts); revalidatePath("/leads"); });
}
export async function savedMappings() {
  return runAction(async () => {
    await requireRole("super_admin", "admin");
    const { data } = await (await createClient()).from("import_mappings").select("source_name, headers, mapping, sensitive").order("updated_at", { ascending: false });
    return (data ?? []) as { source_name: string; headers: string[]; mapping: Record<string, Field>; sensitive: string[] }[];
  });
}
