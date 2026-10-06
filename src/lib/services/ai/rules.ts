import type { CheckerIssue } from "@/lib/schemas";

/**
 * Deterministic pre-checks. These run BEFORE the AI checker as a cheap,
 * predictable first line of defence against obvious assistant-speak, and again
 * as the final validation right before sending.
 */

export interface RuleResult {
  ok: boolean;
  issues: CheckerIssue[];
  reason: string;
}

const RULES: Array<{ issue: CheckerIssue; pattern: RegExp; why: string }> = [
  { issue: "AI_META_LANGUAGE", pattern: /\bas an? (ai|language model|assistant)\b/i, why: "identifies itself as an AI/assistant" },
  { issue: "AI_META_LANGUAGE", pattern: /\bi(?:'m| am) an? (ai|assistant|bot|language model|chatbot)\b/i, why: "identifies itself as an AI/assistant" },
  { issue: "AI_META_LANGUAGE", pattern: /\bhere(?:'s| is) (?:a |the |your |an )?(?:suggested |possible |draft |sample )?(message|response|reply|draft|version|dm)\b/i, why: "frames the text as a message for someone else to send" },
  { issue: "AI_META_LANGUAGE", pattern: /\byou can (send|use|copy|paste|reply with)\b/i, why: "addresses an operator rather than the lead" },
  { issue: "AI_META_LANGUAGE", pattern: /^\s*(sure|certainly|absolutely|of course)[,!.]?\s+(i can|i'd|i would|here)/i, why: "opens like an assistant acknowledging a task" },
  { issue: "AI_META_LANGUAGE", pattern: /\bi'?d be happy to (help|assist)\b/i, why: "customer-support phrasing" },
  { issue: "AI_META_LANGUAGE", pattern: /\blet me know if you (need|have|want) (anything|any other|any further)/i, why: "customer-support closing" },
  { issue: "AI_META_LANGUAGE", pattern: /\bplease (provide|share) (the|your|more) (input|details|context|information)\b/i, why: "asks for input like a tool" },
  { issue: "AI_META_LANGUAGE", pattern: /\b(the|this) (user|operator)\b/i, why: "refers to the user/operator" },
  { issue: "PROMPT_LEAKAGE", pattern: /\b(system prompt|my instructions|these instructions|as instructed|state_update|conversation_stage|pitch_status|escalate_reason|selected services|json)\b/i, why: "mentions internal prompt or state vocabulary" },
  { issue: "ROBOTIC_LANGUAGE", pattern: /\b(i hope this (message )?finds you well|thank you for reaching out|i understand your concern|valued (customer|client)|at your earliest convenience|do not hesitate to|kind regards|best regards|sincerely)\b/i, why: "corporate/email phrasing" },
  { issue: "STRANGE_FORMATTING", pattern: /(\*\*|__|```|^#{1,6}\s|^\s*>\s)/m, why: "contains markdown formatting" },
  { issue: "STRANGE_FORMATTING", pattern: /^\s*(?:[-*•]|\d+[.)])\s+\S/m, why: "contains list formatting" },
  { issue: "STRANGE_FORMATTING", pattern: /\[[^\]\n]{1,40}\]|\{\{|\}\}|<\/?[a-z][^>]*>/i, why: "contains template placeholders or markup" },
  { issue: "STRANGE_FORMATTING", pattern: /^\s*(subject|dear)\b/im, why: "reads like an email" },
];

const DANGLING_END = /\b(and|but|or|the|a|an|to|with|of|for|that|which|because|so|if|when)\s*[,]?$/i;

export function runLocalRules(text: string, opts: { recentOwnMessages?: string[] } = {}): RuleResult {
  const issues = new Set<CheckerIssue>();
  const reasons: string[] = [];
  const hit = (issue: CheckerIssue, why: string) => {
    issues.add(issue);
    reasons.push(why);
  };

  const trimmed = text.trim();
  if (trimmed.length < 2) hit("BROKEN_OUTPUT", "message is empty or too short");
  if (trimmed.length > 700) hit("STRANGE_FORMATTING", "message is far too long for a DM");

  for (const rule of RULES) {
    if (rule.pattern.test(trimmed)) hit(rule.issue, rule.why);
  }

  if (DANGLING_END.test(trimmed.replace(/[.!?]+$/, "")) && !/[.!?…)]$/.test(trimmed)) {
    hit("BROKEN_OUTPUT", "message appears cut off mid-sentence");
  }
  if ((trimmed.match(/"/g)?.length ?? 0) % 2 === 1 || count(trimmed, "(") !== count(trimmed, ")")) {
    hit("BROKEN_OUTPUT", "unbalanced quotes or brackets");
  }
  if (trimmed.split(/\n{2,}/).length > 3) hit("STRANGE_FORMATTING", "too many paragraphs for a DM");
  const emojiCount = (trimmed.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emojiCount > 2) hit("STRANGE_FORMATTING", "too many emojis");

  const norm = normalize(trimmed);
  for (const prev of opts.recentOwnMessages ?? []) {
    if (similarity(norm, normalize(prev)) >= 0.8) {
      hit("REPETITIVE", "nearly identical to a message already sent in this chat");
      break;
    }
  }

  return { ok: issues.size === 0, issues: [...issues], reason: reasons.join("; ") };
}

/** Phrases in LEAD messages that look like attempts to steer the system. */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any |your |the )?(previous|prior|above|earlier) (instructions|prompts?|rules)/i,
  /disregard (all |any |your |the )?(previous|prior|above|earlier)?\s*(instructions|prompts?|rules)/i,
  /(reveal|show|print|repeat|tell me) (me )?(your|the) (system )?(prompt|instructions)/i,
  /\bsystem prompt\b/i,
  /you are now\b/i,
  /\b(act|pretend) (as|like) (an? )?(ai|assistant|chatbot|different)/i,
  /\bjailbreak\b/i,
  /\bdeveloper mode\b/i,
];

export function detectInjectionAttempt(leadText: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(leadText));
}

/** Lead sincerely asking whether they're talking to a bot/AI. Never answered automatically. */
export function asksIfAutomated(leadText: string): boolean {
  return /\b(are you|r u|are u|is this|am i (talking|speaking|chatting) (to|with)) (an? |a real |actually |really )?(ai|bot|robot|chatbot|automated|real person|human|a person)\b/i.test(leadText)
    || /\bis (this|that) (an? )?(ai|bot|automated|chatgpt)\b/i.test(leadText)
    || /\b(chatgpt|chat gpt)\b/i.test(leadText);
}

function count(s: string, ch: string): number {
  return s.split(ch).length - 1;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

function similarity(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
