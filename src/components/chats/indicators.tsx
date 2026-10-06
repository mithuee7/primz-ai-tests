import { AlertTriangle, Bot, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import {
  LEAD_TYPE_LABELS,
  STAGE_LABELS,
  type ConversationFull,
  type ConversationStage,
  type InterestLevel,
  type LeadType,
} from "@/lib/types";

const stageTone: Record<ConversationStage, Parameters<typeof Badge>[0]["tone"]> = {
  DISCOVERY: "neutral",
  RAPPORT: "neutral",
  PROBLEM_IDENTIFIED: "blue",
  SERVICE_FIT: "blue",
  PITCHED: "violet",
  OBJECTION: "amber",
  INTERESTED: "green",
  NOT_INTERESTED: "red",
  HUMAN_TAKEOVER: "dark",
};

export function StageBadge({ stage }: { stage: ConversationStage }) {
  return <Badge tone={stageTone[stage]}>{STAGE_LABELS[stage]}</Badge>;
}

export function LeadTypeChip({ type }: { type: LeadType }) {
  return <Badge>{LEAD_TYPE_LABELS[type]}</Badge>;
}

const interestMeta: Record<InterestLevel, { label: string; bars: number; color: string }> = {
  UNKNOWN: { label: "Interest unknown", bars: 0, color: "bg-zinc-300" },
  NONE: { label: "Not interested", bars: 1, color: "bg-red-400" },
  LOW: { label: "Low interest", bars: 1, color: "bg-zinc-400" },
  MEDIUM: { label: "Medium interest", bars: 2, color: "bg-amber-400" },
  HIGH: { label: "High interest", bars: 3, color: "bg-emerald-500" },
};

/** Three-bar signal indicator. */
export function InterestIndicator({ level, showLabel = false }: { level: InterestLevel; showLabel?: boolean }) {
  const m = interestMeta[level];
  return (
    <span className="inline-flex items-center gap-1.5" title={m.label}>
      <span className="flex items-end gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("w-1 rounded-sm", i === 0 ? "h-1.5" : i === 1 ? "h-2.5" : "h-3.5", i < m.bars ? m.color : "bg-zinc-200")} />
        ))}
      </span>
      {showLabel ? <span className="text-xs text-zinc-500">{m.label}</span> : <span className="sr-only">{m.label}</span>}
    </span>
  );
}

export function AutoBadge({ on }: { on: boolean }) {
  return on ? (
    <Badge tone="green">
      <Bot className="h-3 w-3" /> Auto
    </Badge>
  ) : null;
}

export function PitchBadge({ pitched }: { pitched: boolean }) {
  return pitched ? (
    <Badge tone="violet">
      <Sparkles className="h-3 w-3" /> Pitched
    </Badge>
  ) : null;
}

export function ReviewWarning({ conv }: { conv: ConversationFull }) {
  return conv.state.needs_review ? (
    <Badge tone="amber">
      <AlertTriangle className="h-3 w-3" /> Review
    </Badge>
  ) : null;
}
