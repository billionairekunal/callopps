import { test, expect, vi } from "vitest";
import * as imp from "@/lib/leads/importService";
import type { ImportCtx, ImportRepo } from "@/lib/leads/importService";
import type { Role, Session } from "@/lib/auth/roles";
import { generateKey, decryptField } from "@/lib/crypto/fieldCrypto";

const keys = { keyId: "k1", dataKey: generateKey(), hashKey: generateKey() };
const dec = (b: string) => decryptField(b, () => keys.dataKey);
const PROC = "11111111-1111-4111-8111-111111111111";
const BATCH = "22222222-2222-4222-8222-222222222222";

function ctx(role: Role = "admin") {
  const session: Session = { userId: "me", orgId: "org", role, teamId: null, aal: "aal2", fullName: "Me" };
  const repo: ImportRepo = {
    findByPhoneHashes: vi.fn(async () => []),
    insertLeads: vi.fn(async (rows: unknown[]) => rows.map((_, i) => `lead-${i}`)),
    insertEvents: vi.fn(async () => {}),
    insertStatusHistory: vi.fn(async () => {}),
    createSource: vi.fn(async () => "src-1"),
    createBatch: vi.fn(async () => BATCH),
    saveMapping: vi.fn(async () => {}),
    getBatch: vi.fn(async () => ({ source_id: "src-1", source_name: "Bank X" })),
    updateBatch: vi.fn(async () => {}),
    validAssignees: vi.fn(async (ids: string[]) => ids),
    lookups: vi.fn(async () => ({
      processes: [{ id: PROC, name: "SGI" }], products: [{ id: "33333333-3333-4333-8333-333333333333", name: "BBA LLB" }], leadTypes: [],
    })),
  };
  const audit = vi.fn(async () => {});
  return { c: { session, keys: async () => keys, repo, audit } as ImportCtx, repo, audit };
}
const mapping = { Mobile: "phone", Name: "name", College: "process", Course: "product", "Loan Amount": "extra", PAN: "extra" } as const;
const row = (phone: string, over: Record<string, string> = {}) => ({
  phone, alt: null, values: { Mobile: phone, Name: "Asha", College: "SGI", Course: "BBA LLB", "Loan Amount": "5L", PAN: "ABCDE1234F", ...over },
});
const opts = (over: Partial<imp.ChunkOpts> = {}): imp.ChunkOpts => ({ mapping: { ...mapping }, processId: null, sensitiveHeaders: [], assignTo: [], offset: 0, ...over });
const inserted = (repo: ImportRepo) => (repo.insertLeads as ReturnType<typeof vi.fn>).mock.calls[0][0];

