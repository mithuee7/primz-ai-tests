"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { encryptForStorage } from "@/lib/secrets";
import { isDemoMode } from "@/lib/env";
import { getRepository } from "@/lib/repo";
import { rateLimit } from "@/lib/rate-limit";
import {
  appSettingsInputSchema,
  approveReviewSchema,
  conversationConfigSchema,
  groqKeySchema,
  manualMessageSchema,
  serviceInputSchema,
  simulateLeadSchema,
} from "@/lib/schemas";
import { runPipeline, type PipelineOutcome } from "@/lib/services/ai/pipeline";
import {
  approveGeneration,
  discardGeneration,
  dismissReviewFlag,
  saveConversationConfig,
  sendManualMessage,
  setAutoChat,
  takeOverConversation,
} from "@/lib/services/conversation-ops";
import { connectInstagram, disconnectInstagram, refreshInstagramToken } from "@/lib/services/instagram/token";
import { ingestInboundEvent } from "@/lib/services/ingest";
import { createAuthClient } from "@/lib/supabase/clients";
import { errorMessage } from "@/lib/utils";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const idSchema = z.string().min(1).max(100);

async function guarded<T>(name: string, fn: (ownerId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await requireUserForAction();
    const rl = rateLimit(`action:${user.id}:${name}`, 60, 60_000);
    if (!rl.ok) return { ok: false, error: "Too many requests. Try again in a moment." };
    return { ok: true, data: await fn(user.id) };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
    console.error(`[action:${name}]`, errorMessage(err));
    return { ok: false, error: errorMessage(err) };
  }
}

function refreshAll() {
  revalidatePath("/", "layout");
}

export interface PipelineSummary {
  status: PipelineOutcome["status"];
  message: string;
}

function summarize(o: PipelineOutcome): PipelineSummary {
  switch (o.status) {
    case "SENT":
      return { status: o.status, message: o.delivery === "mock" ? "AI reply approved and recorded (simulated, not sent to Instagram)." : "AI reply approved and sent." };
    case "NEEDS_REVIEW":
      return { status: o.status, message: `Not sent. Flagged for review: ${o.reason}` };
    case "SKIPPED":
      return { status: o.status, message: `No reply: ${o.reason}.` };
    case "ERROR_NOT_SENT":
      return { status: o.status, message: `Nothing was sent: ${o.reason}` };
  }
}

/* ------------------------------ chat controls ------------------------------ */

export async function toggleAutoChatAction(conversationId: string, enabled: boolean): Promise<ActionResult<PipelineSummary | null>> {
  return guarded("toggleAutoChat", async (ownerId) => {
    const id = idSchema.parse(conversationId);
    await setAutoChat(ownerId, id, enabled);
    let summary: PipelineSummary | null = null;
    if (enabled) {
      // If the lead is waiting on a reply, handle it now.
      const outcome = await runPipeline({ ownerId, conversationId: id });
      if (outcome.status !== "SKIPPED") summary = summarize(outcome);
    }
    refreshAll();
    return summary;
  });
}

export async function takeOverAction(conversationId: string): Promise<ActionResult> {
  return guarded("takeOver", async (ownerId) => {
    await takeOverConversation(ownerId, idSchema.parse(conversationId));
    refreshAll();
  });
}

export async function runAiNowAction(conversationId: string, forceBadDraft = false): Promise<ActionResult<PipelineSummary>> {
  return guarded("runAiNow", async (ownerId) => {
    const outcome = await runPipeline({
      ownerId,
      conversationId: idSchema.parse(conversationId),
      manual: true,
      demo: isDemoMode() ? { forceBadDraft } : undefined,
    });
    refreshAll();
    return summarize(outcome);
  });
}

export async function saveConfigAction(conversationId: string, input: unknown): Promise<ActionResult> {
  return guarded("saveConfig", async (ownerId) => {
    await saveConversationConfig(ownerId, idSchema.parse(conversationId), conversationConfigSchema.parse(input));
    refreshAll();
  });
}

export async function sendManualMessageAction(input: unknown): Promise<ActionResult> {
  return guarded("sendManual", async (ownerId) => {
    const parsed = manualMessageSchema.parse(input);
    await sendManualMessage(ownerId, parsed.conversation_id, parsed.text);
    refreshAll();
  });
}

