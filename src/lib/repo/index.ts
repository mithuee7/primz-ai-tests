import "server-only";
import { isDemoMode } from "@/lib/env";
import { MemoryRepository } from "./memory";
import { SupabaseRepository } from "./supabase";
import type { Repository } from "./types";

const g = globalThis as unknown as { __primzRepo?: Repository };

/** Demo mode -> in-memory store. Otherwise Supabase. The UI never knows which. */
export function getRepository(): Repository {
  if (!g.__primzRepo) {
    g.__primzRepo = isDemoMode() ? new MemoryRepository() : new SupabaseRepository();
  }
  return g.__primzRepo;
}

export type { Repository } from "./types";
