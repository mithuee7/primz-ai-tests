import { SettingsForm } from "@/components/settings/settings-form";
import { PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { headers } from "next/headers";
import { getRepository } from "@/lib/repo";
import { getInstagramService } from "@/lib/services/instagram";
import { daysLeft } from "@/lib/services/instagram/token";
import { getLlmStatus } from "@/lib/services/llm/resolve";
import type { PublicAppSettings } from "@/lib/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const raw = await getRepository().getAppSettings(user.id);

  // Strip the ciphertext before anything crosses the server/client boundary.
  const { groq_key_encrypted, meta_token_encrypted, meta_app_secret_encrypted, ...rest } = raw;
  const settings: PublicAppSettings = {
    ...rest,
    groq_key_saved: Boolean(groq_key_encrypted),
    meta_token_saved: Boolean(meta_token_encrypted),
    meta_app_secret_saved: Boolean(meta_app_secret_encrypted),
  };

  const ig = await (await getInstagramService(user.id)).getStatus();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const callbackUrl = host ? `${proto}://${host}/api/webhooks/instagram` : "/api/webhooks/instagram";
  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <PageHeader title="Settings" />
      <SettingsForm
        settings={settings}
        llm={getLlmStatus(raw)}
        instagram={ig}
        callbackUrl={callbackUrl}
        daysLeft={daysLeft(raw.meta_token_expires_at)}
        demo={user.demo}
      />
    </div>
  );
}
