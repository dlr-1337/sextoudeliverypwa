import argon2 from "argon2";
import type { Options as Argon2Options } from "argon2";

import { AuthPasswordError } from "./errors";

const ARGON2_TIMEOUT_MS = 15_000;
const ARGON2ID_OPTIONS = {
  type: argon2.argon2id,
} satisfies Argon2Options & { type: typeof argon2.argon2id };

type HashFunction = (
  password: string,
  options: Argon2Options & { type: typeof argon2.argon2id },
) => Promise<string>;

type VerifyFunction = (hash: string, password: string) => Promise<boolean>;

export type PasswordHashOptions = {
  hashFn?: HashFunction;
  timeoutMs?: number;
};

export type PasswordVerifyOptions = {
  verifyFn?: VerifyFunction;
  timeoutMs?: number;
};

export async function hashPassword(
  password: string,
  options: PasswordHashOptions = {},
) {
  const hashFn = options.hashFn ?? hashWithArgon2id;
  const timeoutMs = options.timeoutMs ?? ARGON2_TIMEOUT_MS;

  try {
    return await withTimeout(
      hashFn(password, ARGON2ID_OPTIONS),
      timeoutMs,
      "Argon2id hash timed out.",
    );
  } catch (error) {
    throw new AuthPasswordError("PASSWORD_HASH_FAILED", "hash", error);
  }
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
  options: PasswordVerifyOptions = {},
) {
  const verifyFn = options.verifyFn ?? verifyWithArgon2id;
  const timeoutMs = options.timeoutMs ?? ARGON2_TIMEOUT_MS;

  try {
    return await withTimeout(
      verifyFn(passwordHash, password),
      timeoutMs,
      "Argon2id verify timed out.",
    );
  } catch (error) {
    throw new AuthPasswordError("PASSWORD_VERIFY_FAILED", "verify", error);
  }
}

function hashWithArgon2id(
  password: string,
  options: Argon2Options & { type: typeof argon2.argon2id },
) {
  return argon2.hash(password, options);
}

function verifyWithArgon2id(hash: string, password: string) {
  return argon2.verify(hash, password);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
