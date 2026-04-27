"use server";

import { revalidatePath } from "next/cache";

import { readSessionCookieValue } from "../auth/cookies";
import { requireAdminSession } from "../auth/guards";
import { categoryService } from "../categories/service";
import { establishmentService } from "../establishments/service";

import { createAdminActionCore } from "./action-core";
import type { AdminActionState } from "./action-state";

const adminActionCore = createAdminActionCore({
  readSessionCookie: readSessionCookieValue,
  requireAdminSession,
  categoryService,
  establishmentService,
  revalidatePath,
});

export async function createCategoryAction(
  previousState: AdminActionState,
  formData: FormData,
) {
  return adminActionCore.createCategoryAction(previousState, formData);
}

export async function updateCategoryAction(
  previousState: AdminActionState,
  formData: FormData,
) {
  return adminActionCore.updateCategoryAction(previousState, formData);
}

export async function activateCategoryAction(
  previousState: AdminActionState,
  formData: FormData,
) {
  return adminActionCore.activateCategoryAction(previousState, formData);
}

export async function inactivateCategoryAction(
  previousState: AdminActionState,
  formData: FormData,
) {
  return adminActionCore.inactivateCategoryAction(previousState, formData);
}

export async function approveEstablishmentAction(
  previousState: AdminActionState,
  formData: FormData,
) {
  return adminActionCore.approveEstablishmentAction(previousState, formData);
}

export async function blockEstablishmentAction(
  previousState: AdminActionState,
  formData: FormData,
) {
  return adminActionCore.blockEstablishmentAction(previousState, formData);
}

export async function reactivateEstablishmentAction(
  previousState: AdminActionState,
  formData: FormData,
) {
  return adminActionCore.reactivateEstablishmentAction(previousState, formData);
}

export async function inactivateEstablishmentAction(
  previousState: AdminActionState,
  formData: FormData,
) {
  return adminActionCore.inactivateEstablishmentAction(previousState, formData);
}
