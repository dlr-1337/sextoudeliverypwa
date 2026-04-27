import { getPublicAuthErrorMessage } from "../auth/errors";
import type { AuthSessionContext } from "../auth/types";

import type {
  MerchantEstablishmentDto,
  MerchantResult,
  MerchantServiceCore,
} from "./service-core";
import {
  MERCHANT_PROFILE_FIELD_NAMES,
  type MerchantActionFieldErrors,
  type MerchantActionHandler,
  type MerchantActionState,
  type MerchantActionValues,
  type MerchantProfileFieldName,
} from "./action-state";

const MERCHANT_PANEL_PATH = "/estabelecimento";

export const MERCHANT_ACTION_MESSAGES = {
  GENERIC_FAILURE:
    "Não foi possível salvar o perfil do estabelecimento. Tente novamente.",
  REVALIDATION_FAILURE:
    "Perfil salvo, mas não foi possível atualizar a visualização. Recarregue a página.",
  PROFILE_UPDATED: "Perfil do estabelecimento atualizado com sucesso.",
  FIELD_FAILURE: "Revise este campo.",
} as const;

type MaybePromise<T> = T | Promise<T>;

type MerchantProfileService = Pick<MerchantServiceCore, "updateProfileForOwner">;

type ActionServiceFailure = Extract<
  Awaited<ReturnType<MerchantProfileService["updateProfileForOwner"]>>,
  { ok: false }
>;

type ActionServiceResult = MerchantResult<MerchantEstablishmentDto>;

export type MerchantActionCoreDependencies = {
  readSessionCookie: () => MaybePromise<unknown>;
  requireMerchantSession: (rawToken: unknown) => MaybePromise<AuthSessionContext>;
  merchantService: MerchantProfileService;
  revalidatePath: (path: string) => MaybePromise<void>;
};

export function createMerchantActionCore(
  dependencies: MerchantActionCoreDependencies,
): Record<"updateMerchantProfileAction", MerchantActionHandler> {
  return {
    updateMerchantProfileAction: async (_previousState, formData) => {
      const guard = await requireMerchantOrFailure(dependencies);

      if (!guard.ok) {
        return guard.state;
      }

      const { input, values } = getProfileFormSubmission(formData);
      const result = await safelyCallService(() =>
        dependencies.merchantService.updateProfileForOwner(
          guard.session.user.id,
          input,
        ),
      );

      if (!result.ok) {
        return serviceFailureState(result, values, guard.session.user.id);
      }

      const revalidation = await revalidateMerchantPanel(dependencies);

      if (!revalidation.ok) {
        return errorState(MERCHANT_ACTION_MESSAGES.REVALIDATION_FAILURE, {
          establishmentId: result.data.id,
          merchantId: guard.session.user.id,
          values,
        });
      }

      return {
        status: "success",
        message: MERCHANT_ACTION_MESSAGES.PROFILE_UPDATED,
        establishmentId: result.data.id,
        merchantId: guard.session.user.id,
      };
    },
  };
}

async function requireMerchantOrFailure(
  dependencies: MerchantActionCoreDependencies,
): Promise<
  | { ok: true; session: AuthSessionContext }
  | { ok: false; state: MerchantActionState }
> {
  try {
    const rawToken = await dependencies.readSessionCookie();
    const session = await dependencies.requireMerchantSession(rawToken);

    return { ok: true, session };
  } catch (error) {
    return {
      ok: false,
      state: errorState(getPublicAuthErrorMessage(error)),
    };
  }
}

async function safelyCallService(
  serviceCall: () => Promise<ActionServiceResult>,
): Promise<ActionServiceResult> {
  try {
    return await serviceCall();
  } catch {
    return {
      ok: false,
      code: "DATABASE_ERROR",
      message: MERCHANT_ACTION_MESSAGES.GENERIC_FAILURE,
    };
  }
}

async function revalidateMerchantPanel(
  dependencies: MerchantActionCoreDependencies,
): Promise<{ ok: true } | { ok: false }> {
  try {
    await dependencies.revalidatePath(MERCHANT_PANEL_PATH);

    return { ok: true };
  } catch {
    return { ok: false };
  }
}

function serviceFailureState(
  failure: ActionServiceFailure,
  values: MerchantActionValues,
  merchantId: string,
): MerchantActionState {
  return errorState(safeFailureMessage(failure.message), {
    fieldErrors: sanitizeFieldErrors(failure.validationErrors?.fieldErrors),
    formErrors: sanitizeFormErrors(failure.validationErrors?.formErrors),
    merchantId,
    values,
  });
}

function errorState(
  message: string,
  options: {
    establishmentId?: string;
    fieldErrors?: MerchantActionFieldErrors;
    formErrors?: string[];
    merchantId?: string;
    values?: MerchantActionValues;
  } = {},
): MerchantActionState {
  return {
    status: "error",
    message,
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
    ...(options.formErrors ? { formErrors: options.formErrors } : {}),
    ...(options.values ? { values: options.values } : {}),
    ...(options.merchantId ? { merchantId: options.merchantId } : {}),
    ...(options.establishmentId
      ? { establishmentId: options.establishmentId }
      : {}),
  };
}

function getProfileFormSubmission(formData: FormData): {
  input: MerchantActionValues;
  values: MerchantActionValues;
} {
  const values: MerchantActionValues = {
    name: getStringFormValue(formData, "name"),
  };
  const input: MerchantActionValues = {
    name: values.name,
  };

  for (const fieldName of MERCHANT_PROFILE_FIELD_NAMES) {
    if (fieldName === "name") {
      continue;
    }

    if (!formData.has(fieldName)) {
      continue;
    }

    const value = getStringFormValue(formData, fieldName);
    values[fieldName] = value;
    input[fieldName] = value;
  }

  return { input, values };
}

function getStringFormValue(formData: FormData, key: MerchantProfileFieldName) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function sanitizeFieldErrors(
  fieldErrors: MerchantActionFieldErrors | undefined,
): MerchantActionFieldErrors | undefined {
  if (!fieldErrors) {
    return undefined;
  }

  const sanitizedEntries = Object.entries(fieldErrors).flatMap(
    ([field, messages]) => {
      if (!messages?.length) {
        return [];
      }

      return [
        [
          field,
          messages.map((message) =>
            safeFailureMessage(message, MERCHANT_ACTION_MESSAGES.FIELD_FAILURE),
          ),
        ],
      ];
    },
  );

  return Object.fromEntries(sanitizedEntries);
}

function sanitizeFormErrors(formErrors: string[] | undefined) {
  if (!formErrors) {
    return undefined;
  }

  return formErrors.map((message) => safeFailureMessage(message));
}

function safeFailureMessage(
  message: string,
  fallback: string = MERCHANT_ACTION_MESSAGES.GENERIC_FAILURE,
) {
  if (!message || containsSensitiveToken(message)) {
    return fallback;
  }

  return message;
}

function containsSensitiveToken(message: string) {
  return [
    "AUTH_SECRET",
    "DATABASE_URL",
    "password",
    "passwordHash",
    "Prisma",
    "raw upload",
    "session token",
    "stack",
    "tokenHash",
    "Unique constraint",
  ].some((token) => message.toLowerCase().includes(token.toLowerCase()));
}
