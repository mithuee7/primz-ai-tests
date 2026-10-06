"use client";

import { CheckCircle2, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clearGroqKeyAction, connectInstagramAction, disconnectInstagramAction, refreshInstagramTokenAction, saveGroqKeyAction, saveSettingsAction } from "@/app/actions";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { TONES, TONE_LABELS, type PublicAppSettings, type Tone } from "@/lib/types";

export interface SettingsViewProps {
  settings: PublicAppSettings;
  llm: { provider: "groq" | "demo" | "none"; source: "settings" | "env" | "none" };
  instagram: { kind: "mock" | "meta"; connected: boolean; label: string; detail: string };
  callbackUrl: string;
  daysLeft: number | null;
  demo: boolean;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description ? <p className="mt-0.5 text-sm text-zinc-500">{description}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}

export function SettingsForm({ settings, llm, instagram, callbackUrl, daysLeft, demo }: SettingsViewProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [tone, setTone] = useState<Tone>(settings.default_tone);
  const [customTone, setCustomTone] = useState(settings.default_custom_tone ?? "");
  const [behavior, setBehavior] = useState(settings.default_ai_behavior);
  const [global, setGlobal] = useState(settings.global_instructions);
  const [model, setModel] = useState(settings.groq_model);
  const [checkerModel, setCheckerModel] = useState(settings.checker_model);
  const [minConf, setMinConf] = useState(settings.checker_min_confidence);
  const [key, setKey] = useState("");
  const [igToken, setIgToken] = useState("");
  const [igSecret, setIgSecret] = useState("");

  const report = (res: { ok: boolean; error?: string }, okText: string) => {
    setMsg(res.ok ? { ok: true, text: okText } : { ok: false, text: res.error ?? "Failed" });
    if (res.ok) router.refresh();
  };

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Section title="Groq" description="Used for both the conversation AI and the output checker.">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">Status:</span>
          {llm.provider === "groq" ? (
            <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> Key set ({llm.source === "settings" ? `saved in app${settings.groq_key_last4 ? `, ends ${settings.groq_key_last4}` : ""}` : "server env"})</Badge>
          ) : llm.provider === "demo" ? (
            <Badge tone="amber">No key. Using the scripted demo AI (not a real model)</Badge>
          ) : (
            <Badge tone="red">Not configured. Auto replies will be held for review</Badge>
          )}
        </div>
        <div>
          <label htmlFor="groq-key" className="label">API key</label>
          <div className="flex gap-2">
            <input id="groq-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={settings.groq_key_saved ? "Saved. Paste a new key to replace it" : "gsk_…"} className="field" />
            <Button disabled={pending || key.trim().length < 20} onClick={() => start(async () => { const r = await saveGroqKeyAction(key); if (r.ok) setKey(""); report(r, "Key saved (encrypted). It is never shown again."); })}>
              <KeyRound className="h-4 w-4" /> Save
            </Button>
            {settings.groq_key_saved ? (
              <Button variant="dangerOutline" size="icon" aria-label="Remove saved key" disabled={pending} onClick={() => start(async () => report(await clearGroqKeyAction(), "Saved key removed."))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">Stored encrypted (AES-256-GCM) on the server. Never sent back to the browser.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="model" className="label">Conversation model</label>
            <input id="model" value={model} onChange={(e) => setModel(e.target.value)} className="field" />
          </div>
          <div>
            <label htmlFor="cmodel" className="label">Checker model</label>
            <input id="cmodel" value={checkerModel} onChange={(e) => setCheckerModel(e.target.value)} className="field" />
          </div>
        </div>
        <div>
          <label htmlFor="conf" className="label">Checker minimum confidence: {minConf.toFixed(2)}</label>
          <input id="conf" type="range" min={0.5} max={1} step={0.01} value={minConf} onChange={(e) => setMinConf(Number(e.target.value))} className="w-full accent-zinc-900" />
          <p className="mt-1 text-xs text-zinc-500">Approvals below this confidence are treated as rejections. Higher is safer.</p>
        </div>
      </Section>

      <Section title="Instagram connection" description="Paste your Instagram access token and app secret. They are stored encrypted and never shown again.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={instagram.connected ? "green" : "amber"}>{instagram.label}</Badge>
          <span className="text-sm text-zinc-500">{instagram.detail}</span>
        </div>
        {instagram.kind === "mock" ? (
          <p className="text-sm text-zinc-500">Demo mode uses a simulated Instagram. Nothing is sent to real accounts.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ig-token" className="label">Access token</label>
                <input id="ig-token" type="password" autoComplete="off" value={igToken} onChange={(e) => setIgToken(e.target.value)} placeholder={settings.meta_token_saved ? "Saved. Paste a new one to replace it" : "IG…"} className="field" />
              </div>
              <div>
                <label htmlFor="ig-secret" className="label">Instagram app secret</label>
                <input id="ig-secret" type="password" autoComplete="off" value={igSecret} onChange={(e) => setIgSecret(e.target.value)} placeholder={settings.meta_app_secret_saved ? "Saved. Paste a new one to replace it" : "App secret"} className="field" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending || igToken.trim().length < 20 || igSecret.trim().length < 16} onClick={() => start(async () => {
                const r = await connectInstagramAction({ access_token: igToken, app_secret: igSecret });
                if (r.ok) { setIgToken(""); setIgSecret(""); }
                report(r.ok ? { ok: true } : r, r.ok ? `Connected${r.data?.username ? ` as @${r.data.username}` : ""}.${r.data?.warnings.length ? " " + r.data.warnings.join(" ") : ""}` : "");
              })}>
                <KeyRound className="h-4 w-4" /> Connect &amp; verify
              </Button>
              {settings.meta_token_saved ? (
                <>
                  <Button variant="secondary" disabled={pending} onClick={() => start(async () => report(await refreshInstagramTokenAction(), "Token refreshed. It is valid for another ~60 days."))}>
                    <RefreshCw className="h-4 w-4" /> Refresh token now
                  </Button>
                  <Button variant="dangerOutline" disabled={pending} onClick={() => { if (window.confirm("Disconnect Instagram? Auto replies will stop.")) start(async () => report(await disconnectInstagramAction(), "Disconnected.")); }}>
                    Disconnect
                  </Button>
                </>
              ) : null}
            </div>
            {settings.meta_token_saved && daysLeft !== null ? (
              <p className="text-xs text-zinc-500">
                Token expires in {Math.max(daysLeft, 0)} days{settings.meta_ig_username ? ` (@${settings.meta_ig_username})` : ""}. It is refreshed automatically when it gets close, as long as the app is being used.
              </p>
            ) : null}
            <div className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600">
              <p className="font-medium text-zinc-800">Webhook settings to paste into Meta (Instagram → Webhooks)</p>
              <p className="mt-2">Callback URL</p>
              <code className="block break-all rounded bg-white px-2 py-1">{callbackUrl}</code>
              <p className="mt-2">Verify token</p>
              <code className="block break-all rounded bg-white px-2 py-1">{settings.meta_verify_token ?? "Appears after you connect"}</code>
              <p className="mt-2">Subscribe to the <b>messages</b> field.</p>
            </div>
          </>
        )}
      </Section>

      <Section title="Defaults for new conversations">
        <div>
          <p className="label">Default tone</p>
          <div className="flex flex-wrap gap-1.5">
            {TONES.map((t) => (
              <button key={t} type="button" aria-pressed={tone === t} onClick={() => setTone(t)} className={`rounded-full border px-3 py-1.5 text-sm ${tone === t ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 hover:bg-zinc-50"}`}>
                {TONE_LABELS[t]}
              </button>
            ))}
          </div>
          {tone === "custom" ? <textarea value={customTone} onChange={(e) => setCustomTone(e.target.value)} rows={2} maxLength={500} aria-label="Custom tone" className="field mt-2 resize-none" /> : null}
        </div>
        <div>
          <label htmlFor="behavior" className="label">Default AI behavior</label>
          <textarea id="behavior" value={behavior} onChange={(e) => setBehavior(e.target.value)} rows={4} maxLength={3000} className="field resize-none" />
        </div>
        <div>
          <label htmlFor="global" className="label">Global business instructions</label>
          <textarea id="global" value={global} onChange={(e) => setGlobal(e.target.value)} rows={4} maxLength={4000} className="field resize-none" />
          <p className="mt-1 text-xs text-zinc-500">Applied to every conversation. Per-lead instructions are added on top.</p>
        </div>
      </Section>

      {msg ? <p role="status" className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p> : null}
      <div>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () =>
              report(
                await saveSettingsAction({
                  default_tone: tone,
                  default_custom_tone: tone === "custom" ? customTone.trim() || null : null,
                  default_ai_behavior: behavior,
                  global_instructions: global,
                  groq_model: model,
                  checker_model: checkerModel,
                  checker_min_confidence: minConf,
                }),
                "Settings saved.",
              ),
            )
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save settings
        </Button>
        {demo ? <span className="ml-3 text-xs text-zinc-500">Demo mode: settings reset when the server restarts.</span> : null}
      </div>
    </div>
  );
}