test("admin only", async () => {
  for (const r of ["caller", "team_leader"] as Role[]) {
    const { c } = ctx(r);
    await expect(imp.importChunk(c, BATCH, [row("9876543210")], opts())).rejects.toThrow("forbidden");
    await expect(imp.startImport(c, { sourceName: "X", fileName: "x.csv", total: 1, headers: ["Mobile"], mapping: { Mobile: "phone" }, sensitive: [], saveMapping: false })).rejects.toThrow("forbidden");
  }
});
test("encrypts phones: no plaintext phone in the inserted row", async () => {
  const { c, repo } = ctx();
  await imp.importChunk(c, BATCH, [row("9876543210")], opts());
  const r = inserted(repo)[0];
  expect(JSON.stringify(r)).not.toContain("9876543210");
  expect(dec(r.phone_enc)).toBe("9876543210");
  expect(r).toMatchObject({ name: "Asha", process_id: PROC, source_id: "src-1", created_by: "me" });
});
test("unknown process and product names are kept in extra", async () => {
  const { c, repo } = ctx();
  await imp.importChunk(c, BATCH, [row("9876543210", { College: "Unknown College", Course: "MBA" })], opts());
  expect(inserted(repo)[0]).toMatchObject({ process_id: null, product_id: null, extra: { College: "Unknown College", Course: "MBA", "Loan Amount": "5L" } });
});
test("a process column wins over the chosen list process; the list process fills blanks", async () => {
  const { c, repo } = ctx();
  await imp.importChunk(c, BATCH, [row("9876543210", { College: "" })], opts({ processId: PROC }));
  expect(inserted(repo)[0].process_id).toBe(PROC);
});
test("sensitive headers go to sensitive_enc, not extra", async () => {
  const { c, repo } = ctx();
  await imp.importChunk(c, BATCH, [row("9876543210")], opts({ sensitiveHeaders: ["PAN"] }));
  const r = inserted(repo)[0];
  expect(r.extra).not.toHaveProperty("PAN");
  expect(JSON.stringify(r)).not.toContain("ABCDE1234F");
  expect(JSON.parse(dec(r.sensitive_enc))).toEqual({ PAN: "ABCDE1234F" });
});
test("round-robin assignment continues from the chunk offset", async () => {
  const { c, repo } = ctx();
  const A = "44444444-4444-4444-8444-444444444444", B = "55555555-5555-4555-8555-555555555555";
  await imp.importChunk(c, BATCH, [row("9876543210"), row("9123456789"), row("9988776655")], opts({ assignTo: [A, B], offset: 501 }));
  expect(inserted(repo).map((r: { assigned_to: string }) => r.assigned_to)).toEqual([B, A, B]);
});
test("rows whose phone fails server-side cleaning are rejected, not inserted", async () => {
  const { c, repo } = ctx();
  const r = await imp.importChunk(c, BATCH, [row("12345"), row("9876543210")], opts());
  expect(r).toEqual({ imported: 1, failed: 1 });
  expect(inserted(repo)).toHaveLength(1);
});
test("writes created events and status history per lead", async () => {
  const { c, repo } = ctx();
  await imp.importChunk(c, BATCH, [row("9876543210")], opts());
  expect(repo.insertEvents).toHaveBeenCalledWith([expect.objectContaining({ lead_id: "lead-0", type: "created", payload: { via: "import", source: "Bank X" } })]);
  expect(repo.insertStatusHistory).toHaveBeenCalledWith([expect.objectContaining({ lead_id: "lead-0", to_status: "new" })]);
});
test("startImport creates source + batch, saves mapping when asked, audits", async () => {
  const { c, repo, audit } = ctx();
  const r = await imp.startImport(c, { sourceName: "Bank X", fileName: "x.xlsx", total: 10, headers: ["Mobile"], mapping: { Mobile: "phone" }, sensitive: [], saveMapping: true });
  expect(r).toEqual({ batchId: BATCH, sourceId: "src-1" });
  expect(repo.saveMapping).toHaveBeenCalledWith({ source_name: "Bank X", headers: ["Mobile"], mapping: { Mobile: "phone" }, sensitive: [] });
  expect(audit).toHaveBeenCalledWith("import.start", "import", BATCH, { source: "Bank X", file: "x.xlsx", total: 10 });
});
test("startImport requires a phone column", async () => {
  const { c } = ctx();
  await expect(imp.startImport(c, { sourceName: "X", fileName: "x.csv", total: 1, headers: ["A"], mapping: { A: "name" }, sensitive: [], saveMapping: false })).rejects.toThrow(/phone column/);
});
test("checkExisting maps phones to their existing process", async () => {
  const { c, repo } = ctx();
  const { blindIndex } = await import("@/lib/crypto/fieldCrypto");
  (repo.findByPhoneHashes as ReturnType<typeof vi.fn>).mockResolvedValue([{ phone_hash: blindIndex("9876543210", keys.hashKey), process_name: "SGI" }]);
  expect(await imp.checkExisting(c, ["9876543210", "9123456789"])).toEqual({ "9876543210": { processNames: ["SGI"] } });
});

test("phone and email values in extra columns are encrypted, never plain", async () => {
  const { c, repo } = ctx();
  await imp.importChunk(c, BATCH, [{ phone: "9876543210", alt: null, values: { Mobile: "9876543210", "Father Mobile": "9988776655", Guardian: "g@x.in", Notes: "ok" } }],
    opts({ mapping: { Mobile: "phone", "Father Mobile": "extra", Guardian: "extra", Notes: "extra" } }));
  const r = inserted(repo)[0];
  expect(r.extra).toEqual({ Notes: "ok" });
  expect(JSON.stringify(r)).not.toContain("9988776655");
  expect(JSON.parse(dec(r.sensitive_enc))).toEqual({ "Father Mobile": "9988776655", Guardian: "g@x.in" });
});
test("follow-up write failure still reports the saved leads as imported", async () => {
  const { c, repo } = ctx();
  (repo.insertEvents as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db down"));
  expect(await imp.importChunk(c, BATCH, [row("9876543210")], opts())).toEqual({ imported: 1, failed: 0 });
});
test("assignTo must be active callers or team leaders in the org", async () => {
  const { c, repo } = ctx();
  (repo.validAssignees as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  await expect(imp.importChunk(c, BATCH, [row("9876543210")], opts({ assignTo: ["44444444-4444-4444-8444-444444444444"] }))).rejects.toThrow(/active callers/);
});
test("checkExisting returns every process a phone is in", async () => {
  const { c, repo } = ctx();
  const { blindIndex } = await import("@/lib/crypto/fieldCrypto");
  const h = blindIndex("9876543210", keys.hashKey);
  (repo.findByPhoneHashes as ReturnType<typeof vi.fn>).mockResolvedValue([{ phone_hash: h, process_name: "SGI" }, { phone_hash: h, process_name: "BNI" }]);
  expect(await imp.checkExisting(c, ["9876543210"])).toEqual({ "9876543210": { processNames: ["SGI", "BNI"] } });
});
