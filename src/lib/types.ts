/**
 * Domain types. Field names mirror the Supabase columns (snake_case) so rows
 * can be used directly without mapping layers.
 */

export const LEAD_TYPES = [
  "doctor",
  "real_estate",
  "ugc_creator",
  "creator",
  "local_business",
  "other",
] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  doctor: "Doctor",
  real_estate: "Real Estate",
  ugc_creator: "UGC Creator",
  creator: "Creator",
  local_business: "Local Business",
  other: "Other",
};

export const TONES = [
  "casual",
  "friendly",
  "professional",
  "confident",
  "direct",
  "custom",
] as const;
export type Tone = (typeof TONES)[number];

export const TONE_LABELS: Record<Tone, string> = {
  casual: "Casual",
  friendly: "Friendly",
  professional: "Professional",
  confident: "Confident",
  direct: "Direct",
  custom: "Custom",
};

export const CONVERSATION_STAGES = [
  "DISCOVERY",
  "RAPPORT",
  "PROBLEM_IDENTIFIED",
  "SERVICE_FIT",
  "PITCHED",
  "OBJECTION",
  "INTERESTED",
  "NOT_INTERESTED",
  "HUMAN_TAKEOVER",
] as const;
export type ConversationStage = (typeof CONVERSATION_STAGES)[number];

export const STAGE_LABELS: Record<ConversationStage, string> = {
  DISCOVERY: "Discovery",
  RAPPORT: "Rapport",
  PROBLEM_IDENTIFIED: "Problem identified",
  SERVICE_FIT: "Service fit",
  PITCHED: "Pitched",
  OBJECTION: "Objection",
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not interested",
  HUMAN_TAKEOVER: "Human takeover",
};

export const PITCH_STATUSES = ["NOT_PITCHED", "PITCHED"] as const;
export type PitchStatus = (typeof PITCH_STATUSES)[number];

export const INTEREST_LEVELS = ["UNKNOWN", "NONE", "LOW", "MEDIUM", "HIGH"] as const;
export type InterestLevel = (typeof INTEREST_LEVELS)[number];

export type SenderType = "me" | "lead" | "ai";

export interface Service {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  ideal_customer: string;
  problems_solved: string;
  key_benefits: string;
  pitch_guidance: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  owner_id: string;
  external_thread_id: string;
  lead_external_id: string | null;
  lead_name: string;
  lead_username: string;
  lead_avatar_url: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender: SenderType | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationSettings {
  conversation_id: string;
  lead_type: LeadType;
  tone: Tone;
  custom_tone: string | null;
  extra_instructions: string;
  all_services: boolean;
  auto_chat_enabled: boolean;
  updated_at: string;
}

export interface ConversationState {
  conversation_id: string;
  current_topic: string | null;
  identified_problem: string | null;
  potential_service_id: string | null;
  interest_level: InterestLevel;
  conversation_stage: ConversationStage;
  pitch_status: PitchStatus;
  objection: string | null;
  last_ai_message: string | null;
  needs_review: boolean;
  review_reason: string | null;
  pending_generation_id: string | null;
  lock_until: string | null;
  updated_at: string;
}

export interface ConversationFull extends Conversation {
  settings: ConversationSettings;
  state: ConversationState;
  service_ids: string[];
}

export interface Message {
  id: string;
  owner_id: string;
  conversation_id: string;
  external_message_id: string | null;
  sender_type: SenderType;
  sender_name: string | null;
  content: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export type GenerationStatus =
  | "PENDING_REVIEW"
  | "SENT"
  | "APPROVED_MANUALLY"
  | "DISCARDED"
  | "REJECTED"
  | "ABORTED"
  | "FAILED";

export interface AiGeneration {
  id: string;
  owner_id: string;
  conversation_id: string;
  generated_text: string | null;
  model: string;
  prompt_version: string;
  status: GenerationStatus;
  error: string | null;
  state_update: Record<string, unknown> | null;
  created_at: string;
}

/**
 * One row per inbound message the AI has been asked to answer. The primary key is the
 * trigger message, so at most ONE reply run can ever own a given message id.
 *  PROCESSING  a run is working on it (or died mid-run, see stale sweep)
 *  SENT        a reply went out
 *  REVIEW      held for a human, nothing sent
 *  FAILED      definitely nothing sent (error before sending / Instagram rejected it)
 *  ABORTED     stopped before sending (auto chat turned off, newer message arrived)
 *  UNKNOWN     a send was attempted and we can't tell if it was delivered. Never retried automatically.
 */
export const REPLY_CLAIM_STATUSES = ["PROCESSING", "SENT", "REVIEW", "FAILED", "ABORTED", "UNKNOWN"] as const;
export type ReplyClaimStatus = (typeof REPLY_CLAIM_STATUSES)[number];

export interface ReplyClaim {
  trigger_message_id: string;
  owner_id: string;
  conversation_id: string;
  status: ReplyClaimStatus;
  generation_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiReview {
  id: string;
  owner_id: string;
  generation_id: string;
  reviewer: "rules" | "ai" | "manual";
  approved: boolean;
  confidence: number;
  issues: string[];
  reason: string;
  created_at: string;
}

export interface AppSettings {
  owner_id: string;
  default_tone: Tone;
  default_custom_tone: string | null;
  default_ai_behavior: string;
  global_instructions: string;
  groq_model: string;
  checker_model: string;
  checker_min_confidence: number;
  /** AES-256-GCM ciphertext. Never sent to the browser. */
  groq_key_encrypted: string | null;
  groq_key_last4: string | null;
  /** Instagram professional account id (what webhooks use as entry.id). */
  meta_ig_account_id: string | null;
  /** Instagram-scoped app user id, returned as `id` by /me. Webhooks may use either. */
  meta_ig_scoped_id: string | null;
  meta_ig_username: string | null;
  /** AES-256-GCM ciphertext. Never sent to the browser. */
  meta_token_encrypted: string | null;
  meta_token_expires_at: string | null;
  meta_token_refreshed_at: string | null;
  /** AES-256-GCM ciphertext. Never sent to the browser. */
  meta_app_secret_encrypted: string | null;
  /** Generated by the app; the owner pastes it into Meta's webhook setup. */
  meta_verify_token: string | null;
  updated_at: string;
}

/** Safe-to-serialize view of AppSettings (no ciphertext). */
export type PublicAppSettings = Omit<AppSettings, "groq_key_encrypted" | "meta_token_encrypted" | "meta_app_secret_encrypted"> & {
  groq_key_saved: boolean;
  meta_token_saved: boolean;
  meta_app_secret_saved: boolean;
};

export const APP_SETTINGS_META_DEFAULTS = {
  meta_ig_account_id: null,
  meta_ig_scoped_id: null,
  meta_ig_username: null,
  meta_token_encrypted: null,
  meta_token_expires_at: null,
  meta_token_refreshed_at: null,
  meta_app_secret_encrypted: null,
  meta_verify_token: null,
} as const;

export interface ReviewItem {
  generation: AiGeneration;
  reviews: AiReview[];
  conversation: ConversationFull;
}
