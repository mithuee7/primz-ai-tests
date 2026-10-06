import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DEMO_MODE = "true";

/** Controllable Instagram: counts sends and can fail them in different ways. */
const ig = {
  sends: 0,
  mode: "ok" as "ok" | "ambiguous" | "rejected" | "slow",
  onSend: null as null | (() => Promise<void>),
};

vi.mock("@/lib/services/instagram", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/instagram")>("@/lib/services/instagram");
  return {
    ...actual,
    getInstagramService: async () => ({
      kind: "mock" as const,
      getStatus: async () => ({ kind: "mock" as const, connected: true, label: "t", detail: "t" }),
      getMessages: async () => [],
      getProfile: async () => null,
      verifyWebhookChallenge: () => null,
      handleWebhook: async () => [],
      sendMessage: async () => {
        ig.sends++;
        if (ig.onSend) await ig.onSend();
        if (ig.mode === "ambiguous") throw new actual.InstagramApiError("timeout", true);
        if (ig.mode === "rejected") throw new actual.InstagramApiError("bad request", false);
        return { externalMessageId: `ig_${ig.sends}`, delivery: "mock" as const };
      },
    }),
  };
});

type Mods = {
  repo: typeof import("@/lib/repo");
  pipeline: typeof import("./pipeline");
  ingest: typeof import("@/lib/services/ingest");
  claims: typeof import("./claims");
};
let m: Mods;
const OWNER = "once-owner";

beforeAll(async () => {
  m = {
    repo: await import("@/lib/repo"),
    pipeline: await import("./pipeline"),
    ingest: await import("@/lib/services/ingest"),
    claims: await import("./claims"),
  };
});

beforeEach(async () => {
  ig.sends = 0;
  ig.mode = "ok";
  ig.onSend = null;
  await m.repo.getRepository().resetDemo?.(OWNER);
});

async function conv() {
  const all = await m.repo.getRepository().listConversations(OWNER);
  const c = all.find((x) => x.lead_username === "rahul.homes.pune");
  if (!c) throw new Error("seed missing");
  baseline.set(c.id, (await allAi(c.id)).length);
  return c;
}
/** AI messages added since the seed (the seed chats already contain some). */
const baseline = new Map<string, number>();
const allAi = async (id: string) => (await m.repo.getRepository().listRecentMessages(OWNER, id, 100)).filter((x) => x.sender_type === "ai");
const aiMessages = async (id: string) => (await allAi(id)).slice(baseline.get(id) ?? 0);

function event(c: Awaited<ReturnType<typeof conv>>, id: string, text = "tell me more") {
  return {
    thread: { externalThreadId: c.external_thread_id, profile: { externalId: c.lead_external_id ?? "x", name: c.lead_name, username: c.lead_username, avatarUrl: null } },
    message: { externalMessageId: id, externalThreadId: c.external_thread_id, senderExternalId: "lead", isEcho: false, text, timestamp: new Date().toISOString() },
  };
}

