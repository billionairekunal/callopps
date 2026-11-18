import { test, expect } from "vitest";
import { generateKey } from "@/lib/crypto/fieldCrypto";
import { wrapKey, unwrapKey } from "@/lib/crypto/keyWrap";

test("wrap/unwrap roundtrip", () => {
  const master = generateKey(), key = generateKey();
  const wrapped = wrapKey(key, master);
  expect(wrapped.startsWith("v1:master:")).toBe(true);
  expect(unwrapKey(wrapped, master).equals(key)).toBe(true);
  expect(() => unwrapKey(wrapped, generateKey())).toThrow(/decrypt failed/);
});
