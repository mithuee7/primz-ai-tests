import "server-only";
import { randomBytes } from "node:crypto";
import { getRepository } from "@/lib/repo";
import { encryptForStorage, tryDecrypt } from "@/lib/secrets";
import { graphRequest } from "./graph";

const DAY_MS = 86_400_000;
export const REFRESH_WHEN_DAYS_LEFT = 20;
const MIN_TOKEN_AGE_MS = DAY_MS; // Meta only refreshes tokens that are at least 24h old
const DEFAULT_TOKEN_LIFETIME_DAYS = 60;

/** Pure: should we refresh now? Exported for tests. */
export function shouldRefreshToken(args: { expiresAt: string | null; refreshedAt: string | null; now?: number }): boolean {
  const now = args.now ?? Date.now();
  if (!args.expiresAt) return false;
  const expires = new Date(args.expiresAt).getTime();
  if (expires <= now) return false; // already expired: refresh can't revive it, user must paste a new token
  if (expires - now > REFRESH_WHEN_DAYS_LEFT * DAY_MS) return false;
  if (args.refreshedAt && now - new Date(args.refreshedAt).getTime() < MIN_TOKEN_AGE_MS) return false;
  return true;
}

export function daysLeft(expiresAt: string | null, now: number = Date.now()): number | null {
  if (!expiresAt) return null;
  return Math.floor((new Date(expiresAt).getTime() - now) / DAY_MS);
}

export interface ConnectResult {
  username: string | null;
  accountId: string;
  warnings: string[];
}

/**
 * Verifies the pasted token against Instagram, upgrades it to a long-lived one when possible,
 * and stores everything encrypted. The Instagram account id is read from the token itself.
 */
export async function connectInstagram(ownerId: string, input: { accessToken: string; appSecret: string }): Promise<ConnectResult> {
  const repo = getRepository();
  const warnings: string[] = [];
  let token = input.accessToken.trim();
  let lifetimeDays = DEFAULT_TOKEN_LIFETIME_DAYS;

  // A short-lived token (about 1 hour) is swapped for a 60-day one. Tokens that are already
  // long-lived are rejected by this call, which is fine: we keep what was pasted.
  try {
    const ex = await graphRequest<{ access_token?: string; expires_in?: number }>({
      path: "access_token",
      unversioned: true,
      token,
      query: { grant_type: "ig_exchange_token", client_secret: input.appSecret.trim(), access_token: token },
    });
    if (ex.access_token) {
      token = ex.access_token;
      if (ex.expires_in) lifetimeDays = Math.round(ex.expires_in / 86_400);
    }
  } catch {
    // keep pasted token
  }

  const me = await graphRequest<{ user_id?: string | number; id?: string | number; username?: string }>({
    path: "me",
    token,
    query: { fields: "user_id,username" },
  });
  const accountId = String(me.user_id ?? me.id ?? "");
  if (!accountId) throw new Error("Instagram didn't return an account id for this token.");

  const current = await repo.getAppSettings(ownerId);
  const now = new Date();
  await repo.saveAppSettings(ownerId, {
    meta_ig_account_id: accountId,
    meta_ig_scoped_id: me.id !== undefined ? String(me.id) : null,
    meta_ig_username: me.username ?? null,
    meta_token_encrypted: encryptForStorage(token),
    meta_app_secret_encrypted: encryptForStorage(input.appSecret.trim()),
    meta_token_expires_at: new Date(now.getTime() + lifetimeDays * DAY_MS).toISOString(),
    meta_token_refreshed_at: now.toISOString(),
    meta_verify_token: current.meta_verify_token ?? `primz_${randomBytes(12).toString("hex")}`,
  });

  // Best effort: subscribe this account to the "messages" webhook field.
  try {
    await graphRequest({
      path: `${accountId}/subscribed_apps`,
      method: "POST",
      token,
      query: { subscribed_fields: "messages" },
    });
  } catch (err) {
    warnings.push(`Couldn't switch on the messages webhook automatically (${err instanceof Error ? err.message : "unknown error"}). Turn it on in Meta's webhook settings.`);
  }

  return { username: me.username ?? null, accountId, warnings };
}

export async function disconnectInstagram(ownerId: string): Promise<void> {
  await getRepository().saveAppSettings(ownerId, {
    meta_ig_account_id: null,
    meta_ig_scoped_id: null,
    meta_ig_username: null,
    meta_token_encrypted: null,
    meta_token_expires_at: null,
    meta_token_refreshed_at: null,
    meta_app_secret_encrypted: null,
    // keep meta_verify_token so the webhook URL/token already entered in Meta stays valid
  });
}

/** Extends the token by another ~60 days. Throws with Meta's message if it can't. */
export async function refreshInstagramToken(ownerId: string): Promise<{ expiresAt: string }> {
  const repo = getRepository();
  const s = await repo.getAppSettings(ownerId);
  const token = tryDecrypt(s.meta_token_encrypted);
  if (!token) throw new Error("No Instagram token saved.");

  const res = await graphRequest<{ access_token?: string; expires_in?: number }>({
    path: "refresh_access_token",
    unversioned: true,
    token,
    query: { grant_type: "ig_refresh_token", access_token: token },
  });
  if (!res.access_token) throw new Error("Instagram didn't return a refreshed token.");

  const now = Date.now();
  const expiresAt = new Date(now + (res.expires_in ?? DEFAULT_TOKEN_LIFETIME_DAYS * 86_400) * 1000).toISOString();
  await repo.saveAppSettings(ownerId, {
    meta_token_encrypted: encryptForStorage(res.access_token),
    meta_token_expires_at: expiresAt,
    meta_token_refreshed_at: new Date(now).toISOString(),
  });
  return { expiresAt };
}

const inflight = new Map<string, Promise<void>>();

/**
 * Called on page loads and incoming webhooks. Refreshes when 20 days or less remain.
 * Never throws: a failed refresh is logged and retried on a later visit.
 * Note: it only runs while the app gets traffic, so open the dashboard at least
 * once every few weeks, or the token can lapse (then paste a new one).
 */
export function ensureFreshInstagramToken(ownerId: string): Promise<void> {
  let p = inflight.get(ownerId);
  if (!p) {
    p = (async () => {
      try {
        const s = await getRepository().getAppSettings(ownerId);
        if (!s.meta_token_encrypted) return;
        if (!shouldRefreshToken({ expiresAt: s.meta_token_expires_at, refreshedAt: s.meta_token_refreshed_at })) return;
        await refreshInstagramToken(ownerId);
        console.log("[instagram] access token refreshed");
      } catch (err) {
        console.error("[instagram] token refresh failed:", err instanceof Error ? err.message : "unknown");
      }
    })().finally(() => inflight.delete(ownerId));
    inflight.set(ownerId, p);
  }
  return p;
}
