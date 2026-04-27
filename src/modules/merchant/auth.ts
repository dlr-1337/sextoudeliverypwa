import "server-only";

import { redirect } from "next/navigation";

import { readSessionCookieValue } from "../auth/cookies";
import { requireMerchantSession } from "../auth/guards";
import { resolveAuthErrorRedirect } from "../auth/navigation";

const MERCHANT_PANEL_PATH = "/estabelecimento";

export async function requireMerchantPageSession() {
  try {
    const sessionToken = await readSessionCookieValue();

    return await requireMerchantSession(sessionToken);
  } catch (error) {
    redirect(resolveAuthErrorRedirect(error, MERCHANT_PANEL_PATH));
  }
}
