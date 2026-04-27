"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getPublicAuthErrorMessage } from "./errors";
import {
  clearSessionCookieValue,
  readSessionCookieValue,
  setSessionCookieValue,
} from "./cookies";
import { buildLoginPath, getRoleDestination, resolvePostAuthRedirect } from "./navigation";
import { authService } from "./service";
import type { AuthSessionMetadata } from "./service-core";
import type { AuthFailure, AuthFieldErrors } from "./types";

export type AuthFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: AuthFieldErrors;
  values?: Record<string, string>;
};

export async function loginAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const input = {
    email: getStringFormValue(formData, "email"),
    password: getStringFormValue(formData, "password"),
    next: getStringFormValue(formData, "next"),
  };
  const result = await authService.login(input, await getSessionMetadata());

  if (!result.ok) {
    return failureState(result, {
      email: input.email,
      next: input.next,
    });
  }

  const redirectTo = resolvePostAuthRedirect(input.next, result.data.user.role);
  const cookieSet = await safelySetSessionCookie(result.data.sessionToken);

  if (!cookieSet.ok) {
    return cookieSet.state;
  }

  redirect(redirectTo);
}

export async function registerCustomerAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const input = {
    name: getStringFormValue(formData, "name"),
    email: getStringFormValue(formData, "email"),
    password: getStringFormValue(formData, "password"),
    phone: getStringFormValue(formData, "phone"),
  };
  const result = await authService.registerCustomer(
    input,
    await getSessionMetadata(),
  );

  if (!result.ok) {
    return failureState(result, {
      email: input.email,
      name: input.name,
      phone: input.phone,
    });
  }

  const cookieSet = await safelySetSessionCookie(result.data.sessionToken);

  if (!cookieSet.ok) {
    return cookieSet.state;
  }

  redirect(getRoleDestination("CUSTOMER"));
}

export async function registerMerchantAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const input = {
    name: getStringFormValue(formData, "name"),
    email: getStringFormValue(formData, "email"),
    password: getStringFormValue(formData, "password"),
    phone: getStringFormValue(formData, "phone"),
    establishmentName: getStringFormValue(formData, "establishmentName"),
    establishmentPhone: getStringFormValue(formData, "establishmentPhone"),
  };
  const result = await authService.registerMerchant(
    input,
    await getSessionMetadata(),
  );

  if (!result.ok) {
    return failureState(result, {
      email: input.email,
      establishmentName: input.establishmentName,
      establishmentPhone: input.establishmentPhone,
      name: input.name,
      phone: input.phone,
    });
  }

  const cookieSet = await safelySetSessionCookie(result.data.sessionToken);

  if (!cookieSet.ok) {
    return cookieSet.state;
  }

  redirect(getRoleDestination("MERCHANT"));
}

export async function logoutAction(): Promise<void> {
  const sessionToken = await readSessionCookieValue().catch(() => undefined);

  if (sessionToken) {
    await authService.revokeSessionByToken(sessionToken);
  }

  await clearSessionCookieValue();
  redirect(buildLoginPath(undefined, "saida"));
}

function getStringFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

async function getSessionMetadata(): Promise<AuthSessionMetadata> {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();

  return {
    ipAddress: forwardedFor || headerStore.get("x-real-ip"),
    userAgent: headerStore.get("user-agent"),
  };
}

async function safelySetSessionCookie(sessionToken: string): Promise<
  | { ok: true }
  | {
      ok: false;
      state: AuthFormState;
    }
> {
  try {
    await setSessionCookieValue(sessionToken);

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      state: {
        status: "error",
        message: getPublicAuthErrorMessage(error),
      },
    };
  }
}

function failureState(
  failure: AuthFailure,
  values: Record<string, string>,
): AuthFormState {
  return {
    status: "error",
    fieldErrors: failure.validationErrors?.fieldErrors,
    message: failure.message,
    values,
  };
}
