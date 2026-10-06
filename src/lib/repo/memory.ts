import { randomUUID } from "node:crypto";
import { DEFAULT_SERVICES } from "@/lib/default-services";
import type { ServiceInput } from "@/lib/schemas";
import type {
  AiGeneration,
  AiReview,
  AppSettings,
  Conversation,
  ConversationFull,
  ConversationSettings,
  ConversationState,
  GenerationStatus,
  Message,
  ReplyClaim,
  ReplyClaimStatus,
  Service,
} from "@/lib/types";
import { APP_SETTINGS_META_DEFAULTS } from "@/lib/types";
import { buildDemoSeed } from "./demo-seed";
import type { NewMessage, Repository, UpsertConversationInput } from "./types";

interface Store {
  claims: Map<string, ReplyClaim>;
  services: Service[];
  conversations: Conversation[];
  settings: Map<string, ConversationSettings>;
  state: Map<string, ConversationState>;
  convServices: Map<string, string[]>;
  messages: Message[];
  generations: AiGeneration[];
  reviews: AiReview[];
  appSettings: AppSettings;
}

const g = globalThis as unknown as { __primzMemory?: Map<string, Store> };
const stores = (g.__primzMemory ??= new Map<string, Store>());

const now = () => new Date().toISOString();

export function defaultAppSettings(ownerId: string): AppSettings {
  return {
    owner_id: ownerId,
    default_tone: "casual",
    default_custom_tone: null,
    default_ai_behavior:
      "Keep it short. Ask one question at a time. Stay curious about their work before any offer. Pitch only when there's a real fit.",
    global_instructions:
      "We're Primz. We build AI sales assistants, receptionists and lead-response systems. Never quote prices in DMs, move pricing questions to a short call.",
    groq_model: "llama-3.3-70b-versatile",
    checker_model: "llama-3.3-70b-versatile",
    checker_min_confidence: 0.85,
    groq_key_encrypted: null,
    groq_key_last4: null,
    ...APP_SETTINGS_META_DEFAULTS,
    updated_at: now(),
  };
}

function createStore(ownerId: string): Store {
  const services: Service[] = DEFAULT_SERVICES.map((s, i) => ({
    ...s,
    id: randomUUID(),
    owner_id: ownerId,
    is_active: true,
    sort_order: i,
    created_at: now(),
    updated_at: now(),
  }));
  const store: Store = {
    claims: new Map(),
    services,
    conversations: [],
    settings: new Map(),
    state: new Map(),
    convServices: new Map(),
    messages: [],
    generations: [],
    reviews: [],
    appSettings: defaultAppSettings(ownerId),
  };
  buildDemoSeed(ownerId, services, store);
  return store;
}

function storeFor(ownerId: string): Store {
  let s = stores.get(ownerId);
  if (!s) {
    s = createStore(ownerId);
    stores.set(ownerId, s);
  }
  return s;
}

function full(s: Store, c: Conversation): ConversationFull {
  const settings = s.settings.get(c.id);
  const state = s.state.get(c.id);
  if (!settings || !state) throw new Error(`Corrupt conversation ${c.id}`);
  return { ...c, settings: { ...settings }, state: { ...state }, service_ids: [...(s.convServices.get(c.id) ?? [])] };
}

