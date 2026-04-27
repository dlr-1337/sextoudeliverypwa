import argon2 from "argon2";
import { describe, expect, it } from "vitest";

import { AuthPasswordError } from "./errors";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword", () => {
  it("creates an Argon2id hash and never returns plaintext", async () => {
    const password = "correct horse battery staple";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(hash, password)).resolves.toBe(true);
  }, 10_000);

  it("wraps native hashing failures without leaking the password", async () => {
    const password = "do-not-print-this-password";

    await expect(
      hashPassword(password, {
        hashFn: async () => {
          throw new Error(`native binding failed for ${password}`);
        },
      }),
    ).rejects.toThrow(AuthPasswordError);

    try {
      await hashPassword(password, {
        hashFn: async () => {
          throw new Error(`native binding failed for ${password}`);
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AuthPasswordError);
      expect((error as AuthPasswordError).code).toBe("PASSWORD_HASH_FAILED");
      expect((error as Error).message).toContain("Argon2id");
      expect((error as Error).message).not.toContain(password);
      return;
    }

    throw new Error("Expected hashing failure to throw.");
  });

  it("wraps hashing timeouts without leaking input", async () => {
    const password = "timeout-password-do-not-print";

    try {
      await hashPassword(password, {
        hashFn: () => new Promise<string>(() => undefined),
        timeoutMs: 1,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AuthPasswordError);
      expect((error as AuthPasswordError).code).toBe("PASSWORD_HASH_FAILED");
      expect((error as Error).message).not.toContain(password);
      return;
    }

    throw new Error("Expected hashing timeout to throw.");
  });
});

describe("verifyPassword", () => {
  it("returns true for the original password and false for another password", async () => {
    const password = "correct horse battery staple";
    const hash = await hashPassword(password);

    await expect(verifyPassword(hash, password)).resolves.toBe(true);
    await expect(verifyPassword(hash, "wrong password")).resolves.toBe(false);
  }, 10_000);

  it("wraps Argon2 verify failures without leaking the hash or password", async () => {
    const password = "do-not-print-this-password";
    const hash = "$argon2id$v=19$m=65536,t=3,p=4$abc$def";

    try {
      await verifyPassword(hash, password, {
        verifyFn: async () => {
          throw new Error(`bad digest ${hash} for ${password}`);
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AuthPasswordError);
      expect((error as AuthPasswordError).code).toBe("PASSWORD_VERIFY_FAILED");
      expect((error as Error).message).not.toContain(password);
      expect((error as Error).message).not.toContain(hash);
      return;
    }

    throw new Error("Expected verify failure to throw.");
  });
});
