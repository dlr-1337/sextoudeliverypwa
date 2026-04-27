import { describe, expect, it } from "vitest";

import {
  getExpiredSessionCookieOptions,
  getSessionCookieOptions,
  parseAuthConfig,
} from "./config";
import { AuthConfigError } from "./errors";

const validEnv = {
  AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  SESSION_COOKIE_NAME: "sextou_session",
  SESSION_MAX_AGE_DAYS: "30",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NODE_ENV: "development",
};

describe("parseAuthConfig", () => {
  it("parses auth/session env lazily without forcing secure cookies on local HTTP", () => {
    expect(parseAuthConfig(validEnv)).toEqual({
      authSecret: "0123456789abcdef0123456789abcdef",
      sessionCookieName: "sextou_session",
      sessionMaxAgeDays: 30,
      sessionMaxAgeSeconds: 2_592_000,
      secureCookies: false,
    });
  });

  it("enables secure cookies for production and HTTPS deployments", () => {
    expect(
      parseAuthConfig({
        ...validEnv,
        NODE_ENV: "production",
      }).secureCookies,
    ).toBe(true);

    expect(
      parseAuthConfig({
        ...validEnv,
        NEXT_PUBLIC_APP_URL: "https://sextou.example.com",
      }).secureCookies,
    ).toBe(true);
  });

  it("reports missing and weak auth keys by key name without leaking submitted values", () => {
    const weakSecret = "short-secret-do-not-print";

    expect(() =>
      parseAuthConfig({
        ...validEnv,
        AUTH_SECRET: weakSecret,
      }),
    ).toThrow(AuthConfigError);

    try {
      parseAuthConfig({
        ...validEnv,
        AUTH_SECRET: weakSecret,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AuthConfigError);
      expect((error as Error).message).toContain("AUTH_SECRET");
      expect((error as Error).message).not.toContain(weakSecret);
      return;
    }

    throw new Error("Expected weak AUTH_SECRET to throw.");
  });

  it("rejects invalid session cookie and max-age values without echoing values", () => {
    const invalidCookieName = "bad cookie name";
    const invalidMaxAge = "9999";

    try {
      parseAuthConfig({
        ...validEnv,
        SESSION_COOKIE_NAME: invalidCookieName,
        SESSION_MAX_AGE_DAYS: invalidMaxAge,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AuthConfigError);
      const message = (error as Error).message;
      expect(message).toContain("SESSION_COOKIE_NAME");
      expect(message).toContain("SESSION_MAX_AGE_DAYS");
      expect(message).not.toContain(invalidCookieName);
      expect(message).not.toContain(invalidMaxAge);
      return;
    }

    throw new Error("Expected invalid session config to throw.");
  });
});

describe("session cookie options", () => {
  it("returns httpOnly, lax, path-root options with max-age and expires", () => {
    const config = parseAuthConfig(validEnv);
    const now = new Date("2026-04-26T12:00:00.000Z");

    expect(getSessionCookieOptions(config, now)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      maxAge: 2_592_000,
      expires: new Date("2026-05-26T12:00:00.000Z"),
    });
  });

  it("returns a secret-safe deletion option set for logout", () => {
    const config = parseAuthConfig({
      ...validEnv,
      NODE_ENV: "production",
    });

    expect(getExpiredSessionCookieOptions(config)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
      maxAge: 0,
      expires: new Date(0),
    });
  });
});
