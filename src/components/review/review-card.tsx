"use client";

import { AlertTriangle, Check, Hand, Loader2, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveReviewAction, discardReviewAction, dismissFlagAction, takeOverAction } from "@/app/actions";
import { Avatar, Badge, Button, Card } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/utils";
import type { ReviewItemData } from "@/lib/review-data";

export function ReviewCard({ item, showLead = true }: { item: ReviewItemData; showLead?: boolean }) {
  const router = useRouter();
  const { conversation: conv, generation, reviews, lastLeadMessage } = item;
  const failed = Boolean(generation?.error);
  const initialDraft = failed ? "" : (generation?.generated_text ?? "");
  const [draft, setDraft] = useState(initialDraft);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong");
      else router.refresh();
    });

  const edited = generation ? draft.trim() !== (generation.generated_text ?? "") : false;
  const canSend = Boolean(generation) && draft.trim().length > 0 && !pending;
  const blocking = reviews.filter((r) => !r.approved && r.reviewer !== "manual");

  return (
    <Card className="overflow-hidden border-amber-200">
      {showLead ? (
        <div className="flex items-center gap-3 border-b border-zinc-100 bg-amber-50/60 px-4 py-3">
          <Avatar name={conv.lead_name} src={conv.lead_avatar_url} size="sm" />
          <div className="min-w-0 flex-1">
            <Link href={`/chats/${conv.id}`} className="truncate text-sm font-semibold hover:underline">
              {conv.lead_name}
            </Link>
            <p className="truncate text-xs text-zinc-500">@{conv.lead_username}</p>
          </div>
          <span className="text-xs text-zinc-400">{generation ? timeAgo(generation.created_at) : timeAgo(conv.updated_at)}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50/60 px-4 py-2.5 text-sm font-medium text-amber-900">
          <AlertTriangle className="h-4 w-4" /> This chat needs your review. Nothing was sent.
        </div>
      )}

      <div className="space-y-4 p-4">
        {lastLeadMessage ? (
          <div>
            <p className="label">Lead said</p>
            <p className="rounded-xl rounded-bl-md bg-zinc-100 px-3 py-2 text-sm">{lastLeadMessage}</p>
          </div>
        ) : null}

        <div>
          <p className="label">Why it was held back</p>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            {blocking.length > 0 ? (
              <ul className="space-y-1.5">
                {blocking.map((r) => (
                  <li key={r.id}>
                    <div className="mb-0.5 flex flex-wrap gap-1">
                      {r.issues.map((i) => (
                        <Badge key={i} tone="amber">{i}</Badge>
                      ))}
                      <Badge>{r.reviewer === "rules" ? "Rule check" : "AI checker"}{r.reviewer === "ai" ? ` · ${Math.round(r.confidence * 100)}%` : ""}</Badge>
                    </div>
                    {r.reason}
                  </li>
                ))}
              </ul>
            ) : (
              conv.state.review_reason ?? "Flagged for review."
            )}
          </div>
        </div>

        {generation ? (
          <div>
            <p className="label">{failed ? "No usable draft, write your own" : "Generated reply (not sent)"}</p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              readOnly={!editing && !failed}
              rows={Math.min(8, Math.max(3, Math.ceil((draft.length || 60) / 60)))}
              placeholder={failed ? "Type the reply you want to send…" : undefined}
              className={`field resize-none ${!editing && !failed ? "bg-zinc-50" : ""}`}
              aria-label="Draft reply"
              maxLength={1000}
            />
            {failed && generation.generated_text ? (
              <details className="mt-2 text-xs text-zinc-500">
                <summary className="cursor-pointer">Raw model output</summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-100 p-2">{generation.generated_text}</pre>
              </details>
            ) : null}
            {edited && !failed ? <p className="mt-1 text-xs text-zinc-500">Edited. Exactly this text will be sent.</p> : null}
          </div>
        ) : null}

        {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          {generation ? (
            <>
              <Button disabled={!canSend} onClick={() => run(() => approveReviewAction({ generation_id: generation.id, text: draft }))}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {edited || failed ? "Send this reply" : "Approve & send"}
              </Button>
              {!failed ? (
                <Button variant="secondary" disabled={pending} onClick={() => setEditing((v) => !v)}>
                  <Pencil className="h-4 w-4" /> {editing ? "Done" : "Edit"}
                </Button>
              ) : null}
              <Button variant="dangerOutline" disabled={pending} onClick={() => run(() => discardReviewAction(generation.id))}>
                <Trash2 className="h-4 w-4" /> Discard
              </Button>
            </>
          ) : (
            <Button variant="secondary" disabled={pending} onClick={() => run(() => dismissFlagAction(conv.id))}>
              <Check className="h-4 w-4" /> Dismiss flag
            </Button>
          )}
          <Button variant="secondary" disabled={pending} onClick={() => run(() => takeOverAction(conv.id))}>
            <Hand className="h-4 w-4" /> Take over
          </Button>
        </div>
      </div>
    </Card>
  );
}
