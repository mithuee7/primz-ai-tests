import { InterestIndicator, StageBadge } from "./indicators";
import type { ConversationFull, Service } from "@/lib/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-zinc-900">{children}</dd>
    </div>
  );
}

/** Read-only view of what the AI currently "knows" about this conversation. */
export function MemoryPanel({ conv, services }: { conv: ConversationFull; services: Service[] }) {
  const s = conv.state;
  const potential = services.find((x) => x.id === s.potential_service_id);
  const dash = <span className="font-normal text-zinc-400">None yet</span>;
  return (
    <dl className="divide-y divide-zinc-100 px-4 py-2">
      <Row label="Stage"><StageBadge stage={s.conversation_stage} /></Row>
      <Row label="Pitch">{s.pitch_status === "PITCHED" ? "Pitched" : "Not pitched"}</Row>
      <Row label="Interest"><InterestIndicator level={s.interest_level} showLabel /></Row>
      <Row label="Topic">{s.current_topic ?? dash}</Row>
      <Row label="Problem">{s.identified_problem ?? dash}</Row>
      <Row label="Service fit">{potential?.name ?? dash}</Row>
      <Row label="Objection">{s.objection ?? dash}</Row>
      <Row label="Last AI message"><span className="font-normal text-zinc-600">{s.last_ai_message ?? dash}</span></Row>
    </dl>
  );
}
