import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SERVICES } from "@/lib/default-services";
import type { ServiceInput } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/clients";
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
import { defaultAppSettings } from "./memory";
import type { NewMessage, Repository, UpsertConversationInput } from "./types";

interface PgError {
  message: string;
  code?: string;
}

function must<T>(res: { data: T | null; error: PgError | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: no data`);
  return res.data;
}

function one<T>(v: T | T[] | null | undefined): T {
  const row = Array.isArray(v) ? v[0] : v;
  if (!row) throw new Error("Missing related row");
  return row;
}

type ConversationRow = Conversation & {
  conversation_settings: ConversationSettings | ConversationSettings[] | null;
  conversation_state: ConversationState | ConversationState[] | null;
  conversation_services: { service_id: string }[] | null;
};

const CONVERSATION_SELECT =
  "*, conversation_settings(*), conversation_state(*), conversation_services(service_id)";

function toFull(row: ConversationRow): ConversationFull {
  const { conversation_settings, conversation_state, conversation_services, ...conv } = row;
  return {
    ...conv,
    settings: one(conversation_settings),
    state: one(conversation_state),
    service_ids: (conversation_services ?? []).map((x) => x.service_id),
  };
}

function reviewRow(r: AiReview): AiReview {
  return { ...r, confidence: Number(r.confidence) };
}

/** Numeric columns come back as strings; meta_* columns are missing until migration 0002 is run. */
function normalizeSettings(row: AppSettings): AppSettings {
  return { ...APP_SETTINGS_META_DEFAULTS, ...row, checker_min_confidence: Number(row.checker_min_confidence) };
}

const initialized = new Set<string>();
const initializing = new Map<string, Promise<void>>();

export class SupabaseRepository implements Repository {
  private db: SupabaseClient = createAdminClient();

  /** First touch for an owner: create settings + seed default services. */
  private init(ownerId: string): Promise<void> {
    if (initialized.has(ownerId)) return Promise.resolve();
    // A page load fires several queries at once. Share one in-flight init per owner.
    let inflight = initializing.get(ownerId);
    if (!inflight) {
      inflight = this.runInit(ownerId)
        .then(() => {
          initialized.add(ownerId);
        })
        .finally(() => initializing.delete(ownerId));
      initializing.set(ownerId, inflight);
    }
    return inflight;
  }

  private async runInit(ownerId: string) {
    // Only the original columns are inserted, so first login still works if 0002 hasn't been run yet.
    const { owner_id: _o, updated_at: _u, ...all } = defaultAppSettings(ownerId);
    const defaults = Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith("meta_")));
    // ON CONFLICT DO NOTHING: safe across concurrent requests and multiple server instances.
    // Only the request that actually inserted the row gets it back, and only that one seeds services.
    const res = await this.db
      .from("app_settings")
      .upsert({ owner_id: ownerId, ...defaults }, { onConflict: "owner_id", ignoreDuplicates: true })
      .select("owner_id");
    const inserted = must(res, "init settings");
    if (inserted.length === 0) return;

    const { count } = await this.db.from("services").select("id", { count: "exact", head: true }).eq("owner_id", ownerId);
    if (!count) {
      must(
        await this.db
          .from("services")
          .insert(DEFAULT_SERVICES.map((s, i) => ({ ...s, owner_id: ownerId, sort_order: i, is_active: true })))
          .select(),
        "seed services",
      );
    }
  }

  async listConversations(ownerId: string) {
    await this.init(ownerId);
    const res = await this.db
      .from("conversations")
      .select(CONVERSATION_SELECT)
      .eq("owner_id", ownerId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(500);
    return must(res, "listConversations").map((r) => toFull(r as ConversationRow));
  }

  async getConversation(ownerId: string, id: string) {
    const res = await this.db.from("conversations").select(CONVERSATION_SELECT).eq("owner_id", ownerId).eq("id", id).maybeSingle();
    if (res.error) throw new Error(`getConversation: ${res.error.message}`);
    return res.data ? toFull(res.data as ConversationRow) : null;
  }

  async upsertConversationByThread(ownerId: string, input: UpsertConversationInput) {
    await this.init(ownerId);
    const found = await this.db
      .from("conversations")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("external_thread_id", input.external_thread_id)
      .maybeSingle();
    if (found.error) throw new Error(`upsertConversation: ${found.error.message}`);
    let id = found.data?.id as string | undefined;
    if (!id) {
      const ins = await this.db
        .from("conversations")
        .upsert({ owner_id: ownerId, ...input }, { onConflict: "owner_id,external_thread_id", ignoreDuplicates: false })
        .select("id")
        .single();
      id = must(ins, "insert conversation").id as string;
      const app = await this.getAppSettings(ownerId);
      must(
        await this.db
          .from("conversation_settings")
          .upsert(
            { conversation_id: id, owner_id: ownerId, tone: app.default_tone, custom_tone: app.default_custom_tone },
            { onConflict: "conversation_id", ignoreDuplicates: true },
          )
          .select(),
        "insert settings",
      );
      must(
        await this.db
          .from("conversation_state")
          .upsert({ conversation_id: id, owner_id: ownerId }, { onConflict: "conversation_id", ignoreDuplicates: true })
          .select(),
        "insert state",
      );
    }
    const conv = await this.getConversation(ownerId, id);
    if (!conv) throw new Error("Conversation vanished after upsert");
    return conv;
  }

  async updateSettings(ownerId: string, conversationId: string, patch: Partial<Omit<ConversationSettings, "conversation_id">>) {
    const res = await this.db
      .from("conversation_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("owner_id", ownerId)
      .eq("conversation_id", conversationId)
      .select("conversation_id");
    if (must(res, "updateSettings").length === 0) throw new Error("Conversation not found");
  }

  async updateState(ownerId: string, conversationId: string, patch: Partial<Omit<ConversationState, "conversation_id">>) {
    const res = await this.db
      .from("conversation_state")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("owner_id", ownerId)
      .eq("conversation_id", conversationId)
      .select("conversation_id");
    if (must(res, "updateState").length === 0) throw new Error("Conversation not found");
  }

  async setConversationServices(ownerId: string, conversationId: string, serviceIds: string[]) {
    const own = must(await this.db.from("conversations").select("id").eq("owner_id", ownerId).eq("id", conversationId), "ownership");
    if (own.length === 0) throw new Error("Conversation not found");
    const valid = must(await this.db.from("services").select("id").eq("owner_id", ownerId).in("id", serviceIds.length ? serviceIds : ["00000000-0000-0000-0000-000000000000"]), "validate services");
    const ids = valid.map((v) => v.id as string);
    must(await this.db.from("conversation_services").delete().eq("owner_id", ownerId).eq("conversation_id", conversationId).select(), "clear services");
    if (ids.length) {
      must(
        await this.db.from("conversation_services").insert(ids.map((service_id) => ({ conversation_id: conversationId, service_id, owner_id: ownerId }))).select(),
        "set services",
      );
    }
  }

  async acquireLock(ownerId: string, conversationId: string, ttlMs: number) {
    const nowIso = new Date().toISOString();
    const res = await this.db
      .from("conversation_state")
      .update({ lock_until: new Date(Date.now() + ttlMs).toISOString() })
      .eq("owner_id", ownerId)
      .eq("conversation_id", conversationId)
      .or(`lock_until.is.null,lock_until.lt.${nowIso}`)
      .select("conversation_id");
    return must(res, "acquireLock").length > 0;
  }

  async releaseLock(ownerId: string, conversationId: string) {
    await this.db.from("conversation_state").update({ lock_until: null }).eq("owner_id", ownerId).eq("conversation_id", conversationId);
  }

  async addMessage(ownerId: string, msg: NewMessage) {
    const row = {
      owner_id: ownerId,
      conversation_id: msg.conversation_id,
      external_message_id: msg.external_message_id,
      sender_type: msg.sender_type,
      sender_name: msg.sender_name,
      content: msg.content,
      created_at: msg.created_at ?? new Date().toISOString(),
      metadata: msg.metadata ?? {},
    };
    const ins = await this.db.from("messages").insert(row).select().single();
    if (ins.error) {
      if (ins.error.code === "23505" && msg.external_message_id) {
        const existing = must(
          await this.db.from("messages").select().eq("owner_id", ownerId).eq("external_message_id", msg.external_message_id).single(),
          "load duplicate",
        );
        return { message: existing as unknown as Message, created: false };
      }
      throw new Error(`addMessage: ${ins.error.message}`);
    }
    const message = must(ins, "addMessage") as unknown as Message;
    await this.db
      .from("conversations")
      .update({
        last_message_at: message.created_at,
        last_message_preview: message.content.slice(0, 200),
        last_message_sender: message.sender_type,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", ownerId)
      .eq("id", msg.conversation_id);
    return { message, created: true };
  }

  async listRecentMessages(ownerId: string, conversationId: string, limit: number) {
    const res = await this.db
      .from("messages")
      .select()
      .eq("owner_id", ownerId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (must(res, "listRecentMessages") as Message[]).reverse();
  }

  async updateMessage(ownerId: string, messageId: string, patch: { sender_type?: Message["sender_type"]; sender_name?: string | null; metadata?: Record<string, unknown> }) {
    const { metadata, ...cols } = patch;
    const update: Record<string, unknown> = { ...cols };
    if (metadata) {
      const cur = must(await this.db.from("messages").select("metadata").eq("owner_id", ownerId).eq("id", messageId).single(), "load message");
      update.metadata = { ...((cur as unknown as { metadata?: Record<string, unknown> }).metadata ?? {}), ...metadata };
    }
    must(await this.db.from("messages").update(update).eq("owner_id", ownerId).eq("id", messageId).select("id"), "updateMessage");
  }

  /** The primary key (trigger_message_id) makes the claim atomic across requests and server instances. */
  async claimReply(ownerId: string, conversationId: string, triggerMessageId: string, reclaimable: ReplyClaimStatus[]) {
    const ins = await this.db
      .from("reply_claims")
      .insert({ owner_id: ownerId, conversation_id: conversationId, trigger_message_id: triggerMessageId, status: "PROCESSING" })
      .select("trigger_message_id");
    if (!ins.error) return { claimed: true as const };
    if (ins.error.code !== "23505") throw new Error(`claimReply: ${ins.error.message}`);

    if (reclaimable.length > 0) {
      // Conditional update: only one concurrent caller can flip a claim out of a reclaimable status.
      const upd = await this.db
        .from("reply_claims")
        .update({ status: "PROCESSING", updated_at: new Date().toISOString() })
        .eq("owner_id", ownerId)
        .eq("trigger_message_id", triggerMessageId)
        .in("status", reclaimable)
        .select("trigger_message_id");
      if (upd.error) throw new Error(`claimReply: ${upd.error.message}`);
      if (upd.data && upd.data.length > 0) return { claimed: true as const };
    }
    const ex = await this.db.from("reply_claims").select().eq("owner_id", ownerId).eq("trigger_message_id", triggerMessageId).maybeSingle();
    return { claimed: false as const, existing: (ex.data as ReplyClaim | null) ?? null };
  }

  async setClaimStatus(ownerId: string, triggerMessageId: string, status: ReplyClaimStatus, generationId?: string | null) {
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (generationId !== undefined) patch.generation_id = generationId;
    must(await this.db.from("reply_claims").update(patch).eq("owner_id", ownerId).eq("trigger_message_id", triggerMessageId).select("trigger_message_id"), "setClaimStatus");
  }

  async listStaleClaims(ownerId: string, olderThanMs: number) {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const res = await this.db.from("reply_claims").select().eq("owner_id", ownerId).eq("status", "PROCESSING").lte("updated_at", cutoff).limit(50);
    return must(res, "listStaleClaims") as ReplyClaim[];
  }

  async listServices(ownerId: string) {
    await this.init(ownerId);
    const res = await this.db.from("services").select().eq("owner_id", ownerId).order("sort_order");
    return must(res, "listServices") as Service[];
  }

  async saveService(ownerId: string, input: ServiceInput) {
    const { id, ...fields } = input;
    if (id) {
      const res = await this.db
        .from("services")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("owner_id", ownerId)
        .eq("id", id)
        .select()
        .single();
      return must(res, "saveService") as Service;
    }
    const count = (await this.listServices(ownerId)).length;
    const res = await this.db.from("services").insert({ ...fields, owner_id: ownerId, sort_order: count }).select().single();
    return must(res, "createService") as Service;
  }

  async deleteService(ownerId: string, id: string) {
    must(await this.db.from("services").delete().eq("owner_id", ownerId).eq("id", id).select(), "deleteService");
  }

  async createGeneration(ownerId: string, gen: Pick<AiGeneration, "conversation_id" | "generated_text" | "model" | "prompt_version" | "status" | "error" | "state_update">) {
    const res = await this.db.from("ai_generations").insert({ owner_id: ownerId, ...gen }).select().single();
    return must(res, "createGeneration") as AiGeneration;
  }

  async updateGeneration(ownerId: string, id: string, patch: Partial<Pick<AiGeneration, "status" | "error" | "generated_text">>) {
    must(await this.db.from("ai_generations").update(patch).eq("owner_id", ownerId).eq("id", id).select(), "updateGeneration");
  }

  async getGeneration(ownerId: string, id: string) {
    const res = await this.db.from("ai_generations").select().eq("owner_id", ownerId).eq("id", id).maybeSingle();
    if (res.error) throw new Error(`getGeneration: ${res.error.message}`);
    return (res.data as AiGeneration | null) ?? null;
  }

  async addReview(ownerId: string, review: Omit<AiReview, "id" | "created_at" | "owner_id">) {
    const res = await this.db.from("ai_reviews").insert({ owner_id: ownerId, ...review }).select().single();
    return reviewRow(must(res, "addReview") as AiReview);
  }

  async listReviews(ownerId: string, generationId: string) {
    const res = await this.db.from("ai_reviews").select().eq("owner_id", ownerId).eq("generation_id", generationId).order("created_at");
    return (must(res, "listReviews") as AiReview[]).map(reviewRow);
  }

  async listGenerationsByStatus(ownerId: string, status: GenerationStatus) {
    const res = await this.db
      .from("ai_generations")
      .select()
      .eq("owner_id", ownerId)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(200);
    return must(res, "listGenerationsByStatus") as AiGeneration[];
  }

  async listGenerationsForConversation(ownerId: string, conversationId: string, limit: number) {
    const res = await this.db
      .from("ai_generations")
      .select()
      .eq("owner_id", ownerId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return must(res, "listGenerationsForConversation") as AiGeneration[];
  }

  async getAppSettings(ownerId: string) {
    await this.init(ownerId);
    const res = await this.db.from("app_settings").select().eq("owner_id", ownerId).single();
    return normalizeSettings(must(res, "getAppSettings") as AppSettings);
  }

  async updateConversationProfile(ownerId: string, conversationId: string, patch: { lead_name?: string; lead_username?: string; lead_avatar_url?: string | null }) {
    must(
      await this.db
        .from("conversations")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("owner_id", ownerId)
        .eq("id", conversationId)
        .select("id"),
      "updateConversationProfile",
    );
  }

  async findOwnerByMeta(query: { igIds?: string[]; verifyToken?: string }) {
    let q = this.db.from("app_settings").select("owner_id").limit(1);
    if (query.verifyToken) {
      q = q.eq("meta_verify_token", query.verifyToken);
    } else if (query.igIds?.length) {
      // Ids come from an unauthenticated payload and go into a filter string: digits only.
      const ids = query.igIds.filter((id) => /^\d{5,25}$/.test(id));
      if (ids.length === 0) return null;
      q = q.or(ids.map((id) => `meta_ig_account_id.eq.${id},meta_ig_scoped_id.eq.${id}`).join(","));
    } else {
      return null;
    }
    const res = await q.maybeSingle();
    if (res.error) {
      console.error("[findOwnerByMeta]", res.error.message);
      return null;
    }
    return (res.data?.owner_id as string | undefined) ?? null;
  }

  async saveAppSettings(ownerId: string, patch: Partial<Omit<AppSettings, "owner_id">>) {
    await this.init(ownerId);
    const res = await this.db
      .from("app_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("owner_id", ownerId)
      .select()
      .single();
    return normalizeSettings(must(res, "saveAppSettings") as AppSettings);
  }
}