export class MemoryRepository implements Repository {
  async listConversations(ownerId: string) {
    const s = storeFor(ownerId);
    return s.conversations
      .map((c) => full(s, c))
      .sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at));
  }

  async getConversation(ownerId: string, id: string) {
    const s = storeFor(ownerId);
    const c = s.conversations.find((x) => x.id === id);
    return c ? full(s, c) : null;
  }

  async upsertConversationByThread(ownerId: string, input: UpsertConversationInput) {
    const s = storeFor(ownerId);
    const existing = s.conversations.find((c) => c.external_thread_id === input.external_thread_id);
    if (existing) return full(s, existing);
    const id = randomUUID();
    const t = now();
    const c: Conversation = {
      id,
      owner_id: ownerId,
      external_thread_id: input.external_thread_id,
      lead_external_id: input.lead_external_id,
      lead_name: input.lead_name,
      lead_username: input.lead_username,
      lead_avatar_url: input.lead_avatar_url,
      last_message_at: null,
      last_message_preview: null,
      last_message_sender: null,
      created_at: t,
      updated_at: t,
    };
    s.conversations.push(c);
    const app = s.appSettings;
    s.settings.set(id, {
      conversation_id: id,
      lead_type: "other",
      tone: app.default_tone,
      custom_tone: app.default_custom_tone,
      extra_instructions: "",
      all_services: true,
      auto_chat_enabled: false,
      updated_at: t,
    });
    s.state.set(id, {
      conversation_id: id,
      current_topic: null,
      identified_problem: null,
      potential_service_id: null,
      interest_level: "UNKNOWN",
      conversation_stage: "DISCOVERY",
      pitch_status: "NOT_PITCHED",
      objection: null,
      last_ai_message: null,
      needs_review: false,
      review_reason: null,
      pending_generation_id: null,
      lock_until: null,
      updated_at: t,
    });
    s.convServices.set(id, []);
    return full(s, c);
  }

  async updateSettings(ownerId: string, conversationId: string, patch: Partial<Omit<ConversationSettings, "conversation_id">>) {
    const s = storeFor(ownerId);
    const cur = s.settings.get(conversationId);
    if (!cur) throw new Error("Conversation not found");
    s.settings.set(conversationId, { ...cur, ...patch, updated_at: now() });
  }

  async updateState(ownerId: string, conversationId: string, patch: Partial<Omit<ConversationState, "conversation_id">>) {
    const s = storeFor(ownerId);
    const cur = s.state.get(conversationId);
    if (!cur) throw new Error("Conversation not found");
    s.state.set(conversationId, { ...cur, ...patch, updated_at: now() });
  }

  async setConversationServices(ownerId: string, conversationId: string, serviceIds: string[]) {
    const s = storeFor(ownerId);
    if (!s.settings.has(conversationId)) throw new Error("Conversation not found");
    const valid = new Set(s.services.map((x) => x.id));
    s.convServices.set(conversationId, [...new Set(serviceIds)].filter((id) => valid.has(id)));
  }

  async acquireLock(ownerId: string, conversationId: string, ttlMs: number) {
    const s = storeFor(ownerId);
    const cur = s.state.get(conversationId);
    if (!cur) return false;
    if (cur.lock_until && new Date(cur.lock_until).getTime() > Date.now()) return false;
    s.state.set(conversationId, { ...cur, lock_until: new Date(Date.now() + ttlMs).toISOString() });
    return true;
  }

  async releaseLock(ownerId: string, conversationId: string) {
    const s = storeFor(ownerId);
    const cur = s.state.get(conversationId);
    if (cur) s.state.set(conversationId, { ...cur, lock_until: null });
  }

  async addMessage(ownerId: string, msg: NewMessage) {
    const s = storeFor(ownerId);
    const conv = s.conversations.find((c) => c.id === msg.conversation_id);
    if (!conv) throw new Error("Conversation not found");
    if (msg.external_message_id) {
      const dup = s.messages.find((m) => m.external_message_id === msg.external_message_id);
      if (dup) return { message: dup, created: false };
    }
    const created_at = msg.created_at ?? now();
    const message: Message = {
      id: randomUUID(),
      owner_id: ownerId,
      conversation_id: msg.conversation_id,
      external_message_id: msg.external_message_id,
      sender_type: msg.sender_type,
      sender_name: msg.sender_name,
      content: msg.content,
      created_at,
      metadata: msg.metadata ?? {},
    };
    s.messages.push(message);
    if (!conv.last_message_at || created_at >= conv.last_message_at) {
      conv.last_message_at = created_at;
      conv.last_message_preview = msg.content.slice(0, 200);
      conv.last_message_sender = msg.sender_type;
    }
    conv.updated_at = now();
    return { message, created: true };
  }

  async listRecentMessages(ownerId: string, conversationId: string, limit: number) {
    const s = storeFor(ownerId);
    return s.messages
      .filter((m) => m.conversation_id === conversationId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-limit);
  }

  async updateMessage(ownerId: string, messageId: string, patch: { sender_type?: Message["sender_type"]; sender_name?: string | null; metadata?: Record<string, unknown> }) {
    const m = storeFor(ownerId).messages.find((x) => x.id === messageId);
    if (!m) throw new Error("Message not found");
    if (patch.sender_type) m.sender_type = patch.sender_type;
    if (patch.sender_name !== undefined) m.sender_name = patch.sender_name;
    if (patch.metadata) m.metadata = { ...m.metadata, ...patch.metadata };
  }

  // JS is single-threaded and there's no await between the check and the write, so this is atomic.
  async claimReply(ownerId: string, conversationId: string, triggerMessageId: string, reclaimable: ReplyClaimStatus[]) {
    const s = storeFor(ownerId);
    const existing = s.claims.get(triggerMessageId);
    const t = now();
    if (!existing) {
      s.claims.set(triggerMessageId, {
        trigger_message_id: triggerMessageId,
        owner_id: ownerId,
        conversation_id: conversationId,
        status: "PROCESSING",
        generation_id: null,
        created_at: t,
        updated_at: t,
      });
      return { claimed: true as const };
    }
    if (reclaimable.includes(existing.status)) {
      existing.status = "PROCESSING";
      existing.updated_at = t;
      return { claimed: true as const };
    }
    return { claimed: false as const, existing: { ...existing } };
  }

  async setClaimStatus(ownerId: string, triggerMessageId: string, status: ReplyClaimStatus, generationId?: string | null) {
    const c = storeFor(ownerId).claims.get(triggerMessageId);
    if (!c) return;
    c.status = status;
    if (generationId !== undefined) c.generation_id = generationId;
    c.updated_at = now();
  }

  async listStaleClaims(ownerId: string, olderThanMs: number) {
    const cutoff = Date.now() - olderThanMs;
    return [...storeFor(ownerId).claims.values()]
      .filter((c) => c.status === "PROCESSING" && new Date(c.updated_at).getTime() <= cutoff)
      .map((c) => ({ ...c }));
  }

  async listServices(ownerId: string) {
    return [...storeFor(ownerId).services].sort((a, b) => a.sort_order - b.sort_order);
  }

  async saveService(ownerId: string, input: ServiceInput) {
    const s = storeFor(ownerId);
    const existing = input.id ? s.services.find((x) => x.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, { ...input, id: existing.id, updated_at: now() });
      return { ...existing };
    }
    const svc: Service = {
      id: randomUUID(),
      owner_id: ownerId,
      name: input.name,
      description: input.description,
      ideal_customer: input.ideal_customer,
      problems_solved: input.problems_solved,
      key_benefits: input.key_benefits,
      pitch_guidance: input.pitch_guidance,
      is_active: input.is_active,
      sort_order: s.services.length,
      created_at: now(),
      updated_at: now(),
    };
    s.services.push(svc);
    return { ...svc };
  }

  async deleteService(ownerId: string, id: string) {
    const s = storeFor(ownerId);
    s.services = s.services.filter((x) => x.id !== id);
    for (const [cid, ids] of s.convServices) s.convServices.set(cid, ids.filter((x) => x !== id));
    for (const [cid, st] of s.state) {
      if (st.potential_service_id === id) s.state.set(cid, { ...st, potential_service_id: null });
    }
  }

  async createGeneration(ownerId: string, gen: Pick<AiGeneration, "conversation_id" | "generated_text" | "model" | "prompt_version" | "status" | "error" | "state_update">) {
    const row: AiGeneration = { id: randomUUID(), owner_id: ownerId, created_at: now(), ...gen };
    storeFor(ownerId).generations.push(row);
    return { ...row };
  }

  async updateGeneration(ownerId: string, id: string, patch: Partial<Pick<AiGeneration, "status" | "error" | "generated_text">>) {
    const row = storeFor(ownerId).generations.find((x) => x.id === id);
    if (row) Object.assign(row, patch);
  }

  async getGeneration(ownerId: string, id: string) {
    const row = storeFor(ownerId).generations.find((x) => x.id === id);
    return row ? { ...row } : null;
  }

  async addReview(ownerId: string, review: Omit<AiReview, "id" | "created_at" | "owner_id">) {
    const row: AiReview = { id: randomUUID(), owner_id: ownerId, created_at: now(), ...review };
    storeFor(ownerId).reviews.push(row);
    return { ...row };
  }

  async listReviews(ownerId: string, generationId: string) {
    return storeFor(ownerId).reviews.filter((r) => r.generation_id === generationId).map((r) => ({ ...r }));
  }

  async listGenerationsByStatus(ownerId: string, status: GenerationStatus) {
    return storeFor(ownerId)
      .generations.filter((x) => x.status === status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((x) => ({ ...x }));
  }

  async listGenerationsForConversation(ownerId: string, conversationId: string, limit: number) {
    return storeFor(ownerId)
      .generations.filter((x) => x.conversation_id === conversationId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((x) => ({ ...x }));
  }

  async getAppSettings(ownerId: string) {
    return { ...storeFor(ownerId).appSettings };
  }

  async saveAppSettings(ownerId: string, patch: Partial<Omit<AppSettings, "owner_id">>) {
    const s = storeFor(ownerId);
    s.appSettings = { ...s.appSettings, ...patch, updated_at: now() };
    return { ...s.appSettings };
  }

  async updateConversationProfile(ownerId: string, conversationId: string, patch: { lead_name?: string; lead_username?: string; lead_avatar_url?: string | null }) {
    const c = storeFor(ownerId).conversations.find((x) => x.id === conversationId);
    if (!c) throw new Error("Conversation not found");
    if (patch.lead_name !== undefined) c.lead_name = patch.lead_name;
    if (patch.lead_username !== undefined) c.lead_username = patch.lead_username;
    if (patch.lead_avatar_url !== undefined) c.lead_avatar_url = patch.lead_avatar_url;
    c.updated_at = now();
  }

  async findOwnerByMeta(query: { igIds?: string[]; verifyToken?: string }) {
    for (const [ownerId, s] of stores) {
      const a = s.appSettings;
      if (query.verifyToken && a.meta_verify_token && a.meta_verify_token === query.verifyToken) return ownerId;
      if (query.igIds?.some((id) => id === a.meta_ig_account_id || id === a.meta_ig_scoped_id)) return ownerId;
    }
    return null;
  }

  async resetDemo(ownerId: string) {
    stores.delete(ownerId);
  }
}
