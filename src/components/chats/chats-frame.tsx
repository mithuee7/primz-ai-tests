"use client";

import { MessageSquare } from "lucide-react";
import { usePathname } from "next/navigation";
import { EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { ConversationFull } from "@/lib/types";
import { ChatList } from "./chat-list";

/** Two-pane on desktop. On mobile, shows the list at /chats and the conversation at /chats/[id]. */
export function ChatsFrame({ conversations, children }: { conversations: ConversationFull[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const inChat = pathname !== "/chats";
  return (
    <div className="flex h-full">
      <div className={cn("h-full w-full shrink-0 border-r border-zinc-200 md:w-[360px] lg:w-[400px]", inChat ? "hidden md:block" : "block")}>
        <ChatList conversations={conversations} />
      </div>
      <div className={cn("h-full min-w-0 flex-1", inChat ? "block" : "hidden md:block")}>
        {inChat ? (
          children
        ) : (
          <div className="flex h-full items-center justify-center bg-zinc-50">
            <EmptyState icon={<MessageSquare className="h-5 w-5" />} title="Select a conversation" description="Pick a chat to read it, configure the AI, or take over." />
          </div>
        )}
      </div>
    </div>
  );
}
