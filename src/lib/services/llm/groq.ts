import "server-only";
import { LLMError, type LLMClient, type LLMRequest } from "./types";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

interface GroqResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  error?: { message?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Thin Groq chat-completions client. The API key never leaves this class and is never logged. */
export class GroqClient implements LLMClient {
  readonly provider = "groq" as const;

  constructor(private readonly apiKey: string) {}

  async complete(req: LLMRequest): Promise<string> {
    let lastError: LLMError | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.once(req);
      } catch (err) {
        if (!(err instanceof LLMError)) throw err;
        lastError = err;
        if (!err.retryable) break;
        await sleep(attempt === 0 ? 900 : 0);
      }
    }
    throw lastError ?? new LLMError("Groq request failed", "network", false);
  }

  private async once(req: LLMRequest): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: req.model,
          temperature: req.temperature,
          max_tokens: req.maxTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
        }),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new LLMError(`Groq request timed out after ${req.timeoutMs}ms`, "timeout", true);
      }
      throw new LLMError("Could not reach Groq", "network", true);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429) throw new LLMError("Groq rate limit hit", "rate_limit", true);
    if (res.status === 401 || res.status === 403) throw new LLMError("Groq rejected the API key", "http", false);
    if (res.status >= 500) throw new LLMError(`Groq server error (${res.status})`, "http", true);

    let body: GroqResponse;
    try {
      body = (await res.json()) as GroqResponse;
    } catch {
      throw new LLMError("Groq returned a non-JSON response", "http", false);
    }
    if (!res.ok) throw new LLMError(`Groq error ${res.status}: ${body.error?.message ?? "unknown"}`, "http", false);

    const choice = body.choices?.[0];
    const content = choice?.message?.content;
    if (!content || !content.trim()) throw new LLMError("Groq returned an empty completion", "empty", true);
    if (choice?.finish_reason === "length") throw new LLMError("Groq output was cut off (max tokens)", "http", false);
    return content;
  }
}
