import "server-only";
import { isDemoMode } from "@/lib/env";
import { MetaInstagramService, UnconfiguredInstagramService } from "./meta";
import { loadMetaConfig } from "./meta-config";
import { MockInstagramService } from "./mock";
import type { InstagramService } from "./types";

const g = globalThis as unknown as { __primzIgMock?: InstagramService };

/**
 * The single place that decides which Instagram implementation is active for an owner:
 * demo mode -> mock; connected in Settings -> Meta; otherwise a stand-in that can't send.
 */
export async function getInstagramService(ownerId: string): Promise<InstagramService> {
  if (isDemoMode()) return (g.__primzIgMock ??= new MockInstagramService());
  const cfg = await loadMetaConfig(ownerId);
  return cfg ? new MetaInstagramService(cfg) : new UnconfiguredInstagramService();
}

export * from "./types";
