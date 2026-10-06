"use client";

import { ArrowLeft, Hand, Loader2, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { takeOverAction, toggleAutoChatAction } from "@/app/actions";
import { Avatar, Button } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch";
import type { ConversationFull } from "@/lib/types";
import { LeadTypeChip, StageBadge } from "./indicators";

export function ChatHeader({ conv, onOpenConfig, onNotice }: { conv: ConversationFull; onOpenConfig: () => void; onNotice: (n: { kind: "ok" | "warn" | "error"; text: string }) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const on = optimistic ?? conv.settings.auto_chat_enabled;
  const tookOver = conv.state.conversation_stage === "HUMAN_TAKEOVER";

  const toggle = (next: boolean) => {
    setOptimistic(next);
    start(async () => {
      const res = await toggleAutoChatAction(conv.id, next);
      setOptimistic(null);
      if (!res.ok) return onNotice({ kind: "error", text: res.error });
      if (res.data) onNotice({ kind: res.data.status === "SENT" ? "ok" : "warn", text: res.data.message });
      router.refresh();
    });
  };

  const takeOver = () => {
    setOptimistic(false);
    start(async () => {
      const res = await takeOverAction(conv.id);
      setOptimistic(null);
      if (!res.ok) return onNotice({ kind: "error", text: res.error });
      onNotice({ kind: "ok", text: "You've taken over. Auto chat is off and the AI won't send anything." });
      router.refresh();
    });
  };

  return (
    <header className="shrink-0 border-b border-zinc-200 bg-white px-3 py-2.5 sm:px-5">
      <div className="flex items-center gap-3">
        <Link href="/chats" aria-label="Back to chats" className="-ml-1 rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Avatar name={conv.lead_name} src={conv.lead_avatar_url} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold sm:text-base">{conv.lead_name}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
            <span className="truncate">@{conv.lead_username}</span>
            <LeadTypeChip type={conv.settings.lead_type} />
            <button type="button" onClick={onOpenConfig} className="rounded-full border border-zinc-200 px-2 py-0.5 hover:bg-zinc-50" title="Choose which services the AI may pitch in this chat">
              Services: {conv.settings.all_services ? "All" : `${conv.service_ids.length} selected`}
            </button>
            <span className="hidden sm:inline"><StageBadge stage={conv.state.conversation_stage} /></span>
          </div>
        </div>
        <Button variant="secondary" size="icon" onClick={onOpenConfig} aria-label="Configure AI for this lead" title="Configure">
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2">
        <div className="flex items-center gap-3">
          <Switch checked={on} onChange={toggle} disabled={pending} label="Auto chat" />
          <div className="leading-tight">
            <p className="text-xs font-semibold tracking-wide text-zinc-900">AUTO CHAT: {on ? "ON" : "OFF"}</p>
            <p className="text-[11px] text-zinc-500">{on ? "AI replies to this lead after a safety check" : tookOver ? "You're in control" : "AI can't send anything"}</p>
          </div>
        </div>
        <Button className="shrink-0 whitespace-nowrap" variant={on ? "danger" : "secondary"} size="sm" onClick={takeOver} disabled={pending || (tookOver && !on)}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hand className="h-3.5 w-3.5" />}
          {tookOver && !on ? "Taken over" : "Take over"}
        </Button>
      </div>
    </header>
  );
}
