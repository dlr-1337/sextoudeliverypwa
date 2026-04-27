"use server";

import { revalidatePath } from "next/cache";

import { readSessionCookieValue } from "../auth/cookies";
import { requireMerchantSession } from "../auth/guards";

import { createProductActionCore } from "./action-core";
import type { ProductActionState } from "./action-state";
import { productService } from "./service";

const productActionCore = createProductActionCore({
  productService,
  readSessionCookie: readSessionCookieValue,
  requireMerchantSession,
  revalidatePath,
});

export async function createProductAction(
  previousState: ProductActionState,
  formData: FormData,
) {
  return productActionCore.createProductAction(previousState, formData);
}

export async function updateProductAction(
  previousState: ProductActionState,
  formData: FormData,
) {
  return productActionCore.updateProductAction(previousState, formData);
}

export async function activateProductAction(
  previousState: ProductActionState,
  formData: FormData,
) {
  return productActionCore.activateProductAction(previousState, formData);
}

export async function pauseProductAction(
  previousState: ProductActionState,
  formData: FormData,
) {
  return productActionCore.pauseProductAction(previousState, formData);
}

export async function archiveProductAction(
  previousState: ProductActionState,
  formData: FormData,
) {
  return productActionCore.archiveProductAction(previousState, formData);
}
