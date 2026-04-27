import { getPublicAuthErrorMessage } from "../auth/errors";
import type { AuthSessionContext } from "../auth/types";

import {
  CASH_ORDER_ERROR_MESSAGES,
  isPublicOrderCode,
  type CashOrderFailureCode,
} from "./service-core";
import {
  CHECKOUT_PAYMENT_METHODS,
  checkoutOrderPayloadSchema,
  formatCheckoutValidationErrors,
  type CheckoutOrderPayload,
  type CheckoutValidationErrors,
} from "./schemas";
import {
  CHECKOUT_ACTION_FIELD_NAMES,
  CHECKOUT_ACTION_ITEM_FIELD_NAMES,
  type CheckoutActionFieldErrors,
  type CheckoutActionFormFieldName,
  type CheckoutActionHandler,
  type CheckoutActionItemFieldName,
  type CheckoutActionItemValues,
  type CheckoutActionState,
  type CheckoutActionValues,
} from "./action-state";

export const CHECKOUT_ACTION_MESSAGES = {
  CREATED: "Pedido criado. Redirecionando para a confirmação.",
  VALIDATION_FAILED: "Revise os dados do checkout.",
  ORDER_CREATION_FAILED: "Não foi possível criar o pedido agora. Tente novamente.",
} as const;

type MaybePromise<T> = T | Promise<T>;

type CheckoutPayloadCandidate = Record<string, unknown> & {
  items: Record<string, unknown>[];
};

type NormalizedCashOrderResult =
  | {
      ok: true;
      publicCode: string;
      redirectPath: string;
    }
  | {
      ok: false;
      code: CashOrderFailureCode;
      fieldErrors: CheckoutActionFieldErrors;
    };

export type CheckoutActionCoreDependencies = {
  readSessionCookie: () => MaybePromise<unknown>;
  requireCustomerSession: (rawToken: unknown) => MaybePromise<AuthSessionContext>;
  createCashOrder: (
    customerId: string,
    payload: CheckoutOrderPayload,
  ) => MaybePromise<unknown>;
};

const CHECKOUT_ACTION_FIELD_NAME_SET = new Set<string>(
  CHECKOUT_ACTION_FIELD_NAMES,
);
const CHECKOUT_ACTION_ITEM_FIELD_NAME_SET = new Set<string>(
  CHECKOUT_ACTION_ITEM_FIELD_NAMES,
);
const CHECKOUT_PAYMENT_METHOD_SET = new Set<string>(CHECKOUT_PAYMENT_METHODS);
const CASH_ORDER_FAILURE_CODE_SET = new Set<string>(
  Object.keys(CASH_ORDER_ERROR_MESSAGES),
);

export function createCheckoutActionCore(
  dependencies: CheckoutActionCoreDependencies,
): Record<"checkoutOrderAction", CheckoutActionHandler> {
  return {
    checkoutOrderAction: async (_previousState, formData) => {
      const guard = await requireCustomerOrFailure(dependencies);

      if (!guard.ok) {
        return errorState(guard.message);
      }

      const { input, values } = getCheckoutFormSubmission(formData);
      const parsedPayload = checkoutOrderPayloadSchema.safeParse(input);

      if (!parsedPayload.success) {
        return validationFailureState(
          formatCheckoutValidationErrors(parsedPayload.error),
          values,
        );
      }

      let serviceResult: unknown;

      try {
        serviceResult = await dependencies.createCashOrder(
          guard.auth.user.id,
          parsedPayload.data,
        );
      } catch {
        return orderCreationFailureState(values);
      }

      const normalizedResult = normalizeCashOrderResult(serviceResult);

      if (!normalizedResult) {
        return orderCreationFailureState(values);
      }

      if (!normalizedResult.ok) {
        return cashOrderFailureState(normalizedResult, values);
      }

      return {
        status: "created",
        message: CHECKOUT_ACTION_MESSAGES.CREATED,
        publicCode: normalizedResult.publicCode,
        redirectPath: normalizedResult.redirectPath,
      };
    },
  };
}

