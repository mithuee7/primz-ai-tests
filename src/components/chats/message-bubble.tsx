import { Bot } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import type { Message } from "@/lib/types";

export function MessageBubble({ message }: { message: Message }) {
  const isLead = message.sender_type === "lead";
  const isAi = message.sender_type === "ai";
  const meta = message.metadata as { delivery?: string; manually_approved?: boolean; edited?: boolean };
  const simulated = meta.delivery === "mock" || meta.delivery === "demo";

  return (
    <div className={cn("flex flex-col gap-1", isLead ? "items-start" : "items-end")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug sm:max-w-[70%]",
          isLead && "rounded-bl-md bg-zinc-100 text-zinc-900",
          message.sender_type === "me" && "rounded-br-md bg-zinc-900 text-white",
          isAi && "rounded-br-md border border-zinc-300 bg-white text-zinc-900",
        )}
      >
        {message.content}
      </div>
      <div className="flex items-center gap-1.5 px-1 text-[11px] text-zinc-400">
        {isAi ? (
          <span className="inline-flex items-center gap-1 font-medium text-zinc-600">
            <Bot className="h-3 w-3" /> AI
            {meta.manually_approved ? <span className="font-normal text-zinc-400">· {meta.edited ? "edited by you" : "approved by you"}</span> : null}
          </span>
        ) : message.sender_type === "me" ? (
          <span className="font-medium text-zinc-600">You</span>
        ) : null}
        <span>{formatTime(message.created_at)}</span>
        {simulated && !isLead ? <span title="Not delivered to Instagram">· simulated</span> : null}
      </div>
    </div>
  );
}
