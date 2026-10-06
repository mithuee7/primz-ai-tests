import "server-only";
import { getRepository } from "@/lib/repo";
import type { AiGeneration, AiReview, ConversationFull } from "@/lib/types";

export interface ReviewItemData {
  conversation: ConversationFull;
  generation: AiGeneration | null;
  reviews: AiReview[];
  lastLeadMessage: string | null;
}

/** Conversations flagged needs_review, each with its pending draft and the reasons it was held back. */
export async function loadReviewItems(ownerId: string, conversations?: ConversationFull[]): Promise<ReviewItemData[]> {
  const repo = getRepository();
  const all = conversations ?? (await repo.listConversations(ownerId));
  const flagged = all.filter((c) => c.state.needs_review);
  return Promise.all(
    flagged.map(async (conversation) => {
      const genId = conversation.state.pending_generation_id;
      const generation = genId ? await repo.getGeneration(ownerId, genId) : null;
      const reviews = generation ? await repo.listReviews(ownerId, generation.id) : [];
      const recent = await repo.listRecentMessages(ownerId, conversation.id, 6);
      const lastLead = [...recent].reverse().find((m) => m.sender_type === "lead");
      return { conversation, generation, reviews, lastLeadMessage: lastLead?.content ?? null };
    }),
  );
}
