import { Users } from "lucide-react";
import Link from "next/link";
import { AutoBadge, InterestIndicator, LeadTypeChip, PitchBadge, StageBadge } from "@/components/chats/indicators";
import { Avatar, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Leads" };

export default async function LeadsPage() {
  const user = await requireUser();
  const conversations = await getRepository().listConversations(user.id);

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <PageHeader title="Leads" description="Everyone who has replied, with where they stand." />
      {conversations.length === 0 ? (
        <EmptyState icon={<Users className="h-5 w-5" />} title="No leads yet" description="Leads appear once they reply to your first DM." />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[2fr_1fr_1.2fr_1fr_1fr_auto] gap-4 border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500 md:grid">
            <span>Lead</span><span>Type</span><span>Stage</span><span>Interest</span><span>Status</span><span>Active</span>
          </div>
          <ul className="divide-y divide-zinc-100">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link href={`/chats/${c.id}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-zinc-50 md:grid-cols-[2fr_1fr_1.2fr_1fr_1fr_auto] md:gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={c.lead_name} src={c.lead_avatar_url} size="sm" className="md:order-none" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.lead_name}</p>
                      <p className="truncate text-xs text-zinc-500">@{c.lead_username}</p>
                    </div>
                  </div>
                  <div className="hidden md:block"><LeadTypeChip type={c.settings.lead_type} /></div>
                  <div className="col-start-2 row-start-1 flex flex-wrap items-center justify-end gap-1.5 md:col-start-auto md:row-start-auto md:justify-start"><StageBadge stage={c.state.conversation_stage} /></div>
                  <div className="hidden md:block"><InterestIndicator level={c.state.interest_level} showLabel /></div>
                  <div className="hidden flex-wrap gap-1.5 md:flex"><AutoBadge on={c.settings.auto_chat_enabled} /><PitchBadge pitched={c.state.pitch_status === "PITCHED"} /></div>
                  <span className="text-xs text-zinc-400">{timeAgo(c.last_message_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
