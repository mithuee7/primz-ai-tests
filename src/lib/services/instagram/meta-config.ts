import "server-only";
import { getRepository } from "@/lib/repo";
import { tryDecrypt } from "@/lib/secrets";

/** Decrypted Instagram connection for one owner. Never serialize this to the client. */
export interface MetaConfig {
  ownerId: string;
  igAccountId: string;
  igScopedId: string | null;
  username: string | null;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  expiresAt: string | null;
}

export async function loadMetaConfig(ownerId: string): Promise<MetaConfig | null> {
  const s = await getRepository().getAppSettings(ownerId);
  const accessToken = tryDecrypt(s.meta_token_encrypted);
  const appSecret = tryDecrypt(s.meta_app_secret_encrypted);
  if (!s.meta_ig_account_id || !accessToken || !appSecret || !s.meta_verify_token) return null;
  return {
    ownerId,
    igAccountId: s.meta_ig_account_id,
    igScopedId: s.meta_ig_scoped_id,
    username: s.meta_ig_username,
    accessToken,
    appSecret,
    verifyToken: s.meta_verify_token,
    expiresAt: s.meta_token_expires_at,
  };
}
