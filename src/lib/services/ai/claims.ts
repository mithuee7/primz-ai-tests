import "server-only";
import { getRepository } from "@/lib/repo";
import { runPipeline } from "./pipeline";

const STALE_CLAIM_MS = 5 * 60_000;
/** A lead message must have gone unanswered at least this long before recovery picks it up. */
const RECOVER_MIN_AGE_MS = 90_000;
const RECOVER_MAX_AGE_MS = 30 * 60_000;
const RECOVER_THROTTLE_MS = 60_000;

/**
 * A run can die mid-flight (process killed, deploy, timeout) while holding a PROCESSING claim.
 * We never guess: if we find our reply stored, the claim becomes SENT. Otherwise we can't know
 * whether Instagram delivered it, so the claim becomes UNKNOWN (never retried automatically)
 * and the chat is flagged so a human checks Instagram.
 */
export async function sweepStaleReplyClaims(ownerId: string, staleMs = STALE_CLAIM_MS): Promise<number> {
  const repo = getRepository();
  let swept = 0;
  try {
    const stale = await repo.listStaleClaims(ownerId, staleMs);
    for (const claim of stale) {
      const msgs = await repo.listRecentMessages(ownerId, claim.conversation_id, 50);
      const replied = msgs.some((m) => m.sender_type === "ai" && m.metadata?.trigger_message_id === claim.trigger_message_id);
      if (replied) {
        await repo.setClaimStatus(ownerId, claim.trigger_message_id, "SENT", claim.generation_id);
      } else {
        await repo.setClaimStatus(ownerId, claim.trigger_message_id, "UNKNOWN", claim.generation_id);
        await repo.updateState(ownerId, claim.conversation_id, {
          needs_review: true,
          review_reason: "A reply was interrupted and may or may not have been delivered. Check Instagram before replying.",
        });
      }
      swept++;
    }
  } catch (err) {
    console.error("[claims] sweep failed:", err instanceof Error ? err.message : "unknown");
  }
  return swept;
}

const lastRecovery = new Map<string, number>();

/**
 * Safety net if a webhook never arrived or its follow-up run died before claiming:
 * lead messages that went unanswered for a while in auto-chat conversations get a pipeline run.
 * The claim table guarantees this can never produce a second reply for a message.
 */
export async function recoverUnansweredMessages(ownerId: string): Promise<number> {
  const now = Date.now();
  if (now - (lastRecovery.get(ownerId) ?? 0) < RECOVER_THROTTLE_MS) return 0;
  lastRecovery.set(ownerId, now);

  let started = 0;
  try {
    await sweepStaleReplyClaims(ownerId);
    const convs = await getRepository().listConversations(ownerId);
    for (const c of convs) {
      if (!c.settings.auto_chat_enabled || c.state.needs_review || c.last_message_sender !== "lead" || !c.last_message_at) continue;
      const age = now - new Date(c.last_message_at).getTime();
      if (age < RECOVER_MIN_AGE_MS || age > RECOVER_MAX_AGE_MS) continue;
      started++;
      const outcome = await runPipeline({ ownerId, conversationId: c.id });
      console.log(`[recovery] conversation=${c.id} outcome=${outcome.status}`);
    }
  } catch (err) {
    console.error("[claims] recovery failed:", err instanceof Error ? err.message : "unknown");
  }
  return started;
}