describe("exactly one reply per inbound message", () => {
  it("drops Meta's re-deliveries of the same message id", async () => {
    const c = await conv();
    const first = await m.ingest.ingestInboundEvent(OWNER, event(c, "mid_dup"));
    const again = await m.ingest.ingestInboundEvent(OWNER, event(c, "mid_dup"));
    const third = await m.ingest.ingestInboundEvent(OWNER, event(c, "mid_dup"));
    expect(first.duplicate).toBe(false);
    expect(again.duplicate).toBe(true);
    expect(third.duplicate).toBe(true);
    expect(again.shouldRunPipeline).toBe(false);
  });

  it("concurrent runs for the same message send exactly once", async () => {
    const c = await conv();
    const outs = await Promise.all([1, 2, 3, 4].map(() => m.pipeline.runPipeline({ ownerId: OWNER, conversationId: c.id })));
    expect(outs.filter((o) => o.status === "SENT")).toHaveLength(1);
    expect(ig.sends).toBe(1);
    expect(await aiMessages(c.id)).toHaveLength(1);
  });

  it("running again after a send is skipped", async () => {
    const c = await conv();
    await m.pipeline.runPipeline({ ownerId: OWNER, conversationId: c.id });
    const again = await m.pipeline.runPipeline({ ownerId: OWNER, conversationId: c.id, manual: true });
    expect(again.status).toBe("SKIPPED");
    expect(ig.sends).toBe(1);
  });

  it("an unclear send failure (timeout) is never retried and is flagged for a human", async () => {
    const c = await conv();
    ig.mode = "ambiguous";
    const out = await m.pipeline.runPipeline({ ownerId: OWNER, conversationId: c.id });
    expect(out.status).not.toBe("SENT");
    expect(await aiMessages(c.id)).toHaveLength(0);
    ig.mode = "ok";
    const a = await m.pipeline.runPipeline({ ownerId: OWNER, conversationId: c.id });
    const b = await m.pipeline.runPipeline({ ownerId: OWNER, conversationId: c.id, manual: true });
    expect(a.status).not.toBe("SENT");
    expect(b.status).not.toBe("SENT");
    expect(ig.sends).toBe(1);
    const after = await m.repo.getRepository().getConversation(OWNER, c.id);
    expect(after?.state.needs_review).toBe(true);
  });

  it("a definite rejection from Instagram sends nothing and can be retried by a person", async () => {
    const c = await conv();
    ig.mode = "rejected";
    const out = await m.pipeline.runPipeline({ ownerId: OWNER, conversationId: c.id });
    expect(out.status).not.toBe("SENT");
    expect(await aiMessages(c.id)).toHaveLength(0);
    ig.mode = "ok";
    // The chat was flagged for review; the person clears the flag, then presses "Run AI now".
    await m.repo.getRepository().updateState(OWNER, c.id, { needs_review: false, review_reason: null });
    const retry = await m.pipeline.runPipeline({ ownerId: OWNER, conversationId: c.id, manual: true });
    expect(retry.status).toBe("SENT");
    expect(await aiMessages(c.id)).toHaveLength(1);
  });

  it("when the echo of our own message arrives first, there is still only one message, labelled AI", async () => {
    const c = await conv();
    ig.onSend = async () => {
      await m.ingest.ingestInboundEvent(OWNER, {
        thread: event(c, "x").thread,
        message: { externalMessageId: "ig_1", externalThreadId: c.external_thread_id, senderExternalId: "me", isEcho: true, text: "echo", timestamp: new Date().toISOString() },
      });
    };
    await m.pipeline.runPipeline({ ownerId: OWNER, conversationId: c.id });
    const msgs = await m.repo.getRepository().listRecentMessages(OWNER, c.id, 100);
    expect(msgs.filter((x) => x.external_message_id === "ig_1")).toHaveLength(1);
    expect(msgs.find((x) => x.external_message_id === "ig_1")?.sender_type).toBe("ai");
  });

  it("a run that died mid-send becomes UNKNOWN and is flagged, not retried", async () => {
    const c = await conv();
    const msgs = await m.repo.getRepository().listRecentMessages(OWNER, c.id, 50);
    const trigger = msgs[msgs.length - 1]!;
    await m.repo.getRepository().claimReply(OWNER, c.id, trigger.id, []);
    const swept = await m.claims.sweepStaleReplyClaims(OWNER, 0);
    expect(swept).toBe(1);
    const claim = await m.repo.getRepository().claimReply(OWNER, c.id, trigger.id, []);
    expect(claim.claimed).toBe(false);
    if (!claim.claimed) expect(claim.existing?.status).toBe("UNKNOWN");
    const out = await m.pipeline.runPipeline({ ownerId: OWNER, conversationId: c.id });
    expect(out.status).not.toBe("SENT");
    expect(ig.sends).toBe(0);
  });
});
