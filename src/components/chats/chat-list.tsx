"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar, EmptyState } from "@/components/ui/primitives";
import { CHAT_FILTERS, matchesFilter, matchesSearch, type ChatFilterId } from "@/lib/conversation-filters";
import { cn, timeAgo } from "@/lib/utils";
import type { ConversationFull } from "@/lib/types";
import { AutoBadge, InterestIndicator, LeadTypeChip, PitchBadge, ReviewWarning } from "./indicators";

export function ChatList({ conversations }: { conversations: ConversationFull[] }) {
  const pathname = usePathname();
  const [filter, setFilter] = useState<ChatFilterId>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () =>
      conversations
        .filter((c) => matchesFilter(c, filter) && matchesSearch(c, query))
        .sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at)),
    [conversations, filter, query],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="shrink-0 space-y-3 border-b border-zinc-200 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or @username"
            aria-label="Search chats"
            className="field pl-9"
          />
        </div>
        <div className="scroll-thin -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1">
          {CHAT_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.id ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50",
              )}
            >
              {f.label}
              <span className={cn("ml-1.5", filter === f.id ? "text-zinc-300" : "text-zinc-400")}>
                {conversations.filter((c) => matchesFilter(c, f.id)).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title={conversations.length === 0 ? "No conversations yet" : "No chats match"}
            description={conversations.length === 0 ? "When a lead replies to one of your DMs, it appears here." : "Try a different filter or search."}
          />
        ) : (
          <ul>
            {visible.map((c) => {
              const active = pathname === `/chats/${c.id}`;
              return (
                <li key={c.id}>
                  <Link
                    href={`/chats/${c.id}`}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex gap-3 border-b border-zinc-100 px-3 py-3 transition-colors", active ? "bg-zinc-100" : "hover:bg-zinc-50")}
                  >
                    <Avatar name={c.lead_name} src={c.lead_avatar_url} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{c.lead_name}</span>
                        <span className="shrink-0 text-xs text-zinc-400">{timeAgo(c.last_message_at)}</span>
                      </div>
                      <p className="truncate text-xs text-zinc-400">@{c.lead_username}</p>
                      <p className={cn("mt-0.5 truncate text-sm", c.last_message_sender === "lead" ? "font-medium text-zinc-900" : "text-zinc-500")}>
                        {c.last_message_sender === "lead" ? "" : c.last_message_sender === "ai" ? "AI: " : "You: "}
                        {c.last_message_preview}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <LeadTypeChip type={c.settings.lead_type} />
                        <AutoBadge on={c.settings.auto_chat_enabled} />
                        <PitchBadge pitched={c.state.pitch_status === "PITCHED"} />
                        <ReviewWarning conv={c} />
                        <span className="ml-auto">
                          <InterestIndicator level={c.state.interest_level} />
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
