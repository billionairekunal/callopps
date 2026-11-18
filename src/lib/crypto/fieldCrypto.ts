import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

// Format: v1:<keyId>:<ivB64>:<tagB64>:<ctB64>  (AES-256-GCM, 12-byte IV)
export function encryptField(plain: string, key: Buffer, keyId: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", keyId, iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decryptField(blob: string, keyFor: (keyId: string) => Buffer): string {
  try {
    const [v, keyId, iv, tag, ct] = blob.split(":");
    if (v !== "v1" || !keyId || !iv || !tag || ct === undefined) throw new Error("format");
    const d = createDecipheriv("aes-256-gcm", keyFor(keyId), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  } catch {
    throw new Error("decrypt failed");
  }
}

export const blindIndex = (value: string, hashKey: Buffer) =>
  createHmac("sha256", hashKey).update(value).digest("hex");
export const last4 = (digits: string) => digits.slice(-4);
export const maskPhone = (l4: string) => "•••• •• " + l4;
export const generateKey = () => randomBytes(32);
