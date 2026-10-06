"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveConfigAction } from "@/app/actions";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { LEAD_TYPES, LEAD_TYPE_LABELS, TONES, TONE_LABELS, type ConversationFull, type LeadType, type Service, type Tone } from "@/lib/types";

export function ConfigPanel({ conv, services, onSaved }: { conv: ConversationFull; services: Service[]; onSaved?: () => void }) {
  const router = useRouter();
  const [leadType, setLeadType] = useState<LeadType>(conv.settings.lead_type);
  const [tone, setTone] = useState<Tone>(conv.settings.tone);
  const [customTone, setCustomTone] = useState(conv.settings.custom_tone ?? "");
  const [extra, setExtra] = useState(conv.settings.extra_instructions);
  const [allServices, setAllServices] = useState(conv.settings.all_services);
  const [selected, setSelected] = useState<Set<string>>(new Set(conv.service_ids));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const active = services;
  const noneSelected = !allServices && selected.size === 0;

  const toggleService = (id: string) => {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const res = await saveConfigAction(conv.id, {
        lead_type: leadType,
        tone,
        custom_tone: tone === "custom" ? customTone.trim() || null : null,
        extra_instructions: extra,
        all_services: allServices,
        service_ids: [...selected],
      });
      if (!res.ok) return setError(res.error);
      setSaved(true);
      router.refresh();
      onSaved?.();
    });

  return (
    <div className="space-y-6 p-4">
      <section>
        <label htmlFor="lead-type" className="label">Lead type</label>
        <select id="lead-type" value={leadType} onChange={(e) => { setLeadType(e.target.value as LeadType); setSaved(false); }} className="field">
          {LEAD_TYPES.map((t) => (
            <option key={t} value={t}>{LEAD_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </section>

      <section>
        <p className="label">Services the AI may pitch</p>
        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm">
          <input type="checkbox" checked={allServices} onChange={(e) => { setAllServices(e.target.checked); setSaved(false); }} className="h-4 w-4 accent-zinc-900" />
          <span className="font-medium">All services</span>
          <span className="text-xs text-zinc-500">(AI picks the most relevant)</span>
        </label>
        <div className={cn("mt-2 space-y-1.5", allServices && "pointer-events-none opacity-40")} aria-disabled={allServices}>
          {active.length === 0 ? (
            <p className="text-sm text-zinc-500">No services yet. Add some on the Services page.</p>
          ) : (
            active.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleService(s.id)} disabled={allServices} className="mt-0.5 h-4 w-4 accent-zinc-900" />
                <span>
                  <span className="block font-medium">{s.name}</span>
                  <span className="block text-xs text-zinc-500">{s.description}</span>
                </span>
              </label>
            ))
          )}
        </div>
        {noneSelected ? <p className="mt-2 text-xs text-amber-700">No services selected: the AI will keep chatting but will never pitch.</p> : null}
      </section>

      <section>
        <p className="label">Tone</p>
        <div className="flex flex-wrap gap-1.5">
          {TONES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tone === t}
              onClick={() => { setTone(t); setSaved(false); }}
              className={cn("rounded-full border px-3 py-1.5 text-sm", tone === t ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 hover:bg-zinc-50")}
            >
              {TONE_LABELS[t]}
            </button>
          ))}
        </div>
        {tone === "custom" ? (
          <textarea value={customTone} onChange={(e) => { setCustomTone(e.target.value); setSaved(false); }} rows={2} maxLength={500} placeholder="e.g. Dry humour, very short sentences" aria-label="Custom tone" className="field mt-2 resize-none" />
        ) : null}
        <p className="mt-1.5 text-xs text-zinc-500">Tone changes wording only. The human-conversation rules always apply.</p>
      </section>

      <section>
        <label htmlFor="extra" className="label">Additional instructions for this lead</label>
        <textarea
          id="extra"
          value={extra}
          onChange={(e) => { setExtra(e.target.value); setSaved(false); }}
          rows={4}
          maxLength={2000}
          placeholder={"Focus on their missed leads.\nDon't mention websites.\nIf they ask for pricing, move them to a call."}
          className="field resize-none"
        />
        <p className="mt-1 text-xs text-zinc-500">Applies to this conversation only.</p>
      </section>

      {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save changes
        </Button>
        {saved ? <span className="text-sm text-emerald-700">Saved</span> : null}
      </div>
    </div>
  );
}
