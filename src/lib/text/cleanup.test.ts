import { describe, expect, it } from "vitest";
import { cleanMessage } from "./cleanup";

describe("cleanMessage", () => {
  it("replaces a spaced hyphen separator with a comma", () => {
    expect(cleanMessage("This is where we can help - especially with follow-up.")).toBe(
      "This is where we can help, especially with follow-up.",
    );
  });

  it("replaces spaced en and em dashes", () => {
    expect(cleanMessage("That makes sense – most clinics do it that way")).toBe(
      "That makes sense, most clinics do it that way",
    );
    expect(cleanMessage("Honestly — I'd start there")).toBe("Honestly, I'd start there");
  });

  it("replaces glued em dashes between words", () => {
    expect(cleanMessage("we help—especially with replies")).toBe(
      "we help, especially with replies",
    );
  });

  it("leaves hyphens inside words untouched", () => {
    for (const word of ["follow-up", "AI-powered", "co-ordinate", "well-known", "e-mail"]) {
      expect(cleanMessage(`the ${word} part`)).toBe(`the ${word} part`);
    }
  });

  it("leaves numeric ranges untouched", () => {
    expect(cleanMessage("about 10-15 leads a week")).toBe("about 10-15 leads a week");
    expect(cleanMessage("about 10 - 15 leads a week")).toBe("about 10 - 15 leads a week");
  });

  it("does not double up punctuation", () => {
    expect(cleanMessage("Yeah, - that works")).toBe("Yeah, that works");
    expect(cleanMessage("Right. - Next point")).toBe("Right. Next point");
  });

  it("removes a dangling trailing dash", () => {
    expect(cleanMessage("hold on -")).toBe("hold on");
  });

  it("handles multiple separators in one message", () => {
    expect(cleanMessage("one - two - three")).toBe("one, two, three");
  });

  it("normalizes whitespace and line endings", () => {
    expect(cleanMessage("  hey  there\r\n\r\n\r\n\r\nwhat's up  ")).toBe(
      "hey there\n\nwhat's up",
    );
  });

  it("strips one pair of wrapping quotes", () => {
    expect(cleanMessage('"sounds good to me"')).toBe("sounds good to me");
    expect(cleanMessage('he said "hi" and left')).toBe('he said "hi" and left');
  });

  it("is idempotent", () => {
    const once = cleanMessage("a - b — c follow-up");
    expect(cleanMessage(once)).toBe(once);
  });
});
