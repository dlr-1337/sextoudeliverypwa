import { createHmac, randomBytes } from "node:crypto";

import { getAuthConfig } from "./config";
import { AuthError } from "./errors";

export const SESSION_TOKEN_BYTES = 32;
export const SESSION_TOKEN_MIN_LENGTH = 43;
export const SESSION_TOKEN_MAX_LENGTH = 128;
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

export type SessionTokenHashOptions =
  | { authSecret: string; env?: never }
  | { authSecret?: never; env?: NodeJS.ProcessEnv };

export function generateSessionToken(bytes: number = SESSION_TOKEN_BYTES) {
  if (!Number.isInteger(bytes) || bytes < SESSION_TOKEN_BYTES || bytes > 64) {
    throw new AuthError(
      "TOKEN_INVALID",
      "Tamanho inválido para token de sessão.",
    );
  }

  return randomBytes(bytes).toString("base64url");
}

export function isValidSessionToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    token.length >= SESSION_TOKEN_MIN_LENGTH &&
    token.length <= SESSION_TOKEN_MAX_LENGTH &&
    SESSION_TOKEN_PATTERN.test(token)
  );
}

export function assertValidSessionToken(token: unknown): asserts token is string {
  if (!isValidSessionToken(token)) {
    throw new AuthError("TOKEN_INVALID", "Formato inválido de token de sessão.");
  }
}

export function hashSessionToken(
  rawToken: string,
  options: SessionTokenHashOptions = {},
) {
  assertValidSessionToken(rawToken);

  const authSecret = options.authSecret ?? getAuthConfig(options.env).authSecret;

  return createHmac("sha256", authSecret).update(rawToken, "utf8").digest("base64url");
}
