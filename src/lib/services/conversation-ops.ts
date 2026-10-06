import "server-only";
import { randomUUID } from "node:crypto";
import { getRepository } from "@/lib/repo";
import type { ConversationConfigInput } from "@/lib/schemas";
import { getInstagramService } from "@/lib/services/instagram";
import type { ConversationFull } from "@/lib/types";
import { nextState } from "./ai/pipeline";

/**
 * Domain operations behind the server actions. All state changes that matter
 * for safety (auto-chat, take over, manual approval) live here so they are
 * enforced server-side regardless of what the UI shows.
 */

async function mustGet(ownerId: string, id: string): Promise<ConversationFull> {
  const conv = await getRepository().getConversation(ownerId, id);
  if (!conv) throw new Error("Conversation not found");
  return conv;
}

export async function setAutoChat(ownerId: string, conversationId: string, enabled: boolean) {
  const repo = getRepository();
  const conv = await mustGet(ownerId, conversationId);
  await repo.updateSettings(ownerId, conversationId, { auto_chat_enabled: enabled });
  // Turning auto chat back on resumes from takeover.
  if (enabled && conv.state.conversation_stage === "HUMAN_TAKEOVER") {
    await repo.updateState(ownerId, conversationId, { conversation_stage: "DISCOVERY" });
  }
}

/** Auto chat OFF immediately; AI is blocked from sending (pipeline re-checks right before every send). */
export async function takeOverConversation(ownerId: string, conversationId: string) {
  const repo = getRepository();
  const conv = await mustGet(ownerId, conversationId);
  await repo.updateSettings(ownerId, conversationId, { auto_chat_enabled: false });
  if (conv.state.pending_generation_id) {
    await repo.updateGeneration(ownerId, conv.state.pending_generation_id, { status: "DISCARDED", error: "Operator took over" });
  }
  await repo.updateState(ownerId, conversationId, {
    conversation_stage: "HUMAN_TAKEOVER",
    needs_review: false,
    review_reason: null,
    pending_generation_id: null,
  });
}

export async function saveConversationConfig(ownerId: string, conversationId: string, input: ConversationConfigInput) {
  const repo = getRepository();
  await mustGet(ownerId, conversationId);
  await repo.updateSettings(ownerId, conversationId, {
    lead_type: input.lead_type,
    tone: input.tone,
    custom_tone: input.tone === "custom" ? input.custom_tone : null,
    extra_instructions: input.extra_instructions,
    all_services: input.all_services,
  });
  await repo.setConversationServices(ownerId, conversationId, input.all_services ? [] : input.service_ids);
}

/** Message typed by the operator in the dashboard. */
export async function sendManualMessage(ownerId: string, conversationId: string, text: string) {
  const repo = getRepository();
  const conv = await mustGet(ownerId, conversationId);
  const sent = await (await getInstagramService(ownerId)).sendMessage({
    externalThreadId: conv.external_thread_id,
    recipientExternalId: conv.lead_external_id ?? conv.external_thread_id,
    text,
  });
  await repo.addMessage(ownerId, {
    conversation_id: conversationId,
    external_message_id: sent.externalMessageId,
    sender_type: "me",
    sender_name: "You",
    content: text,
    metadata: { delivery: sent.delivery },
  });
}

/** Approve (optionally edited) text from the Needs Review queue. Sends EXACTLY `text`, no cleanup. */
export async function approveGeneration(ownerId: string, generationId: string, text: string) {
  const repo = getRepository();
  const gen = await repo.getGeneration(ownerId, generationId);
  if (!gen) throw new Error("Draft not found");
  if (gen.status !== "PENDING_REVIEW") throw new Error("This draft was already handled");
  const conv = await mustGet(ownerId, gen.conversation_id);

  const sent = await (await getInstagramService(ownerId)).sendMessage({
    externalThreadId: conv.external_thread_id,
    recipientExternalId: conv.lead_external_id ?? conv.external_thread_id,
    text,
  });

  const edited = text !== (gen.generated_text ?? "");
  await repo.addMessage(ownerId, {
    conversation_id: conv.id,
    external_message_id: sent.externalMessageId,
    sender_type: "ai",
    sender_name: "Primz AI",
    content: text,
    metadata: { generation_id: gen.id, delivery: sent.delivery, manually_approved: true, edited },
  });
  await repo.addReview(ownerId, {
    generation_id: gen.id,
    reviewer: "manual",
    approved: true,
    confidence: 1,
    issues: [],
    reason: edited ? "Edited and approved by operator" : "Approved by operator",
  });
  await repo.updateGeneration(ownerId, gen.id, { status: "APPROVED_MANUALLY" });

  const parsedUpdate = gen.state_update as Parameters<typeof nextState>[1]["state_update"] | null;
  const patch = parsedUpdate ? nextState(conv.state, { reply: text, state_update: parsedUpdate, escalate_reason: null }) : {};
  await repo.updateState(ownerId, conv.id, {
    ...patch,
    last_ai_message: text,
    needs_review: false,
    review_reason: null,
    pending_generation_id: null,
  });
}

export async function discardGeneration(ownerId: string, generationId: string) {
  const repo = getRepository();
  const gen = await repo.getGeneration(ownerId, generationId);
  if (!gen) throw new Error("Draft not found");
  await repo.updateGeneration(ownerId, gen.id, { status: "DISCARDED" });
  await repo.addReview(ownerId, {
    generation_id: gen.id,
    reviewer: "manual",
    approved: false,
    confidence: 1,
    issues: [],
    reason: "Discarded by operator",
  });
  await repo.updateState(ownerId, gen.conversation_id, { needs_review: false, review_reason: null, pending_generation_id: null });
}

/** Clears a flag that has no draft attached (e.g. a processing error). */
export async function dismissReviewFlag(ownerId: string, conversationId: string) {
  await mustGet(ownerId, conversationId);
  await getRepository().updateState(ownerId, conversationId, { needs_review: false, review_reason: null, pending_generation_id: null });
}

export function demoThreadId() {
  return `t_demo_${randomUUID().slice(0, 8)}`;
}
