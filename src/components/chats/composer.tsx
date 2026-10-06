"use client";

import { Hand, Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { sendManualMessageAction } from "@/app/actions";
import { Button } from "@/components/ui/primitives";

export function Composer({ conversationId, autoChatOn }: { conversationId: string; autoChatOn: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  if (autoChatOn) {
    return (
      <div className="safe-bottom shrink-0 border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-center text-sm text-zinc-500">
        <Hand className="mr-1.5 inline h-4 w-4 align-text-bottom" />
        Auto chat is on. Use <strong className="font-semibold text-zinc-700">Take over</strong> to reply yourself.
      </div>
    );
  }

  const send = () => {
    const value = text.trim();
    if (!value || pending) return;
    start(async () => {
      setError(null);
      const res = await sendManualMessageAction({ conversation_id: conversationId, text: value });
      if (!res.ok) return setError(res.error);
      setText("");
      router.refresh();
      ref.current?.focus();
    });
  };

  return (
    <div className="safe-bottom shrink-0 border-t border-zinc-200 bg-white px-3 py-3 sm:px-6">
      {error ? <p role="alert" className="mx-auto mb-2 max-w-3xl rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">{error}</p> : null}
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 768px)").matches) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder="Write a reply as yourself…"
          aria-label="Message"
          className="field max-h-32 min-h-[40px] resize-none rounded-2xl"
        />
        <Button onClick={send} disabled={!text.trim() || pending} size="icon" className="h-10 w-10 rounded-full" aria-label="Send">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
