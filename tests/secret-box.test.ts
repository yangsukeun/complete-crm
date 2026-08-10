import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, secretBoxConfigured } from "@/lib/secret-box";

beforeAll(() => {
  process.env.CALENDAR_CREDENTIAL_KEY = "test-key-for-secret-box";
});

describe("secret-box", () => {
  it("reports configured when a key is present", () => {
    expect(secretBoxConfigured()).toBe(true);
  });

  it("round-trips a secret", () => {
    const plain = "네이버-앱-비밀번호-1234";
    const envelope = encryptSecret(plain);
    expect(envelope.startsWith("v1:")).toBe(true);
    expect(envelope).not.toContain(plain);
    expect(decryptSecret(envelope)).toBe(plain);
  });

  it("produces a different ciphertext each time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects tampered ciphertext", () => {
    const envelope = encryptSecret("secret");
    const parts = envelope.split(":");
    const flipped = Buffer.from(parts[3], "base64");
    flipped[0] ^= 0xff;
    parts[3] = flipped.toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("rejects malformed envelopes", () => {
    expect(() => decryptSecret("not-an-envelope")).toThrow();
  });
});
