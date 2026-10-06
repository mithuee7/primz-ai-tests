import { AutoRefresh } from "@/components/shell/auto-refresh";
import { ChatsFrame } from "@/components/chats/chats-frame";
import { requireUser } from "@/lib/auth";
import { getRepository } from "@/lib/repo";

export default async function ChatsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const conversations = await getRepository().listConversations(user.id);
  return (
    <>
      <AutoRefresh intervalMs={6000} />
      <ChatsFrame conversations={conversations}>{children}</ChatsFrame>
    </>
  );
}
