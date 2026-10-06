import "server-only";
import { checkerResultSchema, type CheckerIssue, type CheckerResult } from "@/lib/schemas";
import type { DemoCheckContext } from "@/lib/services/llm/demo";
import type { LLMClient } from "@/lib/services/llm/types";
import { parseJsonObject } from "./json";
import { buildCheckerPrompt, type CheckerPromptContext } from "./prompts";

/**
 * Second AI. Fails CLOSED: any error, malformed JSON, low confidence or
 * non-empty issue list yields approved=false. Never throws.
 */
export async function runOutputChecker(
  llm: LLMClient,
  ctx: CheckerPromptContext,
  opts: { model: string; minConfidence: number; demo?: DemoCheckContext },
): Promise<CheckerResult> {
  const { system, user } = buildCheckerPrompt(ctx);
  try {
    const raw = await llm.complete({
      purpose: "checker",
      model: opts.model,
      system,
      user,
      temperature: 0,
      maxTokens: 300,
      timeoutMs: 20_000,
      demoContext: opts.demo,
    });
    const parsed = checkerResultSchema.safeParse(parseJsonObject(raw));
    if (!parsed.success) return reject("CHECKER_FAILURE", "Checker returned malformed JSON, treating as not approved.");

    const result = parsed.data;
    const issues = [...result.issues] as CheckerIssue[];
    let approved = result.approved;
    let reason = result.reason;

    if (approved && issues.length > 0) {
      approved = false;
      reason ||= "Checker listed issues while approving.";
    }
    if (approved && result.confidence < opts.minConfidence) {
      approved = false;
      issues.push("UNCERTAIN");
      reason = `Confidence ${result.confidence.toFixed(2)} is below the ${opts.minConfidence.toFixed(2)} threshold.`;
    }
    if (!approved && issues.length === 0) issues.push("UNCERTAIN");
    return { approved, confidence: result.confidence, issues, reason: approved ? "" : reason || "Rejected by checker." };
  } catch (err) {
    return reject("CHECKER_FAILURE", `Checker unavailable: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}

function reject(issue: CheckerIssue, reason: string): CheckerResult {
  return { approved: false, confidence: 0, issues: [issue], reason };
}
