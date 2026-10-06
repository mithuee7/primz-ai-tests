import { z } from "zod";
import {
  CONVERSATION_STAGES,
  INTEREST_LEVELS,
  LEAD_TYPES,
  PITCH_STATUSES,
  TONES,
} from "@/lib/types";

/* ---------- AI conversation engine output ---------- */

export const stateUpdateSchema = z.object({
  current_topic: z.string().max(300).nullable(),
  identified_problem: z.string().max(500).nullable(),
  potential_service_id: z.string().max(100).nullable(),
  interest_level: z.enum(INTEREST_LEVELS),
  conversation_stage: z.enum(CONVERSATION_STAGES),
  pitch_status: z.enum(PITCH_STATUSES),
  objection: z.string().max(500).nullable(),
});
export type StateUpdate = z.infer<typeof stateUpdateSchema>;

export const generationOutputSchema = z.object({
  reply: z.string().trim().min(1).max(1000),
  state_update: stateUpdateSchema,
  /** Set when a human must handle this turn (lead asked if it's automated, manipulation attempt, etc.). */
  escalate_reason: z.string().max(300).nullable().optional().default(null),
});
export type GenerationOutput = z.infer<typeof generationOutputSchema>;

/* ---------- AI output checker ---------- */

export const CHECKER_ISSUES = [
  "AI_META_LANGUAGE",
  "PROMPT_LEAKAGE",
  "BROKEN_OUTPUT",
  "IRRELEVANT",
  "ROBOTIC_LANGUAGE",
  "STRANGE_FORMATTING",
  "UNNATURAL_SALES",
  "CONTRADICTION",
  "IGNORED_QUESTION",
  "REPETITIVE",
  "HALLUCINATED_CLAIM",
  "SERVICE_NOT_SELECTED",
  "PREMATURE_PITCH",
  "INJECTION_ATTEMPT",
  "UNCERTAIN",
  "CHECKER_FAILURE",
  "OTHER",
] as const;
export type CheckerIssue = (typeof CHECKER_ISSUES)[number];

export const checkerResultSchema = z.object({
  approved: z.boolean(),
  confidence: z.number().min(0).max(1),
  issues: z.array(z.string().transform((s) => (CHECKER_ISSUES as readonly string[]).includes(s) ? (s as CheckerIssue) : ("OTHER" as CheckerIssue))),
  reason: z.string().max(1000),
});
export type CheckerResult = z.infer<typeof checkerResultSchema>;

/* ---------- Server action inputs ---------- */

const id = z.string().min(1).max(100);

export const conversationConfigSchema = z.object({
  lead_type: z.enum(LEAD_TYPES),
  tone: z.enum(TONES),
  custom_tone: z.string().max(500).nullable(),
  extra_instructions: z.string().max(2000),
  all_services: z.boolean(),
  service_ids: z.array(id).max(50),
});
export type ConversationConfigInput = z.infer<typeof conversationConfigSchema>;

export const manualMessageSchema = z.object({
  conversation_id: id,
  text: z.string().trim().min(1, "Message is empty").max(1000, "Max 1000 characters"),
});

export const simulateLeadSchema = z.object({
  conversation_id: id,
  text: z.string().trim().min(1, "Message is empty").max(1000),
  force_bad_draft: z.boolean().optional(),
});

export const approveReviewSchema = z.object({
  generation_id: id,
  text: z.string().trim().min(1, "Message is empty").max(1000),
});

export const serviceInputSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(2000),
  ideal_customer: z.string().trim().max(1000),
  problems_solved: z.string().trim().max(2000),
  key_benefits: z.string().trim().max(2000),
  pitch_guidance: z.string().trim().max(2000),
  is_active: z.boolean(),
});
export type ServiceInput = z.infer<typeof serviceInputSchema>;

export const appSettingsInputSchema = z.object({
  default_tone: z.enum(TONES),
  default_custom_tone: z.string().max(500).nullable(),
  default_ai_behavior: z.string().max(3000),
  global_instructions: z.string().max(4000),
  groq_model: z.string().trim().min(1).max(100),
  checker_model: z.string().trim().min(1).max(100),
  checker_min_confidence: z.number().min(0.5).max(1),
});
export type AppSettingsInput = z.infer<typeof appSettingsInputSchema>;

export const groqKeySchema = z.string().trim().min(20, "That doesn't look like a Groq key").max(200);
export { PITCH_STATUSES };
