import "server-only";
import { getRepository } from "@/lib/repo";
import type { InboundEvent, InstagramService } from "@/lib/services/instagram";

export interface IngestResult {
  conversationId: string;
  duplicate: boolean;
  /** True when the event is a lead message on a chat with auto chat enabled. */
  shouldRunPipeline: boolean;
  /** The chat had no messages before this event (history backfill wanted). */
  isNew: boolean;
  /** The lead still has a placeholder name (profile lookup wanted). */
  needsProfile: boolean;
  externalThreadId: string;
}

const BACKFILL_LIMIT = 20;

/**
 * Stores one normalized inbound event (shared by the webhook route and the demo simulator).
 * Fast and local: identifies/creates the conversation and stores the message idempotently
 * (unique external_message_id, so Meta's retried deliveries are dropped here).
 * It never calls Instagram and never triggers the pipeline.
 */
export async function ingestInboundEvent(ownerId: string, event: InboundEvent): Promise<IngestResult> {
  const repo = getRepository();
  let conv = await repo.upsertConversationByThread(ownerId, {
    external_thread_id: event.thread.externalThreadId,
    lead_external_id: event.thread.profile.externalId,
    lead_name: event.thread.profile.name,
    lead_username: event.thread.profile.username,
    lead_avatar_url: event.thread.profile.avatarUrl,
  });
  const isNew = conv.last_message_at === null;
  const needsProfile = conv.lead_name === conv.external_thread_id;

  const fromLead = !event.message.isEcho;
  const { created } = await repo.addMessage(ownerId, {
    conversation_id: conv.id,
    external_message_id: event.message.externalMessageId,
    sender_type: fromLead ? "lead" : "me",
    sender_name: fromLead ? conv.lead_name : "You",
    content: event.message.text,
    created_at: event.message.timestamp,
    metadata: { source: "webhook" },
  });

  conv = (await repo.getConversation(ownerId, conv.id)) ?? conv;
  return {
    conversationId: conv.id,
    duplicate: !created,
    shouldRunPipeline: created && fromLead && conv.settings.auto_chat_enabled,
    isNew: created && isNew,
    needsProfile: created && needsProfile,
    externalThreadId: event.thread.externalThreadId,
  };
}

/**
 * Slow, best-effort enrichment (profile lookup + recent history so a cold DM sent from the
 * Instagram app is in context). Runs after the webhook has responded. Failures are logged only.
 */
export async function enrichConversation(
  ownerId: string,
  info: Pick<IngestResult, "conversationId" | "externalThreadId" | "isNew" | "needsProfile">,
  ig: InstagramService,
): Promise<void> {
  const repo = getRepository();
  let leadName: string | null = null;

  if (info.needsProfile) {
    try {
      const profile = await ig.getProfile(info.externalThreadId);
      if (profile) {
        leadName = profile.name;
        await repo.updateConversationProfile(ownerId, info.conversationId, {
          lead_name: profile.name,
          lead_username: profile.username,
          lead_avatar_url: profile.avatarUrl,
        });
      }
    } catch (err) {
      console.error("[ingest] profile lookup failed:", err instanceof Error ? err.message : "unknown");
    }
  }

  if (info.isNew) {
    try {
      const name = leadName ?? (await repo.getConversation(ownerId, info.conversationId))?.lead_name ?? "Lead";
      const history = await ig.getMessages(info.externalThreadId, BACKFILL_LIMIT);
      for (const m of history) {
        await repo.addMessage(ownerId, {
          conversation_id: info.conversationId,
          external_message_id: m.externalMessageId,
          sender_type: m.isEcho ? "me" : "lead",
          sender_name: m.isEcho ? "You" : name,
          content: m.text,
          created_at: m.timestamp,
          metadata: { source: "backfill" },
        });
      }
    } catch (err) {
      console.error("[ingest] history backfill failed:", err instanceof Error ? err.message : "unknown");
    }
  }
}
