"use server";

import { readSessionCookieValue } from "../auth/cookies";
import { requireCustomerSession } from "../auth/guards";

import { createCheckoutActionCore } from "./action-core";
import type { CheckoutActionState } from "./action-state";
import { orderService } from "./service";

const checkoutActionCore = createCheckoutActionCore({
  createCashOrder: orderService.createCashOrder,
  readSessionCookie: readSessionCookieValue,
  requireCustomerSession,
});

export async function checkoutOrderAction(
  previousState: CheckoutActionState,
  formData: FormData,
) {
  return checkoutActionCore.checkoutOrderAction(previousState, formData);
}
