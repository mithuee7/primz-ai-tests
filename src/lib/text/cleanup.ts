/**
 * Deterministic message cleanup, run AFTER the checker approves a message.
 * Pure function, no AI involved.
 *
 * Rule: dashes used as separators become ", ". Hyphens inside words
 * (follow-up, AI-powered, co-ordinate) and numeric ranges (10-15) are untouched.
 */

const DASH = "[-‐‑‒–—―−]";

// A dash with whitespace on at least one side, not part of a word or a number range.
const SPACED_DASH = new RegExp(`[ \\t]+${DASH}+[ \\t]+`, "g");
// En/em dashes glued between words: "help—especially"
const GLUED_LONG_DASH = /(?<=\p{L})[–—―](?=\p{L})/gu;
// Dash dangling at the end of a line/message: "wait -"
const TRAILING_DASH = new RegExp(`[ \\t]+${DASH}+[ \\t]*(?=\\n|$)`, "g");

const PUNCT_BEFORE = /[,.;:!?]$/;

function replaceSeparator(text: string, pattern: RegExp): string {
  return text.replace(pattern, (match, offset: number, whole: string) => {
    const before = whole.slice(0, offset);
    const after = whole.slice(offset + match.length);

    // Leave numeric ranges alone: "10 - 15"
    if (/\d$/.test(before) && /^\d/.test(after)) return match;

    // Already punctuated before the dash: just keep a space.
    if (PUNCT_BEFORE.test(before)) return " ";

    return ", ";
  });
}

export function cleanMessage(input: string): string {
  let text = input.replace(/\r\n?/g, "\n");

  text = replaceSeparator(text, SPACED_DASH);
  text = replaceSeparator(text, GLUED_LONG_DASH);
  text = text.replace(TRAILING_DASH, "");

  // Tidy leftovers
  text = text
    .replace(/,\s*,+/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Strip a single pair of wrapping quotes the model sometimes adds
  const wrapped = text.match(/^(["“])([\s\S]*)(["”])$/);
  if (wrapped && wrapped[2] && !wrapped[2].includes('"')) {
    text = wrapped[2].trim();
  }

  return text;
}