async function requireCustomerOrFailure(
  dependencies: CheckoutActionCoreDependencies,
): Promise<
  | { ok: true; auth: AuthSessionContext }
  | { ok: false; message: string }
> {
  try {
    const rawToken = await dependencies.readSessionCookie();
    const auth = await dependencies.requireCustomerSession(rawToken);

    return { ok: true, auth };
  } catch (error) {
    return {
      ok: false,
      message: getPublicAuthErrorMessage(error),
    };
  }
}

function getCheckoutFormSubmission(formData: FormData): {
  input: CheckoutPayloadCandidate;
  values: CheckoutActionValues;
} {
  const input: CheckoutPayloadCandidate = { items: [] };
  const values: CheckoutActionValues = {};
  const itemsByIndex = new Map<number, Record<string, unknown>>();
  const itemValuesByIndex = new Map<number, CheckoutActionItemValues>();

  for (const fieldName of CHECKOUT_ACTION_FIELD_NAMES) {
    const value = getStringFormValue(formData, fieldName);

    input[fieldName] = value;
    values[fieldName] = getSafePreservedScalarValue(fieldName, value);
  }

  for (const [key, value] of formData.entries()) {
    const itemKey = parseCheckoutItemKey(key);

    if (itemKey) {
      const stringValue = stringifyFormValue(value);
      const item = itemsByIndex.get(itemKey.index) ?? {};
      item[itemKey.field] = coerceCheckoutItemValue(itemKey.field, stringValue);
      itemsByIndex.set(itemKey.index, item);

      if (isCheckoutActionItemFieldName(itemKey.field)) {
        const itemValues = itemValuesByIndex.get(itemKey.index) ?? {};
        itemValues[itemKey.field] = stringValue;
        itemValuesByIndex.set(itemKey.index, itemValues);
      }

      continue;
    }

    if (CHECKOUT_ACTION_FIELD_NAME_SET.has(key)) {
      continue;
    }

    if (key === "items") {
      continue;
    }

    input[key] = stringifyFormValue(value);
  }

  input.items = sortIndexedRecords(itemsByIndex);

  if (itemValuesByIndex.size > 0) {
    values.items = sortIndexedRecords(itemValuesByIndex);
  }

  return { input, values };
}

function validationFailureState(
  errors: CheckoutValidationErrors,
  values: CheckoutActionValues,
): CheckoutActionState {
  return errorState(CHECKOUT_ACTION_MESSAGES.VALIDATION_FAILED, {
    fieldErrors: errors.fieldErrors,
    formErrors: errors.formErrors,
    values,
  });
}

function cashOrderFailureState(
  failure: Extract<NormalizedCashOrderResult, { ok: false }>,
  values: CheckoutActionValues,
): CheckoutActionState {
  const message = CASH_ORDER_ERROR_MESSAGES[failure.code];
  const fieldErrors = sanitizeServiceFieldErrors(failure.fieldErrors, message);

  return errorState(message, {
    fieldErrors,
    formErrors: [message],
    values,
  });
}

function orderCreationFailureState(values: CheckoutActionValues): CheckoutActionState {
  return errorState(CHECKOUT_ACTION_MESSAGES.ORDER_CREATION_FAILED, {
    formErrors: [CHECKOUT_ACTION_MESSAGES.ORDER_CREATION_FAILED],
    values,
  });
}

function errorState(
  message: string,
  options: {
    fieldErrors?: CheckoutActionFieldErrors;
    formErrors?: string[];
    values?: CheckoutActionValues;
  } = {},
): CheckoutActionState {
  return {
    status: "error",
    message,
    ...(hasFieldErrors(options.fieldErrors)
      ? { fieldErrors: options.fieldErrors }
      : {}),
    ...(options.formErrors ? { formErrors: options.formErrors } : {}),
    ...(options.values ? { values: options.values } : {}),
  };
}

