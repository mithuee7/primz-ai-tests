import "server-only";
import { generationOutputSchema, type GenerationOutput } from "@/lib/schemas";
import type { LLMClient } from "@/lib/services/llm/types";
import type { DemoGenContext } from "@/lib/services/llm/demo";
import { parseJsonObject } from "./json";
import { buildConversationPrompt, CONVERSATION_PROMPT_VERSION, type PromptContext } from "./prompts";

export class MalformedOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = "MalformedOutputError";
  }
}

export interface EngineResult {
  output: GenerationOutput;
  model: string;
  promptVersion: string;
}

/**
 * Main conversation AI. Generates the next reply + state update.
 * Retries once on malformed JSON/schema failures; after that throws MalformedOutputError.
 * Transport failures (LLMError) propagate to the pipeline, which fails closed.
 */
export async function generateReply(
  llm: LLMClient,
  ctx: PromptContext,
  opts: { model: string; demo?: DemoGenContext },
): Promise<EngineResult> {
  const { system, user } = buildConversationPrompt(ctx);
  let lastRaw = "";
  let lastProblem = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await llm.complete({
      purpose: "conversation",
      model: opts.model,
      system,
      user,
      temperature: attempt === 0 ? 0.8 : 0.4,
      maxTokens: 600,
      timeoutMs: 25_000,
      demoContext: opts.demo,
    });
    lastRaw = raw;
    try {
      const parsed = generationOutputSchema.safeParse(parseJsonObject(raw));
      if (parsed.success) {
        return { output: parsed.data, model: opts.model, promptVersion: CONVERSATION_PROMPT_VERSION };
      }
      lastProblem = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (err) {
      lastProblem = err instanceof Error ? err.message : "parse error";
    }
  }
  throw new MalformedOutputError(`Conversation AI returned malformed output (${lastProblem})`, lastRaw);
}
