import { describe, test, expect } from "vitest";
import { encryptField, decryptField, blindIndex, last4, maskPhone, generateKey } from "@/lib/crypto/fieldCrypto";

const k = generateKey();
describe("fieldCrypto", () => {
  test("roundtrips", () => {
    expect(decryptField(encryptField("9876543210", k, "k1"), () => k)).toBe("9876543210");
  });
  test("ciphertext differs each call", () => {
    expect(encryptField("x", k, "k1")).not.toBe(encryptField("x", k, "k1"));
  });
  test("format is v1:keyId:iv:tag:ct", () => {
    expect(encryptField("x", k, "k1").split(":").slice(0, 2)).toEqual(["v1", "k1"]);
  });
  test("throws on tampered ciphertext", () => {
    const parts = encryptField("9876543210", k, "k1").split(":");
    const ct = Buffer.from(parts[4], "base64");
    ct[0] ^= 1;
    parts[4] = ct.toString("base64");
    expect(() => decryptField(parts.join(":"), () => k)).toThrow(/decrypt failed/);
  });
  test("throws with another org key", () => {
    const other = generateKey();
    expect(() => decryptField(encryptField("a", k, "k1"), () => other)).toThrow(/decrypt failed/);
  });
  test("throws on malformed blob", () => {
    expect(() => decryptField("garbage", () => k)).toThrow(/decrypt failed/);
  });
  test("blindIndex is deterministic and key-dependent", () => {
    expect(blindIndex("9876543210", k)).toBe(blindIndex("9876543210", k));
    expect(blindIndex("9876543210", k)).not.toBe(blindIndex("9876543210", generateKey()));
    expect(blindIndex("9876543210", k)).toMatch(/^[0-9a-f]{64}$/);
  });
  test("last4 and maskPhone", () => {
    expect(last4("9876544321")).toBe("4321");
    expect(maskPhone("4321")).toBe("•••• •• 4321");
  });
});
