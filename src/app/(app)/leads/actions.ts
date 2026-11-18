"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { runAction } from "@/lib/actions";
import { leadCtx } from "@/lib/leads/repo";
import { addLead as addLeadSvc } from "@/lib/leads/service";

export async function addLead(input: unknown) {
  return runAction(async () => {
    const session = await requireRole("super_admin", "admin");
    const r = await addLeadSvc(await leadCtx(session), input);
    revalidatePath("/leads");
    return r;
  });
}
