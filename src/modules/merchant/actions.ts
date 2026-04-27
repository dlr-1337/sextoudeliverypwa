"use server";

import { revalidatePath } from "next/cache";

import { readSessionCookieValue } from "../auth/cookies";
import { requireMerchantSession } from "../auth/guards";

import { createMerchantActionCore } from "./action-core";
import type { MerchantActionState } from "./action-state";
import { merchantService } from "./service";

const merchantActionCore = createMerchantActionCore({
  readSessionCookie: readSessionCookieValue,
  requireMerchantSession,
  merchantService,
  revalidatePath,
});

export async function updateMerchantProfileAction(
  previousState: MerchantActionState,
  formData: FormData,
) {
  return merchantActionCore.updateMerchantProfileAction(previousState, formData);
}
