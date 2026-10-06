"use client";

import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteServiceAction, saveServiceAction } from "@/app/actions";
import { Button, Card, EmptyState } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import type { Service } from "@/lib/types";

type Draft = Pick<Service, "name" | "description" | "ideal_customer" | "problems_solved" | "key_benefits" | "pitch_guidance" | "is_active"> & { id?: string };

const EMPTY: Draft = { name: "", description: "", ideal_customer: "", problems_solved: "", key_benefits: "", pitch_guidance: "", is_active: true };

const FIELDS: Array<{ key: keyof Draft; label: string; rows: number; hint?: string }> = [
  { key: "description", label: "Description", rows: 3, hint: "The AI uses this as its factual source. Don't claim anything untrue." },
  { key: "ideal_customer", label: "Ideal customer", rows: 2 },
  { key: "problems_solved", label: "Problems it solves", rows: 3 },
  { key: "key_benefits", label: "Key benefits", rows: 3 },
  { key: "pitch_guidance", label: "Pitch guidance (optional)", rows: 3, hint: "e.g. when to bring it up, what to avoid, preferred next step." },
];

export function ServicesManager({ services }: { services: Service[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "Failed");
      after?.();
      router.refresh();
    });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => { setError(null); setDraft({ ...EMPTY }); }}>
          <Plus className="h-4 w-4" /> Add service
        </Button>
      </div>

      {services.length === 0 ? (
        <EmptyState icon={<Sparkles className="h-5 w-5" />} title="No services yet" description="The AI can only pitch services listed here." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {services.map((s) => (
            <Card key={s.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => { setError(null); setDraft({ ...s }); }} className="min-w-0 text-left">
                  <h3 className="text-sm font-semibold hover:underline">{s.name}</h3>
                </button>
              </div>
              <p className="mt-2 text-sm text-zinc-600">{s.description}</p>
              <dl className="mt-3 space-y-1.5 text-xs text-zinc-500">
                <div><dt className="inline font-medium text-zinc-700">Ideal customer: </dt><dd className="inline">{s.ideal_customer || "—"}</dd></div>
                <div><dt className="inline font-medium text-zinc-700">Solves: </dt><dd className="inline">{s.problems_solved || "—"}</dd></div>
              </dl>
            </Card>
          ))}
        </div>
      )}
      {error && !draft ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <Sheet open={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? "Edit service" : "New service"}>
        {draft ? (
          <form
            className="space-y-4 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveServiceAction(draft), () => setDraft(null));
            }}
          >
            <div>
              <label htmlFor="svc-name" className="label">Name</label>
              <input id="svc-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={120} required className="field" />
            </div>
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label htmlFor={`svc-${f.key}`} className="label">{f.label}</label>
                <textarea
                  id={`svc-${f.key}`}
                  value={String(draft[f.key] ?? "")}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  rows={f.rows}
                  maxLength={2000}
                  className="field resize-none"
                />
                {f.hint ? <p className="mt-1 text-xs text-zinc-500">{f.hint}</p> : null}
              </div>
            ))}
            <p className="text-xs text-zinc-500">Turn this service on or off for each chat in that chat’s settings. Nothing here is global.</p>
            {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button type="submit" disabled={pending || !draft.name.trim()}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
              </Button>
              {draft.id ? (
                <Button
                  variant="dangerOutline"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Delete "${draft.name}"? Chats that selected it will lose it.`)) run(() => deleteServiceAction(draft.id as string), () => setDraft(null));
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}
      </Sheet>
    </>
  );
}
