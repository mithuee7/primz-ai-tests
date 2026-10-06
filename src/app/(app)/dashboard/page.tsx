import { AlertTriangle, Bot, Clock, MessageSquare, Sparkles, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { AutoBadge, InterestIndicator, StageBadge } from "@/components/chats/indicators";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { Avatar, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { dashboardStats } from "@/lib/conversation-filters";
import { requireUser } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const conversations = await getRepository().listConversations(user.id);
  const stats = dashboardStats(conversations);

  const cards = [
    { label: "Total conversations", value: stats.total, icon: MessageSquare, href: "/chats" },
    { label: "Auto chat active", value: stats.autoActive, icon: Bot, href: "/chats" },
    { label: "Waiting for reply", value: stats.waiting, icon: Clock, href: "/chats" },
    { label: "Needs review", value: stats.needsReview, icon: AlertTriangle, href: "/review", highlight: stats.needsReview > 0 },
    { label: "Pitched", value: stats.pitched, icon: Sparkles, href: "/chats" },
    { label: "Interested", value: stats.interested, icon: ThumbsUp, href: "/chats" },
  ];
  const recent = conversations.slice(0, 6);

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <AutoRefresh intervalMs={10000} />
      <PageHeader title="Dashboard" description="Where your conversations stand right now." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href}>
            <Card className={`p-4 transition-colors hover:border-zinc-400 ${c.highlight ? "border-amber-300 bg-amber-50/50" : ""}`}>
              <div className="flex items-center justify-between text-zinc-500">
                <span className="text-xs font-medium">{c.label}</span>
                <c.icon className="h-4 w-4" />
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{c.value}</p>
            </Card>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-zinc-900">Recent activity</h2>
      <Card className="divide-y divide-zinc-100">
        {recent.length === 0 ? (
          <EmptyState icon={<MessageSquare className="h-5 w-5" />} title="No conversations yet" description="When a lead replies to one of your DMs, it shows up here." />
        ) : (
          recent.map((c) => (
            <Link key={c.id} href={`/chats/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
              <Avatar name={c.lead_name} src={c.lead_avatar_url} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{c.lead_name}</span>
                  <AutoBadge on={c.settings.auto_chat_enabled} />
                </div>
                <p className="truncate text-sm text-zinc-500">{c.last_message_preview}</p>
              </div>
              <div className="hidden items-center gap-3 sm:flex">
                <InterestIndicator level={c.state.interest_level} />
                <StageBadge stage={c.state.conversation_stage} />
              </div>
              <span className="text-xs text-zinc-400">{timeAgo(c.last_message_at)}</span>
            </Link>
          ))
        )}
      </Card>
    </div>
  );
}
