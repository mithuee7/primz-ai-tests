// DEBUG VERSION - Add this to src/app/api/webhooks/instagram/route.ts temporarily
// Replace the POST function with this to see what's happening

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`webhook:${ip}`, 300, 60_000).ok) return new NextResponse("Too many requests", { status: 429 });

  const rawBody = await request.text();

  // THE BODY ISN'T TRUSTED YET: it is only used to pick which stored app secret to verify against.
  let entryIds: string[];
  try {
    const parsed = JSON.parse(rawBody);
    console.log("[webhook DEBUG] Parsed webhook body:", JSON.stringify(parsed, null, 2));
    
    entryIds = extractEntryIds(parsed);
    console.log("[webhook DEBUG] Extracted entry IDs:", entryIds);
  } catch (err) {
    console.error("[webhook DEBUG] JSON parse failed:", err);
    return new NextResponse("Bad request", { status: 400 });
  }

  const repo = getRepository();
  const ownerId = await repo.findOwnerByMeta({ igIds: entryIds });
  
  console.log("[webhook DEBUG] Looked up owner with entry IDs:", entryIds);
  console.log("[webhook DEBUG] Found owner:", ownerId);
  
  if (!ownerId) {
    console.error("[webhook DEBUG] OWNER NOT FOUND - This is the problem!");
    console.error("[webhook DEBUG] No app_settings record has these entry IDs.");
    console.error("[webhook DEBUG] Check your database for meta_ig_account_id or meta_ig_scoped_id");
    return new NextResponse("Unknown account", { status: 401 });
  }
  
  const cfg = await loadMetaConfig(ownerId);
  if (!cfg) {
    console.error("[webhook DEBUG] CONFIG NOT LOADED for owner:", ownerId);
    return new NextResponse("Instagram integration not configured", { status: 503 });
  }
  
  console.log("[webhook DEBUG] Loaded config for owner:", ownerId);
  console.log("[webhook DEBUG] Config account IDs - meta_ig_account_id:", cfg.igAccountId, "meta_ig_scoped_id:", cfg.igScopedId);

  await ensureFreshInstagramToken(ownerId);
  const ig = new MetaInstagramService(cfg);

  let events;
  try {
    events = await ig.handleWebhook(rawBody, request.headers); // verifies the signature
    console.log("[webhook DEBUG] Successfully parsed webhook, got", events.length, "events");
  } catch (err) {
    if (err instanceof WebhookValidationError) {
      console.error("[webhook DEBUG] SIGNATURE VERIFICATION FAILED - Wrong app secret?", err.message);
      return new NextResponse("Invalid signature", { status: 401 });
    }
    if (err instanceof InstagramNotConfiguredError) return new NextResponse("Instagram integration not configured", { status: 503 });
    console.error("[webhook DEBUG] parse failure:", err instanceof Error ? err.message : "unknown");
    return new NextResponse("Bad request", { status: 400 });
  }

  const accepted: IngestResult[] = [];
  try {
    for (const event of events) {
      console.log("[webhook DEBUG] Ingesting event from", event.message.senderExternalId, ":", event.message.text);
      accepted.push(await ingestInboundEvent(ownerId, event));
    }
  } catch (err) {
    console.error("[webhook DEBUG] storage failure:", err instanceof Error ? err.message : "unknown");
    return new NextResponse("Storage error", { status: 500 });
  }

  const duplicates = accepted.filter((r) => r.duplicate).length;
  const toEnrich = accepted.filter((r) => r.isNew || r.needsProfile);
  const toProcess = new Set(accepted.filter((r) => r.shouldRunPipeline).map((r) => r.conversationId));

  console.log("[webhook DEBUG] Accepted:", accepted.length, "Duplicates:", duplicates, "To enrich:", toEnrich.length, "To process:", toProcess.size);

  if (toEnrich.length > 0 || toProcess.size > 0) {
    after(async () => {
      try {
        const seen = new Set<string>();
        for (const info of toEnrich) {
          if (seen.has(info.conversationId)) continue;
          seen.add(info.conversationId);
          console.log("[webhook DEBUG] Enriching conversation:", info.conversationId);
          await enrichConversation(ownerId, info, ig);
        }
        await sweepStaleReplyClaims(ownerId);
        for (const conversationId of toProcess) {
          console.log("[webhook DEBUG] Running pipeline for conversation:", conversationId);
          const outcome = await runPipeline({ ownerId, conversationId });
          console.log(`[pipeline] conversation=${conversationId} outcome=${outcome.status}`);
        }
      } catch (err) {
        console.error("[webhook DEBUG] background work failed:", err instanceof Error ? err.message : "unknown");
      }
    });
  }

  console.log("[webhook DEBUG] ✓ Webhook processed successfully, returning 200");
  return NextResponse.json({ received: events.length, duplicates });
}
