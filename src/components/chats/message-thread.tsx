"use client";

import { MessageSquare } from "lucide-react";
import { useEffect, useRef } from "react";
import { EmptyState } from "@/components/ui/primitives";
import type { Message } from "@/lib/types";
import { MessageBubble } from "./message-bubble";

export function MessageThread({ messages, children }: { messages: Message[]; children?: React.ReactNode }) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-white px-3 py-4 sm:px-6">
      {messages.length === 0 ? (
        <EmptyState icon={<MessageSquare className="h-5 w-5" />} title="No messages yet" />
      ) : (
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {children}
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
