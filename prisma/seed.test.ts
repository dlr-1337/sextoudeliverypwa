import argon2 from "argon2";
import { describe, expect, it } from "vitest";

import { CategoryType } from "../src/generated/prisma/client";
import {
  buildBaseCategoryPayloads,
  formatSafeError,
  hashAdminPassword,
  parseSeedEnv,
  redactSecrets,
  SeedConfigError,
} from "./seed";

const validEnv = {
  SEED_ADMIN_NAME: "Administrador Sextou",
  SEED_ADMIN_EMAIL: " Admin@Example.LOCAL ",
  SEED_ADMIN_PASSWORD: "correct horse battery staple",
};

describe("parseSeedEnv", () => {
  it("normalizes the admin email to lowercase and trims name/email", () => {
    expect(parseSeedEnv(validEnv)).toEqual({
      adminName: "Administrador Sextou",
      adminEmail: "admin@example.local",
      adminPassword: "correct horse battery staple",
    });
  });

  it("reports missing seed keys by name without leaking present secret values", () => {
    expect(() =>
      parseSeedEnv({
        SEED_ADMIN_EMAIL: "Admin@Example.LOCAL",
        SEED_ADMIN_PASSWORD: "do-not-print-this-password",
      }),
    ).toThrow(SeedConfigError);

    try {
      parseSeedEnv({
        SEED_ADMIN_EMAIL: "Admin@Example.LOCAL",
        SEED_ADMIN_PASSWORD: "do-not-print-this-password",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SeedConfigError);
      expect((error as Error).message).toContain("SEED_ADMIN_NAME");
      expect((error as Error).message).not.toContain("do-not-print-this-password");
    }
  });

  it("rejects invalid email and blank password without printing submitted values", () => {
    const secretPassword = "   ";

    try {
      parseSeedEnv({
        ...validEnv,
        SEED_ADMIN_EMAIL: "not an email",
        SEED_ADMIN_PASSWORD: secretPassword,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SeedConfigError);
      const message = (error as Error).message;
      expect(message).toContain("SEED_ADMIN_EMAIL must be a valid email address");
      expect(message).toContain("SEED_ADMIN_PASSWORD cannot be blank");
      expect(message).not.toContain("not an email");
      expect(message).not.toContain(secretPassword);
      return;
    }

    throw new Error("Expected invalid seed env to throw.");
  });
});

describe("buildBaseCategoryPayloads", () => {
  it("creates four base categories for both establishment and product types", () => {
    const payloads = buildBaseCategoryPayloads();

    expect(payloads).toHaveLength(8);
    expect(payloads.filter((payload) => payload.type === CategoryType.ESTABLISHMENT))
      .toHaveLength(4);
    expect(payloads.filter((payload) => payload.type === CategoryType.PRODUCT))
      .toHaveLength(4);
    expect(payloads.map((payload) => payload.slug)).toEqual([
      "bebidas",
      "petiscos",
      "churrascos",
      "outros",
      "bebidas",
      "petiscos",
      "churrascos",
      "outros",
    ]);
  });

  it("uses stable unique idempotency keys per slug/type pair", () => {
    const payloads = buildBaseCategoryPayloads();
    const keys = payloads.map((payload) => `${payload.type}:${payload.slug}`);

    expect(new Set(keys).size).toBe(payloads.length);
    expect(keys).toContain("ESTABLISHMENT:bebidas");
    expect(keys).toContain("PRODUCT:bebidas");
  });

  it("rejects blank or punctuation-only category names", () => {
    expect(() => buildBaseCategoryPayloads(["Bebidas", "   "]))
      .toThrow(SeedConfigError);
    expect(() => buildBaseCategoryPayloads(["Bebidas", "!!! --- ???"]))
      .toThrow(SeedConfigError);
  });
});

describe("hashAdminPassword", () => {
  it("creates an Argon2id hash instead of returning plaintext", async () => {
    const password = "correct horse battery staple";
    const hash = await hashAdminPassword(password);

    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(hash, password)).resolves.toBe(true);
  }, 10_000);

  it("wraps Argon2 failures without leaking the password", async () => {
    await expect(
      hashAdminPassword("do-not-print-this-password", {
        hashFn: async () => {
          throw new Error("native binding failed");
        },
      }),
    ).rejects.toThrow("Argon2id hashing failed (Error)");
  });
});

describe("secret redaction", () => {
  it("redacts configured secrets and Argon2 hashes from safe error output", () => {
    const env = {
      DATABASE_URL: "postgresql://user:password@localhost:5432/app",
      SEED_ADMIN_PASSWORD: "do-not-print-this-password",
      AUTH_SECRET: "super-secret-auth-key",
    };
    const message = [
      "failed for postgresql://user:password@localhost:5432/app",
      "password=do-not-print-this-password",
      "auth=super-secret-auth-key",
      "hash=$argon2id$v=19$m=65536,t=3,p=4$abc$def",
    ].join("; ");

    const redacted = redactSecrets(message, env);

    expect(redacted).not.toContain(env.DATABASE_URL);
    expect(redacted).not.toContain(env.SEED_ADMIN_PASSWORD);
    expect(redacted).not.toContain(env.AUTH_SECRET);
    expect(redacted).not.toContain("$argon2id$");
    expect(formatSafeError(new Error(message), env)).toContain(
      "[redacted:DATABASE_URL]",
    );
  });
});
