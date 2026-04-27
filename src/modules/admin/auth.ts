import "server-only";

import { redirect } from "next/navigation";

import { readSessionCookieValue } from "../auth/cookies";
import { requireAdminSession } from "../auth/guards";
import { resolveAuthErrorRedirect } from "../auth/navigation";

export async function requireAdminPageSession(currentPath: `/${string}`) {
  try {
    const sessionToken = await readSessionCookieValue();

    return await requireAdminSession(sessionToken);
  } catch (error) {
    redirect(resolveAuthErrorRedirect(error, currentPath));
  }
}
