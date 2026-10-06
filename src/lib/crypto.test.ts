import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, signForTest, verifyMetaSignature } from "./crypto";

const key = randomBytes(32).toString("base64");

describe("secret encryption", () => {
  it("round-trips", () => {
    const enc = encryptSecret("gsk_test_123", key);
    expect(enc).not.toContain("gsk_test_123");
    expect(decryptSecret(enc, key)).toBe("gsk_test_123");
  });

  it("fails with the wrong key or tampered data", () => {
    const enc = encryptSecret("secret", key);
    expect(() => decryptSecret(enc, randomBytes(32).toString("base64"))).toThrow();
    expect(() => decryptSecret(enc.slice(0, -2) + "xx", key)).toThrow();
  });

  it("rejects bad key sizes", () => {
    expect(() => encryptSecret("x", Buffer.from("short").toString("base64"))).toThrow();
  });
});

describe("verifyMetaSignature", () => {
  const body = JSON.stringify({ object: "instagram", entry: [] });
  it("accepts a valid signature", () => {
    expect(verifyMetaSignature(body, signForTest(body, "appsecret"), "appsecret")).toBe(true);
  });
  it("rejects wrong secret, tampered body, and missing header", () => {
    expect(verifyMetaSignature(body, signForTest(body, "other"), "appsecret")).toBe(false);
    expect(verifyMetaSignature(body + " ", signForTest(body, "appsecret"), "appsecret")).toBe(false);
    expect(verifyMetaSignature(body, null, "appsecret")).toBe(false);
    expect(verifyMetaSignature(body, "sha256=zzzz", "appsecret")).toBe(false);
  });
});
