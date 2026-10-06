import type { Service } from "@/lib/types";

/**
 * Seed services. Derived ONLY from what https://primz-ai.onrender.com/ currently
 * states publicly (real estate, creators, local business sections + the
 * "custom build" CTA). The site is light on detail, so descriptions stay close
 * to its wording and nothing here invents pricing, timelines or capabilities.
 * Edit them on the Services page, the AI treats these rows as its only source of truth.
 */
export type DefaultService = Pick<
  Service,
  "name" | "description" | "ideal_customer" | "problems_solved" | "key_benefits" | "pitch_guidance"
>;

export const DEFAULT_SERVICES: DefaultService[] = [
  {
    name: "AI Sales Follow-Up (Real Estate)",
    description:
      "An AI sales follow-up system for real estate agents that responds to and follows up with leads so nothing slips through.",
    ideal_customer: "Real estate agents and small teams who get inbound leads but are slow or inconsistent at following up.",
    problems_solved: "Missed leads, slow replies, manual follow-up busywork, leads going cold after hours or on weekends.",
    key_benefits: "Leads get a fast response. Follow-up happens consistently. Wired into the agent's existing workflow rather than a separate tool to check.",
    pitch_guidance: "Lead with the missed-lead / slow-reply problem the agent has actually mentioned. Offer a short call to look at where leads are slipping. Do not quote prices.",
  },
  {
    name: "AI Receptionist (Real Estate)",
    description:
      "A receptionist that answers calls so a buyer call is never missed.",
    ideal_customer: "Real estate agents and teams who miss calls while showing properties or outside business hours.",
    problems_solved: "Missed buyer calls, no one answering after hours, leads lost because nobody picked up.",
    key_benefits: "Calls get answered around the clock. Fewer missed buyers. Fits into how the agent already works.",
    pitch_guidance: "Only bring up if they mention missed calls, being on the road, or after-hours enquiries.",
  },
  {
    name: "Real Estate Listings Website",
    description: "A listings website built around the agent's brand.",
    ideal_customer: "Real estate agents who rely on third-party portals or have an outdated website.",
    problems_solved: "Generic or outdated web presence, listings not showcased under the agent's own brand.",
    key_benefits: "Branded listings site, built to match the agent's own workflow.",
    pitch_guidance: "Secondary offer. Only raise if the website or online presence comes up naturally.",
  },
  {
    name: "Creator Account Dashboard",
    description: "One dashboard to track every account a creator manages.",
    ideal_customer: "Creators and UGC creators running multiple social accounts.",
    problems_solved: "Juggling several accounts, no single place to see everything.",
    key_benefits: "Everything tracked from one place instead of hopping between accounts.",
    pitch_guidance: "Relevant when they mention managing multiple accounts or brands.",
  },
  {
    name: "Creator DM & Comment Bot",
    description: "A bot that handles a creator's DMs and comments.",
    ideal_customer: "Creators with more DMs and comments than they can answer personally.",
    problems_solved: "Unanswered DMs and comments, slow replies, manual busywork.",
    key_benefits: "DMs and comments get handled automatically so fewer messages slip through.",
    pitch_guidance: "Raise when they talk about inbox overload, brand-deal DMs, or missing messages.",
  },
  {
    name: "Local Business Website",
    description: "A fast website for local businesses and clinics.",
    ideal_customer: "Local businesses and clinics with no site or a slow, dated one.",
    problems_solved: "Slow or outdated website, weak first impression for new patients or clients.",
    key_benefits: "A fast website built for the business.",
    pitch_guidance: "Only raise if their website or online presence is genuinely part of the conversation.",
  },
  {
    name: "AI Receptionist (Clinics & Local Business)",
    description:
      "A receptionist that answers patient or client calls around the clock.",
    ideal_customer: "Clinics, dentists, and local businesses where the front desk can't answer every call.",
    problems_solved: "Missed patient/client calls, after-hours enquiries going unanswered, front-desk overload.",
    key_benefits: "Calls answered around the clock, so fewer patients or clients are lost to voicemail.",
    pitch_guidance: "Raise when they mention busy front desk, missed calls, or new-patient enquiries. Offer a short call.",
  },
  {
    name: "Custom Build",
    description:
      "One-off AI systems built around a specific problem. Most of Primz's best builds started as a one-off request.",
    ideal_customer: "Any business with a specific workflow problem the standard offers don't cover.",
    problems_solved: "Missed leads, slow replies, manual busywork not covered by other services.",
    key_benefits: "Built against the client's own workflow. Primz says honestly whether it can help.",
    pitch_guidance: "Use only when the lead describes a problem none of the other services cover.",
  },
];
