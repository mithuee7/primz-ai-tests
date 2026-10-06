import { describe, expect, it } from "vitest";
import { extractEntryIds, parseMetaMessagingPayload } from "./meta";
import { shouldRefreshToken } from "./token";
import { decryptFromStorage, encryptForStorage } from "@/lib/secrets";

const DAY = 86_400_000;
const now = Date.parse("2026-10-06T00:00:00Z");

describe("shouldRefreshToken", () => {
  it("waits until 20 days or less remain", () => {
    expect(shouldRefreshToken({ now, expiresAt: new Date(now + 40 * DAY).toISOString(), refreshedAt: null })).toBe(false);
    expect(shouldRefreshToken({ now, expiresAt: new Date(now + 19 * DAY).toISOString(), refreshedAt: null })).toBe(true);
  });
  it("never retries within 24h of the last refresh, and can't revive an expired token", () => {
    expect(shouldRefreshToken({ now, expiresAt: new Date(now + 10 * DAY).toISOString(), refreshedAt: new Date(now - 3600_000).toISOString() })).toBe(false);
    expect(shouldRefreshToken({ now, expiresAt: new Date(now - DAY).toISOString(), refreshedAt: null })).toBe(false);
    expect(shouldRefreshToken({ now, expiresAt: null, refreshedAt: null })).toBe(false);
  });
});

describe("webhook payload parsing", () => {
  const payload = {
    object: "instagram",
    entry: [
      {
        id: "1784",
        messaging: [
          { sender: { id: "999" }, recipient: { id: "1784" }, timestamp: 1_700_000_000_000, message: { mid: "m1", text: "hi" } },
          { sender: { id: "1784" }, recipient: { id: "999" }, timestamp: 1_700_000_001_000, message: { mid: "m2", text: "hello", is_echo: true } },
          { sender: { id: "999" }, recipient: { id: "1784" }, message: { mid: "m3" } },
        ],
      },
    ],
  };
  it("reads entry ids", () => expect(extractEntryIds(payload)).toEqual(["1784"]));
  it("turns text messages into events, treats own messages as echoes, skips non-text", () => {
    const ev = parseMetaMessagingPayload(payload, ["1784"]);
    expect(ev.map((e) => [e.message.externalMessageId, e.message.isEcho, e.thread.externalThreadId])).toEqual([
      ["m1", false, "999"],
      ["m2", true, "999"],
    ]);
  });
  it("ignores junk", () => {
    expect(extractEntryIds(null)).toEqual([]);
    expect(parseMetaMessagingPayload({ entry: "x" }, [])).toEqual([]);
  });
});

describe("stored secrets", () => {
  it("round-trips and is not plaintext", () => {
    const c = encryptForStorage("gsk_secret_value");
    expect(c).not.toContain("gsk_secret_value");
    expect(decryptFromStorage(c)).toBe("gsk_secret_value");
  });
});
