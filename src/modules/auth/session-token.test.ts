import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { AuthConfigError, AuthError } from "./errors";
import {
  generateSessionToken,
  hashSessionToken,
  isValidSessionToken,
  SESSION_TOKEN_MIN_LENGTH,
} from "./session-token";

const authSecret = "0123456789abcdef0123456789abcdef";

describe("generateSessionToken", () => {
  it("generates high-entropy opaque tokens with the expected shape", () => {
    const first = generateSessionToken();
    const second = generateSessionToken();

    expect(first).not.toBe(second);
    expect(first).toHaveLength(SESSION_TOKEN_MIN_LENGTH);
    expect(second).toHaveLength(SESSION_TOKEN_MIN_LENGTH);
    expect(isValidSessionToken(first)).toBe(true);
    expect(isValidSessionToken(second)).toBe(true);
  });

  it("does not use Math.random for token generation", () => {
    const source = readFileSync("src/modules/auth/session-token.ts", "utf8");

    expect(source).toContain("randomBytes");
    expect(source).not.toContain("Math.random");
  });
});

describe("hashSessionToken", () => {
  it("hashes opaque tokens deterministically without storing the raw token", () => {
    const rawToken = generateSessionToken();
    const firstHash = hashSessionToken(rawToken, { authSecret });
    const secondHash = hashSessionToken(rawToken, { authSecret });

    expect(firstHash).toBe(secondHash);
    expect(firstHash).not.toBe(rawToken);
    expect(isValidSessionToken(firstHash)).toBe(true);
  });

  it("changes the token hash when AUTH_SECRET changes", () => {
    const rawToken = generateSessionToken();
    const firstHash = hashSessionToken(rawToken, { authSecret });
    const secondHash = hashSessionToken(rawToken, {
      authSecret: "abcdef0123456789abcdef0123456789",
    });

    expect(firstHash).not.toBe(secondHash);
  });

  it("rejects malformed raw tokens before hashing", () => {
    expect(() => hashSessionToken("not-a-valid-session-token", { authSecret }))
      .toThrow(AuthError);
  });

  it("requires AUTH_SECRET by key name only when env parsing is needed", () => {
    const rawToken = generateSessionToken();

    try {
      hashSessionToken(rawToken, {
        env: {
          SESSION_COOKIE_NAME: "sextou_session",
          SESSION_MAX_AGE_DAYS: "30",
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AuthConfigError);
      expect((error as Error).message).toContain("AUTH_SECRET");
      expect((error as Error).message).not.toContain(rawToken);
      return;
    }

    throw new Error("Expected missing AUTH_SECRET to throw.");
  });
});
