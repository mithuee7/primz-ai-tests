"use client";

import { AlertTriangle } from "lucide-react";
import { Button, EmptyState } from "@/components/ui/primitives";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={<AlertTriangle className="h-5 w-5" />}
      title="Something went wrong"
      description={process.env.NODE_ENV === "development" ? error.message : "The page couldn't load. Nothing was sent to any lead."}
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
