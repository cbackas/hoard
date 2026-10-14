import { config } from "./config.ts";

// AES-256-GCM: authenticated, so a tampered or wrongly-keyed value fails to decrypt instead of decrypting to garbage.
const ALGORITHM = "AES-GCM";
const IV_BYTES = 12;
// Stored values look like "v1.<iv>.<ciphertext>"; the version leaves room to change the scheme later.
const VERSION = "v1";

const key = await crypto.subtle.importKey("raw", config.encryptionKey, ALGORITHM, false, ["encrypt", "decrypt"]);

/** Encrypts a secret with ENCRYPTION_KEY for storing in the database. */
export async function encrypt(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, new TextEncoder().encode(plaintext));
  return [VERSION, Buffer.from(iv).toString("base64url"), Buffer.from(ciphertext).toString("base64url")].join(".");
}

/** Decrypts a value from encrypt. Throws if it's malformed, was tampered with, or was encrypted with another key. */
export async function decrypt(stored: string): Promise<string> {
  const [version, iv, ciphertext, ...rest] = stored.split(".");
  if (version !== VERSION || !iv || !ciphertext || rest.length > 0) throw new Error("Not a recognised encrypted value");
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: new Uint8Array(Buffer.from(iv, "base64url")) },
    key,
    new Uint8Array(Buffer.from(ciphertext, "base64url")),
  );
  return new TextDecoder().decode(plaintext);
}
