import { z } from "zod";
import { blindIndex } from "@/lib/crypto/fieldCrypto";
import { cleanPhone } from "./phone";
import { buildLeadRow } from "./row";
import { requireAdmin, type LeadCtx, type LeadRepo } from "./service";
import type { Field } from "./detect";

export type Named = { id: string; name: string };
export type ImportRepo = Omit<LeadRepo, "findByPhoneHash"> & {
  findByPhoneHashes(hashes: string[]): Promise<{ phone_hash: string; process_name: string | null }[]>;
  createSource(name: string): Promise<string>;
  createBatch(row: { source_id: string; file_name: string; total: number }): Promise<string>;
  saveMapping(row: { source_name: string; headers: string[]; mapping: Record<string, Field>; sensitive: string[] }): Promise<void>;
  getBatch(id: string): Promise<{ source_id: string | null; source_name: string } | null>;
  updateBatch(id: string, patch: Record<string, unknown>): Promise<void>;
  lookups(): Promise<{ processes: Named[]; products: Named[]; leadTypes: Named[] }>;
};
export type ImportCtx = Omit<LeadCtx, "repo"> & { repo: ImportRepo };
export type ChunkOpts = {
  mapping: Record<string, Field>; processId: string | null; sensitiveHeaders: string[]; assignTo: string[]; offset: number;
};

const FIELDS = ["phone", "alt_phone", "name", "email", "city", "process", "product", "lead_type", "extra", "ignore"] as const;
const uuid = z.string().uuid();
const mappingSchema = z.record(z.string(), z.enum(FIELDS));
export const MAX_CHUNK = 500;

/** Which of these (already cleaned) phones already exist in the org, and in which process (D9). */
export async function checkExisting(c: ImportCtx, phones: string[]): Promise<Record<string, { processName: string | null }>> {
  requireAdmin(c);
  const list = z.array(z.string().regex(/^\d{10}$/)).max(5000).parse(phones);
  const { hashKey } = await c.keys();
  const byHash = new Map(list.map((p) => [blindIndex(p, hashKey), p]));
  const out: Record<string, { processName: string | null }> = {};
  for (const r of await c.repo.findByPhoneHashes([...byHash.keys()])) {
    const p = byHash.get(r.phone_hash);
    if (p) out[p] = { processName: r.process_name };
  }
  return out;
}

const startSchema = z.object({
  sourceName: z.string().trim().min(1, "Give this list a name").max(120),
  fileName: z.string().max(255), total: z.number().int().min(0).max(1_000_000),
  headers: z.array(z.string()).max(500), mapping: mappingSchema, sensitive: z.array(z.string()).max(500), saveMapping: z.boolean(),
});

export async function startImport(c: ImportCtx, input: unknown): Promise<{ batchId: string; sourceId: string }> {
  requireAdmin(c);
  const d = startSchema.parse(input);
  if (!Object.values(d.mapping).includes("phone")) throw new Error("Pick the phone column first: it is the only required field.");
  if (d.saveMapping) await c.repo.saveMapping({ source_name: d.sourceName, headers: d.headers, mapping: d.mapping, sensitive: d.sensitive });
  const sourceId = await c.repo.createSource(d.sourceName);
  const batchId = await c.repo.createBatch({ source_id: sourceId, file_name: d.fileName, total: d.total });
  await c.audit("import.start", "import", batchId, { source: d.sourceName, file: d.fileName, total: d.total });
  return { batchId, sourceId };
}

const chunkSchema = z.array(z.object({
  phone: z.string().nullable(), alt: z.string().nullable(), values: z.record(z.string(), z.string().max(5000)),
})).max(MAX_CHUNK);
const optsSchema = z.object({
  mapping: mappingSchema, processId: uuid.nullable(), sensitiveHeaders: z.array(z.string()),
  assignTo: z.array(uuid).max(500), offset: z.number().int().min(0),
});

/** Import up to 500 preview-approved rows. Phones are re-cleaned here; the browser is not trusted. */
export async function importChunk(c: ImportCtx, batchId: string, rowsIn: unknown, optsIn: unknown): Promise<{ imported: number; failed: number }> {
  requireAdmin(c);
  const rows = chunkSchema.parse(rowsIn), o = optsSchema.parse(optsIn);
  const batch = await c.repo.getBatch(uuid.parse(batchId));
  if (!batch) throw new Error("This import was not found. Start again.");
  const [keys, look] = await Promise.all([c.keys(), c.repo.lookups()]);
  const find = (list: Named[], v: string) => list.find((x) => x.name.trim().toLowerCase() === v.trim().toLowerCase())?.id ?? null;
  const sensitive = new Set(o.sensitiveHeaders);

  const built = rows.flatMap((r, i) => {
    const phone = cleanPhone(r.phone);
    if (!phone.valid) return [];
    const alt = r.alt ? cleanPhone(r.alt) : null;
    const f: Partial<Record<Field, string>> = {}, extra: Record<string, string> = {}, secret: Record<string, string> = {};
    for (const [h, v] of Object.entries(r.values)) {
      if (!v) continue;
      const field = o.mapping[h] ?? "extra";
      if (field === "phone" || field === "alt_phone" || field === "ignore") continue;
      if (sensitive.has(h)) { secret[h] = v; continue; }
      if (field === "extra") extra[h] = v; else f[field] = v;
    }
    const resolve = (field: "process" | "product" | "lead_type", list: Named[], header: string | undefined) => {
      const v = f[field];
      if (!v) return null;
      const id = find(list, v);
      if (!id && header) extra[header] = v; // unknown name: keep what the owner had
      return id;
    };
    const headerOf = (field: Field) => Object.keys(o.mapping).find((h) => o.mapping[h] === field);
    const process_id = resolve("process", look.processes, headerOf("process")) ?? o.processId;
    return [buildLeadRow({
      phone: phone.primary!, alt: alt?.valid ? alt.primary : phone.alternate,
      name: f.name, email: f.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email) ? f.email : null, city: f.city,
      process_id, product_id: resolve("product", look.products, headerOf("product")),
      lead_type_id: resolve("lead_type", look.leadTypes, headerOf("lead_type")),
      source_id: batch.source_id, created_by: c.session.userId, extra,
      assigned_to: o.assignTo.length ? o.assignTo[(o.offset + i) % o.assignTo.length] : null,
    }, keys, c.session.orgId, secret)];
  });

  const ids = built.length ? await c.repo.insertLeads(built) : [];
  const base = (lead_id: string) => ({ org_id: c.session.orgId, lead_id, actor_id: c.session.userId });
  await c.repo.insertEvents(ids.map((id) => ({ ...base(id), type: "created", payload: { via: "import", source: batch.source_name } })));
  await c.repo.insertStatusHistory(ids.map((id) => ({ ...base(id), from_status: null, to_status: "new" })));
  return { imported: ids.length, failed: rows.length - ids.length };
}

export async function finishImport(c: ImportCtx, batchId: string, counts: unknown) {
  requireAdmin(c);
  const d = z.object({ imported: z.number().int().min(0), skipped: z.number().int().min(0), invalid: z.number().int().min(0), failed: z.boolean() }).parse(counts);
  await c.repo.updateBatch(uuid.parse(batchId), { imported: d.imported, skipped: d.skipped, invalid: d.invalid, status: d.failed ? "failed" : "done" });
  await c.audit("import.complete", "import", batchId, { imported: d.imported, skipped: d.skipped, invalid: d.invalid });
}
