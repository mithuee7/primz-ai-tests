import "server-only";
import { InstagramApiError } from "./types";

/**
 * Minimal client for the Instagram API with Instagram Login (graph.instagram.com).
 * Every Meta HTTP call in the app goes through here.
 *
 * NOT VERIFIED AGAINST LIVE META in this repo's tests: endpoint shapes follow Meta's
 * documentation, but real responses may differ. Errors are surfaced, never swallowed.
 */
export const GRAPH_HOST = "https://graph.instagram.com";
export const GRAPH_VERSION = "v23.0";

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

export interface GraphRequest {
  /** Path without version, e.g. "me" or "1784...../messages". */
  path: string;
  method?: "GET" | "POST";
  token: string;
  query?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** For endpoints that are not versioned (refresh_access_token, access_token). */
  unversioned?: boolean;
}

export async function graphRequest<T>(req: GraphRequest): Promise<T> {
  const url = new URL(`${GRAPH_HOST}/${req.unversioned ? "" : GRAPH_VERSION + "/"}${req.path}`);
  for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 15_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method ?? "GET",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${req.token}`,
        ...(req.body ? { "Content-Type": "application/json" } : {}),
      },
      body: req.body ? JSON.stringify(req.body) : undefined,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new InstagramApiError("Instagram request timed out", true);
    throw new InstagramApiError("Could not reach Instagram", true);
  } finally {
    clearTimeout(timer);
  }

  let json: (T & GraphErrorBody) | null = null;
  try {
    json = (await res.json()) as T & GraphErrorBody;
  } catch {
    // handled below
  }

  if (!res.ok || json?.error) {
    const e = json?.error;
    const code = e?.code;
    const message = e?.message ?? `HTTP ${res.status}`;
    const rateLimited = res.status === 429 || code === 4 || code === 17 || code === 32 || code === 613;
    const tokenProblem = code === 190 || res.status === 401;
    throw new InstagramApiError(
      tokenProblem ? `Instagram rejected the access token: ${message}` : rateLimited ? `Instagram rate limit: ${message}` : `Instagram error: ${message}`,
      rateLimited || res.status >= 500,
    );
  }
  if (json === null) throw new InstagramApiError("Instagram returned an unreadable response", false);
  return json;
}
