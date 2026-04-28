"use server";

import { revalidatePath } from "next/cache";

import { readSessionCookieValue } from "../auth/cookies";
import { requireCustomerSession, requireMerchantSession } from "../auth/guards";

import {
  createCheckoutActionCore,
  createMerchantOrderTransitionActionCore,
} from "./action-core";
import type {
  CheckoutActionState,
  MerchantOrderTransitionActionState,
} from "./action-state";
import { orderService } from "./service";

const checkoutActionCore = createCheckoutActionCore({
  createCashOrder: orderService.createCashOrder,
  readSessionCookie: readSessionCookieValue,
  requireCustomerSession,
});

const merchantOrderTransitionActionCore = createMerchantOrderTransitionActionCore({
  orderService,
  readSessionCookie: readSessionCookieValue,
  requireMerchantSession,
  revalidatePath,
});

export async function checkoutOrderAction(
  previousState: CheckoutActionState,
  formData: FormData,
) {
  return checkoutActionCore.checkoutOrderAction(previousState, formData);
}

export async function transitionMerchantOrderStatusAction(
  previousState: MerchantOrderTransitionActionState,
  formData: FormData,
) {
  return merchantOrderTransitionActionCore.transitionMerchantOrderStatusAction(
    previousState,
    formData,
  );
}
