import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_ITEMS, type Item } from "./service";

export async function checklistFor(orgId: string): Promise<Item[]> {
  const { data } = await createAdminClient().from("qa_checklists").select("items").eq("org_id", orgId).maybeSingle();
  return (data?.items as Item[] | undefined)?.length ? (data!.items as Item[]) : DEFAULT_ITEMS;
}
