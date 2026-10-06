import { randomUUID } from "node:crypto";
import type {
  AiGeneration,
  AiReview,
  Conversation,
  ConversationSettings,
  ConversationState,
  Message,
  SenderType,
  Service,
} from "@/lib/types";

interface SeedTarget {
  conversations: Conversation[];
  settings: Map<string, ConversationSettings>;
  state: Map<string, ConversationState>;
  convServices: Map<string, string[]>;
  messages: Message[];
  generations: AiGeneration[];
  reviews: AiReview[];
}

type Line = [SenderType, string, minutesAgo: number];

/** Demo-only conversations. Used exclusively by MemoryRepository in demo mode. */
export function buildDemoSeed(ownerId: string, services: Service[], t: SeedTarget): void {
  const byName = (needle: string) => services.find((s) => s.name.includes(needle))?.id ?? null;
  const nowMs = Date.now();
  const iso = (minAgo: number) => new Date(nowMs - minAgo * 60_000).toISOString();

  function add(
    c: { name: string; username: string; threadId: string; leadType: ConversationSettings["lead_type"] },
    cfg: {
      tone: ConversationSettings["tone"];
      auto: boolean;
      allServices: boolean;
      serviceIds?: (string | null)[];
      extra?: string;
      state: Partial<ConversationState>;
    },
    lines: Line[],
  ): string {
    const id = randomUUID();
    const sorted = [...lines].sort((a, b) => b[2] - a[2]);
    const last = sorted[sorted.length - 1];
    t.conversations.push({
      id,
      owner_id: ownerId,
      external_thread_id: c.threadId,
      lead_external_id: `demo_user_${c.threadId}`,
      lead_name: c.name,
      lead_username: c.username,
      lead_avatar_url: null,
      last_message_at: last ? iso(last[2]) : null,
      last_message_preview: last ? last[1].slice(0, 200) : null,
      last_message_sender: last ? last[0] : null,
      created_at: iso((sorted[0]?.[2] ?? 0) + 5),
      updated_at: iso(last?.[2] ?? 0),
    });
    t.settings.set(id, {
      conversation_id: id,
      lead_type: c.leadType,
      tone: cfg.tone,
      custom_tone: null,
      extra_instructions: cfg.extra ?? "",
      all_services: cfg.allServices,
      auto_chat_enabled: cfg.auto,
      updated_at: iso(0),
    });
    t.state.set(id, {
      conversation_id: id,
      current_topic: null,
      identified_problem: null,
      potential_service_id: null,
      interest_level: "UNKNOWN",
      conversation_stage: "DISCOVERY",
      pitch_status: "NOT_PITCHED",
      objection: null,
      last_ai_message: null,
      needs_review: false,
      review_reason: null,
      pending_generation_id: null,
      lock_until: null,
      updated_at: iso(0),
      ...cfg.state,
    });
    t.convServices.set(id, (cfg.serviceIds ?? []).filter((x): x is string => Boolean(x)));
    sorted.forEach(([sender, content, minAgo], i) => {
      t.messages.push({
        id: randomUUID(),
        owner_id: ownerId,
        conversation_id: id,
        external_message_id: `demo_${c.threadId}_${i}`,
        sender_type: sender,
        sender_name: sender === "lead" ? c.name : sender === "ai" ? "Primz AI" : "You",
        content,
        created_at: iso(minAgo),
        metadata: { delivery: "demo" },
      });
    });
    return id;
  }

  // 1) Dentist, rapport stage, auto-chat OFF
  add(
    { name: "Dr. Anita Rao", username: "dr.anitarao.dental", threadId: "t_dentist", leadType: "doctor" },
    {
      tone: "friendly",
      auto: false,
      allServices: false,
      serviceIds: [byName("Clinics")],
      state: {
        conversation_stage: "RAPPORT",
        current_topic: "Early orthodontic intervention with Myobrace",
        interest_level: "LOW",
      },
    },
    [
      ["me", "Your focus on habit correction with Myobrace is interesting, how do you decide when to introduce it early versus later?", 1500],
      ["lead", "Thanks! Honestly it depends on the child. If I see mouth breathing or tongue thrust by age 5 or 6 I start early, otherwise we wait and watch.", 1440],
      ["me", "That makes sense. Do parents usually get on board with early intervention or is that a hard sell?", 1420],
      ["lead", "Mixed. Some are great, some think it's too early. Takes a lot of explaining at the front desk.", 1380],
    ],
  );

  // 2) Real estate agent, auto-chat ON, lead just replied (AI hasn't answered yet)
  add(
    { name: "Rahul Mehta", username: "rahul.homes.pune", threadId: "t_realestate", leadType: "real_estate" },
    {
      tone: "casual",
      auto: true,
      allServices: false,
      serviceIds: [byName("AI Sales Follow-Up"), byName("AI Receptionist (Real Estate)")],
      extra: "Focus on missed leads. Don't mention websites.",
      state: {
        conversation_stage: "PROBLEM_IDENTIFIED",
        current_topic: "Handling buyer enquiries while on site visits",
        identified_problem: "Misses buyer calls and slow to reply while at showings",
        interest_level: "MEDIUM",
      },
    },
    [
      ["me", "Saw you've been pushing the Baner listings hard lately, how are you finding buyer demand this quarter?", 300],
      ["lead", "Demand is fine, the problem is I can't keep up with everyone who messages lol", 290],
      ["ai", "Ha, good problem to have though. Is it mostly DMs or calls that pile up?", 285],
      ["lead", "Both honestly. When I'm on a site visit I just can't pick up. Some of them go cold by the time I call back", 20],
    ],
  );

  // 3) UGC creator, pitched, objection, AI replied last
  add(
    { name: "Zoya Khan", username: "zoya.ugc", threadId: "t_ugc", leadType: "ugc_creator" },
    {
      tone: "casual",
      auto: true,
      allServices: true,
      state: {
        conversation_stage: "OBJECTION",
        current_topic: "Brand-deal DMs piling up",
        identified_problem: "Brand and collab DMs go unanswered for days",
        potential_service_id: byName("DM & Comment Bot"),
        interest_level: "MEDIUM",
        pitch_status: "PITCHED",
        objection: "Worried it won't sound like her",
        last_ai_message: "Totally fair. It'd be set up around how you actually talk, and you'd see it before it goes live. Want me to walk you through how that works on a quick call?",
      },
    },
    [
      ["me", "Loved your skincare routine reel, how do you decide which brands to say yes to?", 2900],
      ["lead", "I get like 40 collab DMs a week so I mostly just ignore most of them tbh", 2880],
      ["ai", "40 a week is a lot. Do the good ones ever get buried in there?", 2870],
      ["lead", "Yes!! Missed a paid one last month because I saw it 6 days later", 2860],
      ["ai", "Ouch. That's exactly what we build around at Primz, a bot that handles DMs and comments so the good ones get answered fast. Happy to explain how it'd work for you.", 2850],
      ["lead", "hmm interesting but I don't want it to sound like a robot talking to brands", 120],
      ["ai", "Totally fair. It'd be set up around how you actually talk, and you'd see it before it goes live. Want me to walk you through how that works on a quick call?", 118],
    ],
  );

  // 4) Local business, needs review (checker rejected a draft)
  const reviewConvId = add(
    { name: "Sunrise Bakery", username: "sunrisebakery.pune", threadId: "t_local", leadType: "local_business" },
    {
      tone: "friendly",
      auto: true,
      allServices: true,
      state: {
        conversation_stage: "PROBLEM_IDENTIFIED",
        current_topic: "Phone orders during morning rush",
        identified_problem: "Phone rings off the hook at opening and orders get missed",
        interest_level: "MEDIUM",
      },
    },
    [
      ["me", "Your sourdough looks unreal, is the morning rush mostly walk-ins or phone orders?", 600],
      ["lead", "Thank you! Honestly a mix, but the phone never stops between 7 and 9", 590],
      ["ai", "I bet. Do you end up missing orders when it's that busy?", 585],
      ["lead", "Yeah we definitely lose a few. Hard to take calls when you're boxing bread", 45],
    ],
  );

  const gen: AiGeneration = {
    id: randomUUID(),
    owner_id: ownerId,
    conversation_id: reviewConvId,
    generated_text:
      "Sure, here's the message you can send: That sounds frustrating! We build AI receptionists that answer calls around the clock, would you like to hear more?",
    model: "demo",
    prompt_version: "conversation-v1",
    status: "PENDING_REVIEW",
    error: null,
    state_update: {
      current_topic: "Phone orders during morning rush",
      identified_problem: "Phone rings off the hook at opening and orders get missed",
      potential_service_id: byName("Clinics"),
      interest_level: "MEDIUM",
      conversation_stage: "SERVICE_FIT",
      pitch_status: "PITCHED",
      objection: null,
    },
    created_at: iso(40),
  };
  t.generations.push(gen);
  t.reviews.push({
    id: randomUUID(),
    owner_id: ownerId,
    generation_id: gen.id,
    reviewer: "rules",
    approved: false,
    confidence: 0.98,
    issues: ["AI_META_LANGUAGE"],
    reason: "Draft starts with operator-facing wording ('here's the message you can send') that would expose the automation.",
    created_at: iso(40),
  });
  const st = t.state.get(reviewConvId);
  if (st) {
    st.needs_review = true;
    st.review_reason = "AI_META_LANGUAGE: draft sounded like an assistant talking to the operator.";
    st.pending_generation_id = gen.id;
  }
}