/** Demo only: pretend the lead sent a message, then run the same ingest + pipeline path as a real webhook. */
export async function simulateLeadMessageAction(input: unknown): Promise<ActionResult<PipelineSummary | null>> {
  return guarded("simulateLead", async (ownerId) => {
    if (!isDemoMode()) throw new Error("Simulated messages are only available in demo mode.");
    const parsed = simulateLeadSchema.parse(input);
    const conv = await getRepository().getConversation(ownerId, parsed.conversation_id);
    if (!conv) throw new Error("Conversation not found");

    const result = await ingestInboundEvent(ownerId, {
      thread: {
        externalThreadId: conv.external_thread_id,
        profile: { externalId: conv.lead_external_id ?? conv.external_thread_id, name: conv.lead_name, username: conv.lead_username, avatarUrl: conv.lead_avatar_url },
      },
      message: {
        externalMessageId: `sim_${crypto.randomUUID()}`,
        externalThreadId: conv.external_thread_id,
        senderExternalId: conv.lead_external_id ?? conv.external_thread_id,
        isEcho: false,
        text: parsed.text,
        timestamp: new Date().toISOString(),
      },
    });
    let summary: PipelineSummary | null = null;
    if (result.shouldRunPipeline) {
      summary = summarize(await runPipeline({ ownerId, conversationId: conv.id, demo: { forceBadDraft: parsed.force_bad_draft } }));
    }
    refreshAll();
    return summary;
  });
}

/* ------------------------------- needs review ------------------------------- */

export async function approveReviewAction(input: unknown): Promise<ActionResult> {
  return guarded("approveReview", async (ownerId) => {
    const parsed = approveReviewSchema.parse(input);
    await approveGeneration(ownerId, parsed.generation_id, parsed.text);
    refreshAll();
  });
}

export async function discardReviewAction(generationId: string): Promise<ActionResult> {
  return guarded("discardReview", async (ownerId) => {
    await discardGeneration(ownerId, idSchema.parse(generationId));
    refreshAll();
  });
}

export async function dismissFlagAction(conversationId: string): Promise<ActionResult> {
  return guarded("dismissFlag", async (ownerId) => {
    await dismissReviewFlag(ownerId, idSchema.parse(conversationId));
    refreshAll();
  });
}

/* --------------------------------- services --------------------------------- */

export async function saveServiceAction(input: unknown): Promise<ActionResult> {
  return guarded("saveService", async (ownerId) => {
    await getRepository().saveService(ownerId, serviceInputSchema.parse(input));
    refreshAll();
  });
}

export async function deleteServiceAction(id: string): Promise<ActionResult> {
  return guarded("deleteService", async (ownerId) => {
    await getRepository().deleteService(ownerId, idSchema.parse(id));
    refreshAll();
  });
}

/* --------------------------------- settings --------------------------------- */

export async function saveSettingsAction(input: unknown): Promise<ActionResult> {
  return guarded("saveSettings", async (ownerId) => {
    const parsed = appSettingsInputSchema.parse(input);
    await getRepository().saveAppSettings(ownerId, {
      ...parsed,
      default_custom_tone: parsed.default_tone === "custom" ? parsed.default_custom_tone : null,
    });
    refreshAll();
  });
}

export async function saveGroqKeyAction(key: string): Promise<ActionResult> {
  return guarded("saveGroqKey", async (ownerId) => {
    const secret = groqKeySchema.parse(key);
    await getRepository().saveAppSettings(ownerId, {
      groq_key_encrypted: encryptForStorage(secret),
      groq_key_last4: secret.slice(-4),
    });
    refreshAll();
  });
}

const connectInstagramSchema = z.object({
  access_token: z.string().trim().min(20, "That doesn't look like an Instagram access token").max(1000),
  app_secret: z.string().trim().min(16, "That doesn't look like an Instagram app secret").max(200),
});

export async function connectInstagramAction(input: unknown): Promise<ActionResult<{ username: string | null; warnings: string[] }>> {
  return guarded("connectInstagram", async (ownerId) => {
    if (isDemoMode()) throw new Error("Demo mode uses a simulated Instagram. Set up Supabase to connect a real account.");
    const parsed = connectInstagramSchema.parse(input);
    const res = await connectInstagram(ownerId, { accessToken: parsed.access_token, appSecret: parsed.app_secret });
    refreshAll();
    return { username: res.username, warnings: res.warnings };
  });
}

export async function refreshInstagramTokenAction(): Promise<ActionResult<{ expiresAt: string }>> {
  return guarded("refreshInstagramToken", async (ownerId) => {
    if (isDemoMode()) throw new Error("Not available in demo mode.");
    const res = await refreshInstagramToken(ownerId);
    refreshAll();
    return res;
  });
}

export async function disconnectInstagramAction(): Promise<ActionResult> {
  return guarded("disconnectInstagram", async (ownerId) => {
    if (isDemoMode()) throw new Error("Not available in demo mode.");
    await disconnectInstagram(ownerId);
    refreshAll();
  });
}

export async function clearGroqKeyAction(): Promise<ActionResult> {
  return guarded("clearGroqKey", async (ownerId) => {
    await getRepository().saveAppSettings(ownerId, { groq_key_encrypted: null, groq_key_last4: null });
    refreshAll();
  });
}

export async function resetDemoAction(): Promise<ActionResult> {
  return guarded("resetDemo", async (ownerId) => {
    if (!isDemoMode()) throw new Error("Only available in demo mode.");
    await getRepository().resetDemo?.(ownerId);
    refreshAll();
  });
}

export async function signOutAction(): Promise<void> {
  if (!isDemoMode()) {
    const supabase = await createAuthClient();
    await supabase.auth.signOut();
  }
}
