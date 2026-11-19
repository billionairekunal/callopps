import { test, expect } from "vitest";
import { checkEnv } from "@/lib/env";

const KEY = Buffer.alloc(32, 7).toString("base64");
const ok = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc",
  CALLOPPS_MASTER_KEY: KEY, NEXT_PUBLIC_SITE_URL: "https://app.callopps.in",
};

test("production needs every key, an https site URL and a 32-byte master key", () => {
  expect(checkEnv(ok, true)).toEqual([]);
  expect(checkEnv({ ...ok, SUPABASE_SERVICE_ROLE_KEY: "" }, true)).toEqual(["SUPABASE_SERVICE_ROLE_KEY is missing"]);
  expect(checkEnv({ ...ok, NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }, true)[0]).toMatch(/https/);
  expect(checkEnv({ ...ok, CALLOPPS_MASTER_KEY: "short" }, true)[0]).toMatch(/32 bytes/);
});
test("development only needs the Supabase keys and master key", () => {
  const { NEXT_PUBLIC_SITE_URL: _drop, ...dev } = ok; void _drop;
  expect(checkEnv(dev, false)).toEqual([]);
});

test("the setup page names what's missing and never shows a value", async () => {
  const { setupPage } = await import("@/lib/env");
  const html = setupPage(checkEnv({ ...ok, SUPABASE_SERVICE_ROLE_KEY: "", CALLOPPS_MASTER_KEY: "c2hvcnQ=" }, true));
  expect(html).toContain("SUPABASE_SERVICE_ROLE_KEY is missing");
  expect(html).toContain("CALLOPPS_MASTER_KEY must be 32 bytes");
  expect(html).not.toContain("c2hvcnQ=");
  expect(html).toContain("Redeploy");
});
test("the master key check works without Node's Buffer (middleware runs on the edge)", () => {
  const B = globalThis.Buffer;
  // @ts-expect-error simulate the edge runtime
  globalThis.Buffer = undefined;
  try { expect(checkEnv(ok, true)).toEqual([]); } finally { globalThis.Buffer = B; }
});
