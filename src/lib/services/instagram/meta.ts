import "server-only";
import { verifyMetaSignature } from "@/lib/crypto";
import { graphRequest } from "./graph";
import type { MetaConfig } from "./meta-config";
import {
  InstagramNotConfiguredError,
  WebhookValidationError,
  type ConnectionStatus,
  type InboundEvent,
  type InstagramMessage,
  type InstagramProfile,
  type InstagramService,
  type InstagramThread,
  type SendMessageInput,
  type SendMessageResult,
} from "./types";

/**
 * Real Instagram implementation (Instagram API with Instagram Login), one instance per owner.
 *
 * STATUS: written from Meta's documentation. Pure logic (payload parsing, signature check,
 * status) is unit tested. The HTTP calls (send, profile, history) have NOT been run against
 * live Meta from this codebase, so verify them with a real test DM before relying on them.
 */
export class MetaInstagramService implements InstagramService {
  readonly kind = "meta" as const;

  constructor(private readonly cfg: MetaConfig) {}

  private get ids(): string[] {
    return [this.cfg.igAccountId, this.cfg.igScopedId].filter((x): x is string => Boolean(x));
  }

  async getStatus(): Promise<ConnectionStatus> {
    const expired = this.cfg.expiresAt !== null && new Date(this.cfg.expiresAt).getTime() <= Date.now();
    if (expired) {
      return { kind: "meta", connected: false, label: "Token expired", detail: "Paste a new access token in Settings." };
    }
    return {
      kind: "meta",
      connected: true,
      label: this.cfg.username ? `Connected as @${this.cfg.username}` : "Connected",
      detail: "Verified when you connected. Sending is unproven until your first real DM goes out.",
    };
  }

  async getConversation(externalThreadId: string): Promise<InstagramThread | null> {
    const profile = await this.getProfile(externalThreadId);
    return profile ? { externalThreadId, profile } : null;
  }

  /** Newest messages with one user, oldest first. */
  async getMessages(externalThreadId: string, limit: number): Promise<InstagramMessage[]> {
    const n = Math.min(Math.max(limit, 1), 50);
    const res = await graphRequest<{
      data?: Array<{
        messages?: { data?: Array<{ id: string; created_time: string; from?: { id?: string }; message?: string }> };
      }>;
    }>({
      path: "me/conversations",
      token: this.cfg.accessToken,
      query: { platform: "instagram", user_id: externalThreadId, fields: `messages.limit(${n}){id,created_time,from,message}` },
    });
    const raw = res.data?.[0]?.messages?.data ?? [];
    return raw
      .filter((m) => m.id && m.message && m.created_time)
      .map((m) => ({
        externalMessageId: m.id,
        externalThreadId,
        senderExternalId: m.from?.id ?? "",
        isEcho: m.from?.id !== undefined && this.ids.includes(m.from.id),
        text: m.message as string,
        timestamp: new Date(m.created_time).toISOString(),
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const res = await graphRequest<{ message_id?: string; recipient_id?: string }>({
      path: `${this.cfg.igAccountId}/messages`,
      method: "POST",
      token: this.cfg.accessToken,
      body: { recipient: { id: input.recipientExternalId }, message: { text: input.text } },
    });
    if (!res.message_id) throw new Error("Instagram accepted the request but returned no message id. Treating as not sent.");
    return { externalMessageId: res.message_id, delivery: "instagram" };
  }

  async getProfile(externalUserId: string): Promise<InstagramProfile | null> {
    const res = await graphRequest<{ id?: string; name?: string; username?: string; profile_pic?: string }>({
      path: externalUserId,
      token: this.cfg.accessToken,
      query: { fields: "name,username,profile_pic" },
    });
    if (!res.username && !res.name) return null;
    return {
      externalId: externalUserId,
      username: res.username ?? externalUserId,
      name: res.name ?? res.username ?? externalUserId,
      avatarUrl: res.profile_pic ?? null,
    };
  }

  verifyWebhookChallenge(params: URLSearchParams): string | null {
    if (params.get("hub.mode") !== "subscribe") return null;
    if (params.get("hub.verify_token") !== this.cfg.verifyToken) return null;
    return params.get("hub.challenge");
  }

  async handleWebhook(rawBody: string, headers: Headers): Promise<InboundEvent[]> {
    if (!verifyMetaSignature(rawBody, headers.get("x-hub-signature-256"), this.cfg.appSecret)) {
      throw new WebhookValidationError("Invalid webhook signature");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new WebhookValidationError("Webhook body is not valid JSON");
    }
    return parseMetaMessagingPayload(payload, this.ids);
  }
}

/** Stand-in used when nothing is connected yet. Nothing can be sent. */
export class UnconfiguredInstagramService implements InstagramService {
  readonly kind = "meta" as const;
  private fail(): never {
    throw new InstagramNotConfiguredError("Instagram isn't connected. Add your access token and app secret in Settings.");
  }
  async getStatus(): Promise<ConnectionStatus> {
    return { kind: "meta", connected: false, label: "Not connected", detail: "Add your Instagram details in Settings." };
  }
  async getConversation(): Promise<InstagramThread | null> { return this.fail(); }
  async getMessages(): Promise<InstagramMessage[]> { return this.fail(); }
  async sendMessage(): Promise<SendMessageResult> { return this.fail(); }
  async getProfile(): Promise<InstagramProfile | null> { return this.fail(); }
  async handleWebhook(): Promise<InboundEvent[]> { return this.fail(); }
  verifyWebhookChallenge(): string | null { return null; }
}

interface MetaMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean };
}

/** Ids found in entry[].id, used to work out which owner a webhook belongs to. Unauthenticated input. */
export function extractEntryIds(payload: unknown): string[] {
  const entries = (payload as { entry?: Array<{ id?: unknown }> } | null)?.entry;
  if (!Array.isArray(entries)) return [];
  return [...new Set(entries.map((e) => (typeof e?.id === "string" || typeof e?.id === "number" ? String(e.id) : "")).filter(Boolean))];
}

/** Exported for tests. Text messages only; attachments, reads and reactions are ignored. */
export function parseMetaMessagingPayload(payload: unknown, businessIds: string[]): InboundEvent[] {
  const events: InboundEvent[] = [];
  const entries = (payload as { entry?: Array<{ messaging?: MetaMessagingEvent[] }> } | null)?.entry;
  if (!Array.isArray(entries)) return events;

  for (const entry of entries) {
    for (const ev of entry.messaging ?? []) {
      const text = ev.message?.text;
      const mid = ev.message?.mid;
      const senderId = ev.sender?.id;
      const recipientId = ev.recipient?.id;
      if (!text || !mid || !senderId || !recipientId) continue;

      const isEcho = Boolean(ev.message?.is_echo) || businessIds.includes(senderId);
      const leadId = isEcho ? recipientId : senderId;
      events.push({
        thread: {
          externalThreadId: leadId,
          // Real name/username are filled in from the profile lookup on first contact.
          profile: { externalId: leadId, username: leadId, name: leadId, avatarUrl: null },
        },
        message: {
          externalMessageId: mid,
          externalThreadId: leadId,
          senderExternalId: senderId,
          isEcho,
          text,
          timestamp: new Date(ev.timestamp ?? Date.now()).toISOString(),
        },
      });
    }
  }
  return events;
}
