import { detectInjectionAttempt, runLocalRules, asksIfAutomated } from "@/lib/services/ai/rules";
import type { ConversationStage, InterestLevel, PitchStatus } from "@/lib/types";
import { LLMError, type LLMClient, type LLMRequest } from "./types";

export interface DemoGenContext {
  lastLeadMessage: string;
  leadReplyCount: number;
  stage: ConversationStage;
  pitchStatus: PitchStatus;
  currentTopic: string | null;
  identifiedProblem: string | null;
  allowedServices: Array<{ id: string; name: string }>;
  /** Demo control: make the "AI" produce an assistant-sounding draft to exercise the checker. */
  forceBadDraft?: boolean;
}

export interface DemoCheckContext {
  candidate: string;
  lastLeadMessage: string;
  pitchStatus: PitchStatus;
  potentialServiceId: string | null;
  allowedServiceIds: string[];
  previousPitchStatus: PitchStatus;
}

/**
 * SCRIPTED stand-in for Groq, used only in demo mode when no Groq key is
 * configured. It is NOT an AI: replies come from keyword rules so the full
 * pipeline (generation -> checker -> cleanup -> send/review) can be exercised
 * offline. The UI labels this clearly. Add a Groq key to use the real thing.
 */
export class DemoLLM implements LLMClient {
  readonly provider = "demo" as const;

  async complete(req: LLMRequest): Promise<string> {
    if (req.purpose === "conversation") return JSON.stringify(this.generate(req.demoContext as DemoGenContext | undefined));
    return JSON.stringify(this.check(req.demoContext as DemoCheckContext | undefined));
  }

  private generate(ctx: DemoGenContext | undefined) {
    if (!ctx) throw new LLMError("Demo LLM needs demoContext", "http", false);
    const msg = ctx.lastLeadMessage.toLowerCase();
    const pick = (needle: RegExp) => ctx.allowedServices.find((s) => needle.test(s.name));

    let reply: string;
    let stage: ConversationStage = ctx.stage;
    let interest: InterestLevel = "MEDIUM";
    let pitch: PitchStatus = ctx.pitchStatus;
    let serviceId: string | null = null;
    let problem = ctx.identifiedProblem;
    let objection: string | null = null;
    let escalate: string | null = null;

    const mentionsProblem = /(miss|can'?t keep up|go cold|cold by|too many|pile|buried|slow|overwhelm|ignore|lose|lost|never stops|can'?t pick up|can'?t take)/.test(msg);
    const asksPrice = /(how much|price|pricing|cost|rates?|expensive|budget)/.test(msg);
    const saysNo = /(not interested|no thanks|no thank you|stop messaging|don'?t message|leave me alone|unsubscribe)/.test(msg);
    const saysYes = /(sounds good|tell me more|interested|let'?s talk|let'?s do|sure,? (send|let)|yes|yeah,? (send|let|sure)|open to|worth a (look|chat))/.test(msg);

    const service = /call|phone|ring|pick up|front desk/.test(msg)
      ? pick(/receptionist/i)
      : /dm|comment|inbox|collab|message/.test(msg)
        ? pick(/dm|comment/i)
        : /lead|follow/.test(msg)
          ? pick(/follow/i)
          : undefined;

    if (ctx.forceBadDraft) {
      reply = "Sure, here's the message you can send: That sounds frustrating! Let me know if you need anything else.";
    } else if (asksIfAutomated(ctx.lastLeadMessage)) {
      reply = "Ha, fair question.";
      escalate = "LEAD_ASKED_IF_AUTOMATED";
    } else if (detectInjectionAttempt(ctx.lastLeadMessage)) {
      reply = "Not sure I follow, what do you mean?";
      escalate = "PROMPT_MANIPULATION";
    } else if (saysNo) {
      reply = "No worries at all, appreciate you letting me know. Good luck with everything.";
      stage = "NOT_INTERESTED";
      interest = "NONE";
    } else if (ctx.pitchStatus === "PITCHED") {
      pitch = "PITCHED";
      serviceId = pick(/./)?.id ?? null;
      if (asksPrice) {
        reply = "Depends on what you'd actually need, so it's easier to scope on a quick call than guess over DM. Want to find 15 minutes this week?";
        stage = "OBJECTION";
        objection = "Asked about pricing";
      } else if (saysYes) {
        reply = "Great, let's set up a quick call. What day works best for you this week?";
        stage = "INTERESTED";
        interest = "HIGH";
      } else if (/(robot|sound like|fake|not me|generic)/.test(msg)) {
        reply = "Fair concern. It's set up around how you actually talk, and you'd review it before it goes live. Happy to show you on a quick call.";
        stage = "OBJECTION";
        objection = "Worried about sounding robotic";
      } else {
        reply = "Makes sense. Anything specific you'd want to know before deciding if it's worth a look?";
        stage = "OBJECTION";
      }
    } else if (mentionsProblem && ctx.allowedServices.length > 0 && (service || ctx.leadReplyCount >= 2)) {
      const chosen = service ?? ctx.allowedServices[0];
      if (chosen) {
        reply = `That's exactly what we help with at Primz. It's what our ${chosen.name.replace(/\s*\(.*\)/, "")} service is for, so those don't slip through. Want me to walk you through how it would work for you?`;
        stage = "PITCHED";
        pitch = "PITCHED";
        serviceId = chosen.id;
        problem = problem ?? "Leads/enquiries slipping through";
        interest = "MEDIUM";
      } else {
        reply = "Got it, how are you handling that at the moment?";
        stage = "PROBLEM_IDENTIFIED";
      }
    } else if (mentionsProblem) {
      reply = "That sounds like a real headache. How are you handling it at the moment?";
      stage = "PROBLEM_IDENTIFIED";
      problem = problem ?? "Struggling to keep up with incoming enquiries";
    } else {
      reply = ctx.leadReplyCount <= 1
        ? "Interesting, how did you end up going that route?"
        : "Makes sense. What's been the hardest part of that lately?";
      stage = ctx.leadReplyCount <= 1 ? "RAPPORT" : "DISCOVERY";
      interest = "LOW";
    }

    return {
      reply,
      state_update: {
        current_topic: ctx.currentTopic,
        identified_problem: problem,
        potential_service_id: serviceId,
        interest_level: interest,
        conversation_stage: stage,
        pitch_status: pitch,
        objection,
      },
      escalate_reason: escalate,
    };
  }

  private check(ctx: DemoCheckContext | undefined) {
    if (!ctx) throw new LLMError("Demo LLM needs demoContext", "http", false);
    const rules = runLocalRules(ctx.candidate);
    const issues: string[] = [...rules.issues];
    const reasons: string[] = rules.reason ? [rules.reason] : [];

    if (detectInjectionAttempt(ctx.lastLeadMessage)) {
      issues.push("INJECTION_ATTEMPT");
      reasons.push("The lead's message tries to manipulate the system.");
    }
    if (asksIfAutomated(ctx.lastLeadMessage)) {
      issues.push("UNCERTAIN");
      reasons.push("The lead asked whether this is automated; a human should answer.");
    }
    if (ctx.pitchStatus === "PITCHED" && ctx.previousPitchStatus === "NOT_PITCHED") {
      if (!ctx.potentialServiceId || !ctx.allowedServiceIds.includes(ctx.potentialServiceId)) {
        issues.push("SERVICE_NOT_SELECTED");
        reasons.push("Pitches a service that isn't selected for this chat.");
      }
    }
    const approved = issues.length === 0;
    return { approved, confidence: approved ? 0.93 : 0.97, issues, reason: approved ? "" : reasons.join(" ") };
  }
}
