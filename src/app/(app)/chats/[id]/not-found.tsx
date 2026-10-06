import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <EmptyState
      icon={<MessageSquare className="h-5 w-5" />}
      title="Conversation not found"
      description="It may have been removed, or it belongs to another account."
      action={<Link href="/chats" className="text-sm font-medium underline">Back to chats</Link>}
    />
  );
}
