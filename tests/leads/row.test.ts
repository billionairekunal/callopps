import { test, expect } from "vitest";
import { buildLeadRow, maskEmail } from "@/lib/leads/row";
import { generateKey, decryptField, blindIndex } from "@/lib/crypto/fieldCrypto";

const keys = { keyId: "k1", dataKey: generateKey(), hashKey: generateKey() };
const dec = (b: string) => decryptField(b, () => keys.dataKey);

test("encrypts phone, alt phone and email; computes hashes and masks", () => {
  const r = buildLeadRow({ phone: "9876543210", alt: "9123456789", name: " Rahul ", email: "Rahul.K@Gmail.com", city: "Pune", extra: { "Loan Amount": "5L" } }, keys, "org", {});
  expect(dec(r.phone_enc)).toBe("9876543210");
  expect(r.phone_hash).toBe(blindIndex("9876543210", keys.hashKey));
  expect(r.phone_last4).toBe("3210");
  expect(dec(r.alt_phone_enc!)).toBe("9123456789");
  expect(r.alt_phone_last4).toBe("6789");
  expect(dec(r.email_enc!)).toBe("rahul.k@gmail.com");
  expect(r.email_hash).toBe(blindIndex("rahul.k@gmail.com", keys.hashKey));
  expect(r.email_mask).toBe("r•••@gmail.com");
  expect(r).toMatchObject({ org_id: "org", name: "Rahul", city: "Pune", extra: { "Loan Amount": "5L" }, sensitive_enc: null });
  expect(JSON.stringify(r)).not.toContain("9876543210");
});
test("sensitive fields become one encrypted blob", () => {
  const r = buildLeadRow({ phone: "9876543210" }, keys, "org", { PAN: "ABCDE1234F" });
  expect(JSON.parse(dec(r.sensitive_enc!))).toEqual({ PAN: "ABCDE1234F" });
  expect(JSON.stringify(r)).not.toContain("ABCDE1234F");
  expect(r.email_enc).toBeNull();
  expect(r.alt_phone_enc).toBeNull();
});
test("maskEmail", () => {
  expect(maskEmail("rahul.k@gmail.com")).toBe("r•••@gmail.com");
  expect(maskEmail("bad")).toBe("•••");
});
