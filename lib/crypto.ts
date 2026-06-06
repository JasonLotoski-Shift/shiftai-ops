// AES-256-GCM encryption for secrets at rest — currently Gmail OAuth refresh
// tokens (lib/gmail.ts + the connect flow). The DB is the shared Supabase, so a
// refresh token is never stored in the clear.
//
// Key: TOKEN_ENC_KEY env = 64 hex chars (32 bytes). Generate with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// Stored format: "ivHex:tagHex:ciphertextHex" (authenticated; tampering throws
// on decrypt). Server-only — never import into a client component.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const hex = process.env.TOKEN_ENC_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("TOKEN_ENC_KEY must be 64 hex chars (32 bytes). Generate one with crypto.randomBytes(32).");
  }
  return Buffer.from(hex, "hex");
}

/** Encrypt a UTF-8 string → "iv:tag:ciphertext" (all hex). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12); // 96-bit nonce, recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), ct.toString("hex")].join(":");
}

/** Decrypt a blob produced by encryptSecret. Throws if tampered or malformed. */
export function decryptSecret(blob: string): string {
  const [ivHex, tagHex, ctHex] = blob.split(":");
  if (!ivHex || !tagHex || !ctHex) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]).toString("utf8");
}
