import { CheckCircle2 } from "lucide-react";
import { ReviewCard } from "@/components/review/review-card";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { loadReviewItems } from "@/lib/review-data";

export const metadata = { title: "Needs Review" };

export default async function ReviewPage() {
  const user = await requireUser();
  const items = await loadReviewItems(user.id);

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <AutoRefresh intervalMs={10000} />
      <PageHeader title="Needs Review" description="Replies the AI wasn't allowed to send. Nothing here has reached the lead." />
      {items.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="All clear" description="When the checker rejects a reply, or something fails, it lands here for you to decide." />
      ) : (
        <div className="mx-auto grid max-w-3xl gap-4">
          {items.map((item) => (
            <ReviewCard key={item.conversation.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
