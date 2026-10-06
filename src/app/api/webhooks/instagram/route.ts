import { after, NextResponse, type NextRequest } from "next/server";
import { getRepository } from "@/lib/repo";
import { rateLimit } from "@/lib/rate-limit";
import { runPipeline } from "@/lib/services/ai/pipeline";
import { sweepStaleReplyClaims } from "@/lib/services/ai/claims";
import { enrichConversation, ingestInboundEvent, type IngestResult } from "@/lib/services/ingest";
import { InstagramNotConfiguredError, WebhookValidationError } from "@/lib/services/instagram";
import { MetaInstagramService, extractEntryIds } from "@/lib/services/instagram/meta";
import { loadMetaConfig } from "@/lib/services/instagram/meta-config";
import { ensureFreshInstagramToken } from "@/lib/services/instagram/token";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET: Meta's subscription handshake. The verify token is the one the app generated in
 * Settings, so the owner is found by matching it.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const token = params.get("hub.verify_token");
  if (params.get("hub.mode") !== "subscribe" || !token) return new NextResponse("Forbidden", { status: 403 });

  const ownerId = await getRepository().findOwnerByMeta({ verifyToken: token });
  const cfg = ownerId ? await loadMetaConfig(ownerId) : null;
  const challenge = cfg ? new MetaInstagramService(cfg).verifyWebhookChallenge(params) : null;
  if (challenge === null) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

/**
 * POST: incoming Instagram messages.
 * find owner by Instagram account id -> verify signature with THAT owner's app secret ->
 * store (idempotent) -> if auto chat is on, run the AI pipeline after responding.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`webhook:${ip}`, 300, 60_000).ok) return new NextResponse("Too many requests", { status: 429 });

  const rawBody = await request.text(); // raw bytes are required for signature verification

  // The body isn't trusted yet: it is only used to pick which stored app secret to verify against.
  let entryIds: string[];
  try {
    entryIds = extractEntryIds(JSON.parse(rawBody));
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const repo = getRepository();
  const ownerId = await repo.findOwnerByMeta({ igIds: entryIds });
  const cfg = ownerId ? await loadMetaConfig(ownerId) : null;
  if (!ownerId || !cfg) return new NextResponse("Unknown account", { status: 401 });

  await ensureFreshInstagramToken(ownerId);
  const ig = new MetaInstagramService((await loadMetaConfig(ownerId)) ?? cfg);

  let events;
  try {
    events = await ig.handleWebhook(rawBody, request.headers); // verifies the signature
  } catch (err) {
    if (err instanceof WebhookValidationError) return new NextResponse("Invalid signature", { status: 401 });
    if (err instanceof InstagramNotConfiguredError) return new NextResponse("Instagram integration not configured", { status: 503 });
    console.error("[webhook] parse failure:", err instanceof Error ? err.message : "unknown");
    return new NextResponse("Bad request", { status: 400 });
  }

  // Meta re-delivers any webhook that isn't answered with a 2xx quickly. So this route only does
  // fast local work (store each event under its unique message id; duplicates are dropped) and
  // answers 200. Instagram lookups and the AI run happen after the response, and the reply_claims
  // table guarantees one reply per inbound message id however many times Meta retries.
  const accepted: IngestResult[] = [];
  try {
    for (const event of events) accepted.push(await ingestInboundEvent(ownerId, event));
  } catch (err) {
    // Non-2xx so Meta retries; storage is idempotent so retries are safe.
    console.error("[webhook] storage failure:", err instanceof Error ? err.message : "unknown");
    return new NextResponse("Storage error", { status: 500 });
  }

  const duplicates = accepted.filter((r) => r.duplicate).length;
  const toEnrich = accepted.filter((r) => r.isNew || r.needsProfile);
  const toProcess = new Set(accepted.filter((r) => r.shouldRunPipeline).map((r) => r.conversationId));

  if (toEnrich.length > 0 || toProcess.size > 0) {
    after(async () => {
      try {
        const seen = new Set<string>();
        for (const info of toEnrich) {
          if (seen.has(info.conversationId)) continue;
          seen.add(info.conversationId);
          await enrichConversation(ownerId, info, ig);
        }
        await sweepStaleReplyClaims(ownerId);
        for (const conversationId of toProcess) {
          const outcome = await runPipeline({ ownerId, conversationId });
          console.log(`[pipeline] conversation=${conversationId} outcome=${outcome.status}`);
        }
      } catch (err) {
        console.error("[webhook] background work failed:", err instanceof Error ? err.message : "unknown");
      }
    });
  }

  return NextResponse.json({ received: events.length, duplicates });
}
