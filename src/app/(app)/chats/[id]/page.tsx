import { notFound } from "next/navigation";
import { ChatView } from "@/components/chats/chat-view";
import { requireUser } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { loadReviewItems } from "@/lib/review-data";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const repo = getRepository();

  const conv = await repo.getConversation(user.id, id);
  if (!conv) notFound();

  const [messages, services] = await Promise.all([repo.listRecentMessages(user.id, id, 200), repo.listServices(user.id)]);
  const review = conv.state.needs_review ? ((await loadReviewItems(user.id, [conv]))[0] ?? null) : null;

  return <ChatView conv={conv} messages={messages} services={services} review={review} demo={user.demo} />;
}
