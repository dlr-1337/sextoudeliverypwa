import "server-only";

import { cookies } from "next/headers";

import {
  getAuthConfig,
  getExpiredSessionCookieOptions,
  getSessionCookieOptions,
} from "./config";

export async function readSessionCookieValue() {
  const config = getAuthConfig();
  const cookieStore = await cookies();

  return cookieStore.get(config.sessionCookieName)?.value;
}

export async function setSessionCookieValue(sessionToken: string) {
  const config = getAuthConfig();
  const cookieStore = await cookies();

  cookieStore.set(
    config.sessionCookieName,
    sessionToken,
    getSessionCookieOptions(config),
  );
}

export async function clearSessionCookieValue() {
  const config = getAuthConfig();
  const cookieStore = await cookies();

  cookieStore.set(
    config.sessionCookieName,
    "",
    getExpiredSessionCookieOptions(config),
  );
}
