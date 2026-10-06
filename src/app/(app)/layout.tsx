import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { after } from "next/server";
import { recoverUnansweredMessages } from "@/lib/services/ai/claims";
import { ensureFreshInstagramToken } from "@/lib/services/instagram/token";
import { getInstagramService } from "@/lib/services/instagram";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user.demo) {
    // Housekeeping after the page is sent: keep the Instagram token fresh and pick up any
    // message whose webhook never triggered a reply. Both are safe to repeat.
    after(async () => {
      await ensureFreshInstagramToken(user.id);
      await recoverUnansweredMessages(user.id);
    });
  }
  const [conversations, instagram] = await Promise.all([
    getRepository().listConversations(user.id),
    getInstagramService(user.id).then((ig) => ig.getStatus()),
  ]);
  const reviewCount = conversations.filter((c) => c.state.needs_review).length;

  return (
    <AppShell
      user={{ name: user.name, email: user.email, demo: user.demo }}
      instagram={{ connected: instagram.connected, label: instagram.label, detail: instagram.detail }}
      reviewCount={reviewCount}
    >
      {children}
    </AppShell>
  );
}
