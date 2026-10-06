import type { ConversationFull } from "@/lib/types";

/** Pure predicates shared by the dashboard stats and the chat list filters (client-safe). */
export const isInterested = (c: ConversationFull) =>
  c.state.conversation_stage === "INTERESTED" || c.state.interest_level === "HIGH";
export const isNotInterested = (c: ConversationFull) => c.state.conversation_stage === "NOT_INTERESTED";
export const isPitched = (c: ConversationFull) => c.state.pitch_status === "PITCHED";
export const isWaitingForReply = (c: ConversationFull) =>
  c.last_message_sender === "me" || c.last_message_sender === "ai";

export const CHAT_FILTERS = [
  { id: "all", label: "All" },
  { id: "auto_on", label: "Auto ON" },
  { id: "auto_off", label: "Auto OFF" },
  { id: "review", label: "Needs review" },
  { id: "pitched", label: "Pitched" },
  { id: "interested", label: "Interested" },
  { id: "not_interested", label: "Not interested" },
] as const;
export type ChatFilterId = (typeof CHAT_FILTERS)[number]["id"];

export function matchesFilter(c: ConversationFull, f: ChatFilterId): boolean {
  switch (f) {
    case "all":
      return true;
    case "auto_on":
      return c.settings.auto_chat_enabled;
    case "auto_off":
      return !c.settings.auto_chat_enabled;
    case "review":
      return c.state.needs_review;
    case "pitched":
      return isPitched(c);
    case "interested":
      return isInterested(c);
    case "not_interested":
      return isNotInterested(c);
  }
}

export function matchesSearch(c: ConversationFull, q: string): boolean {
  const needle = q.trim().toLowerCase().replace(/^@/, "");
  if (!needle) return true;
  return c.lead_name.toLowerCase().includes(needle) || c.lead_username.toLowerCase().includes(needle);
}

export function dashboardStats(all: ConversationFull[]) {
  return {
    total: all.length,
    autoActive: all.filter((c) => c.settings.auto_chat_enabled).length,
    waiting: all.filter(isWaitingForReply).length,
    needsReview: all.filter((c) => c.state.needs_review).length,
    pitched: all.filter(isPitched).length,
    interested: all.filter(isInterested).length,
  };
}