function normalizeCashOrderResult(result: unknown): NormalizedCashOrderResult | null {
  if (!isRecord(result)) {
    return null;
  }

  if (result.ok === true) {
    const data = result.data;

    if (!isRecord(data)) {
      return null;
    }

    const publicCode = data.publicCode;
    const redirectPath = data.redirectPath;

    if (
      typeof publicCode !== "string" ||
      typeof redirectPath !== "string" ||
      !isPublicOrderCode(publicCode) ||
      redirectPath !== `/pedido/${publicCode}`
    ) {
      return null;
    }

    return {
      ok: true,
      publicCode,
      redirectPath,
    };
  }

  if (result.ok === false && isCashOrderFailureCode(result.code)) {
    return {
      ok: false,
      code: result.code,
      fieldErrors: normalizeServiceFieldErrors(result.fieldErrors),
    };
  }

  return null;
}

function normalizeServiceFieldErrors(input: unknown): CheckoutActionFieldErrors {
  if (!isRecord(input)) {
    return {};
  }

  const fieldErrors: CheckoutActionFieldErrors = {};

  for (const [field, value] of Object.entries(input)) {
    if (!Array.isArray(value) || value.length < 1) {
      continue;
    }

    fieldErrors[field] = [];
  }

  return fieldErrors;
}

function sanitizeServiceFieldErrors(
  fieldErrors: CheckoutActionFieldErrors,
  message: string,
): CheckoutActionFieldErrors {
  const sanitizedFieldErrors: CheckoutActionFieldErrors = {};

  for (const field of Object.keys(fieldErrors)) {
    if (!isAllowedServiceFieldErrorKey(field)) {
      continue;
    }

    sanitizedFieldErrors[field] = [message];
  }

  return sanitizedFieldErrors;
}

function isAllowedServiceFieldErrorKey(field: string) {
  return (
    field === "items" ||
    CHECKOUT_ACTION_FIELD_NAME_SET.has(field) ||
    /^items\.\d+\.(productId|quantity)$/u.test(field)
  );
}

function isCashOrderFailureCode(code: unknown): code is CashOrderFailureCode {
  return typeof code === "string" && CASH_ORDER_FAILURE_CODE_SET.has(code);
}

function hasFieldErrors(
  fieldErrors: CheckoutActionFieldErrors | undefined,
): fieldErrors is CheckoutActionFieldErrors {
  return Boolean(fieldErrors && Object.keys(fieldErrors).length > 0);
}

function parseCheckoutItemKey(
  key: string,
): { index: number; field: string } | null {
  const dotMatch = /^items\.(\d+)\.([^.[\]]+)$/u.exec(key);
  const bracketMatch = /^items\[(\d+)\]\[([^\]]+)\]$/u.exec(key);
  const match = dotMatch ?? bracketMatch;

  if (!match) {
    return null;
  }

  return {
    index: Number(match[1]),
    field: match[2],
  };
}

function coerceCheckoutItemValue(field: string, value: string) {
  if (field === "quantity") {
    return Number(value);
  }

  return value;
}

function getStringFormValue(
  formData: FormData,
  key: CheckoutActionFormFieldName,
) {
  return stringifyFormValue(formData.get(key));
}

function stringifyFormValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function getSafePreservedScalarValue(
  fieldName: CheckoutActionFormFieldName,
  value: string,
) {
  if (fieldName === "paymentMethod" && !CHECKOUT_PAYMENT_METHOD_SET.has(value)) {
    return "";
  }

  return value;
}

function isCheckoutActionItemFieldName(
  field: string,
): field is CheckoutActionItemFieldName {
  return CHECKOUT_ACTION_ITEM_FIELD_NAME_SET.has(field);
}

function sortIndexedRecords<T>(records: Map<number, T>) {
  return [...records.entries()]
    .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
    .map(([, record]) => record);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
