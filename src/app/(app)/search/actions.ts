"use server";
import { requireRole } from "@/lib/auth/session";
import { runAction } from "@/lib/actions";
import { listLeads } from "@/lib/leads/queries";
import { searchKind } from "@/lib/leads/search";
import { maskPhone } from "@/lib/crypto/fieldCrypto";

/** Global Search: 8 leads the user can see (RLS), matched by full number, last 4 digits or name. Always masked here. */
export async function searchLeads(q: string) {
  return runAction(async () => {
    const session = await requireRole();
    if (searchKind(q).kind === "none") return [];
    const { rows } = await listLeads({ ...session, role: session.role === "super_admin" ? "admin" : session.role }, { q });
    return rows.slice(0, 8).map((r) => ({ id: r.id, name: r.name, phone: r.phone.startsWith("•") ? r.phone : maskPhone(r.phone.slice(-4)), status: r.status }));
  });
}

/** Blind-index token for a full phone number, so filter URLs never hold the number itself. */
export async function phoneSearchToken(q: string) {
  return runAction(async () => {
    const session = await requireRole("super_admin", "admin", "team_leader");
    const k = searchKind(q);
    if (k.kind !== "phone") return null;
    const { getOrgKeys } = await import("@/lib/crypto/orgKeys");
    const { blindIndex } = await import("@/lib/crypto/fieldCrypto");
    return blindIndex(k.phone, (await getOrgKeys(session.orgId)).hashKey);
  });
}
