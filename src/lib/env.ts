import "server-only";
import { z } from "zod";

const optionalString = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().optional(),
);

const schema = z.object({
  DEMO_MODE: optionalString,
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().url().optional(),
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  GROQ_API_KEY: optionalString,
  GROQ_MODEL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().default("llama-3.3-70b-versatile"),
  ),
  GROQ_CHECKER_MODEL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().default("llama-3.3-70b-versatile"),
  ),
  APP_ENCRYPTION_KEY: optionalString,
  CHECKER_MIN_CONFIDENCE: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().min(0).max(1).default(0.85),
  ),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated server-side environment. Throws a readable error if malformed. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

export function isSupabaseConfigured(): boolean {
  const env = getEnv();
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Demo mode = in-memory data, no auth, mock Instagram.
 * Enabled explicitly with DEMO_MODE=true, or implicitly when Supabase
 * is not configured.
 */
export function isDemoMode(): boolean {
  return getEnv().DEMO_MODE === "true" || !isSupabaseConfigured();
}
