import { AuthConfigError } from "./errors";

const REQUIRED_AUTH_ENV_KEYS = [
  "AUTH_SECRET",
  "SESSION_COOKIE_NAME",
  "SESSION_MAX_AGE_DAYS",
] as const;

const MIN_AUTH_SECRET_LENGTH = 32;
const MIN_SESSION_DAYS = 1;
const MAX_SESSION_DAYS = 365;
const SECONDS_PER_DAY = 24 * 60 * 60;
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export type AuthEnvKey = (typeof REQUIRED_AUTH_ENV_KEYS)[number];

export type AuthConfig = {
  authSecret: string;
  sessionCookieName: string;
  sessionMaxAgeDays: number;
  sessionMaxAgeSeconds: number;
  secureCookies: boolean;
};

export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
  expires: Date;
};

export function parseAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const invalidKeys: AuthEnvKey[] = [];

  for (const key of REQUIRED_AUTH_ENV_KEYS) {
    if (!env[key] || env[key]?.trim().length === 0) {
      invalidKeys.push(key);
    }
  }

  const authSecret = env.AUTH_SECRET?.trim() ?? "";
  const sessionCookieName = env.SESSION_COOKIE_NAME?.trim() ?? "";
  const rawSessionDays = env.SESSION_MAX_AGE_DAYS?.trim() ?? "";

  if (
    authSecret.length > 0 &&
    authSecret.length < MIN_AUTH_SECRET_LENGTH
  ) {
    invalidKeys.push("AUTH_SECRET");
  }

  if (
    sessionCookieName.length > 0 &&
    !COOKIE_NAME_PATTERN.test(sessionCookieName)
  ) {
    invalidKeys.push("SESSION_COOKIE_NAME");
  }

  const sessionMaxAgeDays = Number(rawSessionDays);
  const hasInvalidSessionDays =
    rawSessionDays.length > 0 &&
    (!Number.isInteger(sessionMaxAgeDays) ||
      sessionMaxAgeDays < MIN_SESSION_DAYS ||
      sessionMaxAgeDays > MAX_SESSION_DAYS);

  if (hasInvalidSessionDays) {
    invalidKeys.push("SESSION_MAX_AGE_DAYS");
  }

  if (invalidKeys.length > 0) {
    throw new AuthConfigError(invalidKeys);
  }

  return {
    authSecret,
    sessionCookieName,
    sessionMaxAgeDays,
    sessionMaxAgeSeconds: sessionMaxAgeDays * SECONDS_PER_DAY,
    secureCookies: shouldUseSecureCookies(env),
  };
}

export function getAuthConfig(env: NodeJS.ProcessEnv = process.env) {
  return parseAuthConfig(env);
}

export function getSessionCookieOptions(
  config: AuthConfig = getAuthConfig(),
  now: Date = new Date(),
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: config.secureCookies,
    maxAge: config.sessionMaxAgeSeconds,
    expires: new Date(now.getTime() + config.sessionMaxAgeSeconds * 1000),
  };
}

export function getExpiredSessionCookieOptions(
  config: AuthConfig = getAuthConfig(),
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: config.secureCookies,
    maxAge: 0,
    expires: new Date(0),
  };
}

function shouldUseSecureCookies(env: NodeJS.ProcessEnv) {
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? env.APP_URL;

  if (appUrl?.trim().toLowerCase().startsWith("https://")) {
    return true;
  }

  return env.NODE_ENV === "production" || env.APP_ENV === "production";
}
