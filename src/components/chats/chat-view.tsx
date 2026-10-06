"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useState } from "react";
import { ReviewCard } from "@/components/review/review-card";
import { Sheet } from "@/components/ui/sheet";
import type { ReviewItemData } from "@/lib/review-data";
import { cn } from "@/lib/utils";
import type { ConversationFull, Message, Service } from "@/lib/types";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { ConfigPanel } from "./config-panel";
import { DemoTools } from "./demo-tools";
import { MemoryPanel } from "./memory-panel";
import { MessageThread } from "./message-thread";

type Notice = { kind: "ok" | "warn" | "error"; text: string };
type Tab = "config" | "memory" | "demo";

export function ChatView({
  conv,
  messages,
  services,
  review,
  demo,
}: {
  conv: ConversationFull;
  messages: Message[];
  services: Service[];
  review: ReviewItemData | null;
  demo: boolean;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("config");
  const [notice, setNotice] = useState<Notice | null>(null);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "config", label: "Configure" },
    { id: "memory", label: "AI memory" },
    ...(demo ? [{ id: "demo" as const, label: "Demo tools" }] : []),
  ];

  return (
    <div className="flex h-full flex-col">
      <ChatHeader conv={conv} onOpenConfig={() => { setTab("config"); setPanelOpen(true); }} onNotice={setNotice} />

      {notice ? (
        <div
          role="status"
          className={cn(
            "flex shrink-0 items-start gap-2 px-4 py-2 text-sm",
            notice.kind === "ok" && "bg-emerald-50 text-emerald-800",
            notice.kind === "warn" && "bg-amber-50 text-amber-900",
            notice.kind === "error" && "bg-red-50 text-red-800",
          )}
        >
          {notice.kind === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : notice.kind === "warn" ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{notice.text}</span>
          <button aria-label="Dismiss" onClick={() => setNotice(null)}><X className="h-4 w-4" /></button>
        </div>
      ) : null}

      <MessageThread messages={messages}>
        {review ? (
          <div className="mt-2">
            <ReviewCard item={review} showLead={false} />
          </div>
        ) : null}
      </MessageThread>

      <Composer conversationId={conv.id} autoChatOn={conv.settings.auto_chat_enabled} />

      <Sheet open={panelOpen} onClose={() => setPanelOpen(false)} title="This conversation">
        <div className="sticky top-0 z-10 flex gap-1 border-b border-zinc-100 bg-white px-3 py-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={cn("rounded-lg px-3 py-1.5 text-sm", tab === t.id ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100")}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "config" ? <ConfigPanel conv={conv} services={services} onSaved={() => setNotice({ kind: "ok", text: "Configuration saved for this conversation." })} /> : null}
        {tab === "memory" ? <MemoryPanel conv={conv} services={services} /> : null}
        {tab === "demo" ? <DemoTools conversationId={conv.id} onNotice={(n) => { setNotice(n); }} /> : null}
      </Sheet>
    </div>
  );
}
