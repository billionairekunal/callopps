import { encryptField, decryptField } from "./fieldCrypto";

export const wrapKey = (key: Buffer, master: Buffer) => encryptField(key.toString("base64"), master, "master");
export const unwrapKey = (wrapped: string, master: Buffer) =>
  Buffer.from(decryptField(wrapped, () => master), "base64");

export function masterKey(): Buffer {
  const k = Buffer.from(process.env.CALLOPPS_MASTER_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("CALLOPPS_MASTER_KEY must be 32 bytes base64");
  return k;
}
