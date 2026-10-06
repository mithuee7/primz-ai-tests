import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getEnv } from "@/lib/env";

/**
 * Encryption for secrets stored in the database (Groq key, Instagram token/app secret).
 *
 * No extra environment variable is needed: the key is derived from
 * SUPABASE_SERVICE_ROLE_KEY, which only the server has. APP_ENCRYPTION_KEY, if set,
 * overrides it. Rotating the service-role key makes stored secrets unreadable, so you'd
 * paste them again in Settings.
 */
const g = globalThis as unknown as { __primzDemoSecretKey?: string };

export function getSecretKey(): string {
  const env = getEnv();
  if (env.APP_ENCRYPTION_KEY) return env.APP_ENCRYPTION_KEY;
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    return createHash("sha256").update(`primz-secrets-v1:${env.SUPABASE_SERVICE_ROLE_KEY}`).digest("base64");
  }
  // Demo mode only: in-memory data, so a per-process key is enough.
  return (g.__primzDemoSecretKey ??= randomBytes(32).toString("base64"));
}

export const encryptForStorage = (plaintext: string) => encryptSecret(plaintext, getSecretKey());
export const decryptFromStorage = (ciphertext: string) => decryptSecret(ciphertext, getSecretKey());

/** Returns null instead of throwing when the stored value can't be decrypted. */
export function tryDecrypt(ciphertext: string | null): string | null {
  if (!ciphertext) return null;
  try {
    return decryptFromStorage(ciphertext);
  } catch {
    return null;
  }
}
