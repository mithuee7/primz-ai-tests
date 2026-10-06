export interface LLMRequest {
  purpose: "conversation" | "checker";
  model: string;
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  /** Structured context used ONLY by the demo LLM. Real providers ignore it. */
  demoContext?: unknown;
}

export interface LLMClient {
  readonly provider: "groq" | "demo";
  /** Returns the raw model text (expected to be a JSON object string). */
  complete(req: LLMRequest): Promise<string>;
}

export type LLMErrorKind = "timeout" | "rate_limit" | "http" | "network" | "not_configured" | "empty";

export class LLMError extends Error {
  constructor(
    message: string,
    readonly kind: LLMErrorKind,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
