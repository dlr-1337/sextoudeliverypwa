import { getPublicAuthErrorMessage } from "../auth/errors";
import type { AuthSessionContext } from "../auth/types";

import {
  CASH_ORDER_ERROR_MESSAGES,
  MERCHANT_ORDER_TRANSITION_ERROR_MESSAGES,
  MERCHANT_ORDER_TRANSITION_NOTE_MAX_LENGTH,
  ORDER_STATUS_VALUES,
  isPublicOrderCode,
  type CashOrderFailureCode,
  type MerchantOrderTransitionFailureCode,
  type OrderStatusValue,
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
  MERCHANT_ORDER_TRANSITION_ACTION_FIELD_NAMES,
  type CheckoutActionFieldErrors,
  type CheckoutActionFormFieldName,
  type CheckoutActionHandler,
  type CheckoutActionItemFieldName,
  type CheckoutActionItemValues,
  type CheckoutActionState,
  type CheckoutActionValues,
  type MerchantOrderTransitionActionFieldErrors,
  type MerchantOrderTransitionActionHandler,
  type MerchantOrderTransitionActionState,
  type MerchantOrderTransitionActionValueFieldName,
  type MerchantOrderTransitionActionValues,
} from "./action-state";

export const CHECKOUT_ACTION_MESSAGES = {
  CREATED: "Pedido criado. Redirecionando para a confirmação.",
  VALIDATION_FAILED: "Revise os dados do checkout.",
  ORDER_CREATION_FAILED: "Não foi possível criar o pedido agora. Tente novamente.",
} as const;

export const MERCHANT_ORDER_TRANSITION_ACTION_MESSAGES = {
  SUCCESS: "Pedido atualizado com sucesso.",
  GENERIC_FAILURE: "Não foi possível atualizar o pedido agora. Tente novamente.",
  REVALIDATION_FAILURE:
    "Pedido atualizado, mas não foi possível atualizar a visualização. Recarregue a página.",
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

type MerchantOrderTransitionPayloadCandidate = {
  orderId: string;
  expectedStatus: string;
  targetStatus: string;
  note: string;
};

type MerchantOrderTransitionActionService = {
  transitionMerchantOrderStatusForOwner: (
    ownerId: string,
    input: MerchantOrderTransitionPayloadCandidate,
  ) => MaybePromise<unknown>;
};

type NormalizedMerchantOrderTransitionData = {
  publicCode: string;
  previousStatus: OrderStatusValue;
  currentStatus: OrderStatusValue;
  note: string | null;
  changedAt: string;
};

type NormalizedMerchantOrderTransitionResult =
  | {
      ok: true;
      data: NormalizedMerchantOrderTransitionData;
    }
  | {
      ok: false;
      code: MerchantOrderTransitionFailureCode;
    };

export type CheckoutActionCoreDependencies = {
  readSessionCookie: () => MaybePromise<unknown>;
  requireCustomerSession: (rawToken: unknown) => MaybePromise<AuthSessionContext>;
  createCashOrder: (
    customerId: string,
    payload: CheckoutOrderPayload,
  ) => MaybePromise<unknown>;
};

export type MerchantOrderTransitionActionCoreDependencies = {
  readSessionCookie: () => MaybePromise<unknown>;
  requireMerchantSession: (rawToken: unknown) => MaybePromise<AuthSessionContext>;
  orderService: MerchantOrderTransitionActionService;
  revalidatePath: (path: string) => MaybePromise<void>;
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
const MERCHANT_ORDER_TRANSITION_ACTION_FIELD_NAME_SET = new Set<string>(
  MERCHANT_ORDER_TRANSITION_ACTION_FIELD_NAMES,
);
const MERCHANT_ORDER_TRANSITION_RECOVERY_FIELD_NAME_SET = new Set<string>([
  "targetStatus",
  "note",
] satisfies MerchantOrderTransitionActionValueFieldName[]);
const ORDER_STATUS_VALUE_SET = new Set<string>(ORDER_STATUS_VALUES);
const MERCHANT_ORDER_TRANSITION_FAILURE_CODE_SET = new Set<string>(
  Object.keys(MERCHANT_ORDER_TRANSITION_ERROR_MESSAGES),
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

export function createMerchantOrderTransitionActionCore(
  dependencies: MerchantOrderTransitionActionCoreDependencies,
): Record<
  "transitionMerchantOrderStatusAction",
  MerchantOrderTransitionActionHandler
> {
  return {
    transitionMerchantOrderStatusAction: async (_previousState, formData) => {
      const guard = await requireMerchantOrFailure(dependencies);

      if (!guard.ok) {
        return guard.state;
      }

      const { input, values } = getMerchantOrderTransitionFormSubmission(formData);
      let serviceResult: unknown;

      try {
        serviceResult = await dependencies.orderService.transitionMerchantOrderStatusForOwner(
          guard.auth.user.id,
          input,
        );
      } catch {
        return merchantOrderTransitionGenericFailureState(values);
      }

      const normalizedResult = normalizeMerchantOrderTransitionResult(serviceResult);

      if (!normalizedResult) {
        return merchantOrderTransitionGenericFailureState(values);
      }

      if (!normalizedResult.ok) {
        return merchantOrderTransitionFailureState(normalizedResult, values);
      }

      const revalidation = await revalidateMerchantOrderTransitionPaths(
        dependencies,
        input.orderId,
        normalizedResult.data.publicCode,
      );

      return merchantOrderTransitionSuccessState(
        normalizedResult.data,
        revalidation.ok
          ? MERCHANT_ORDER_TRANSITION_ACTION_MESSAGES.SUCCESS
          : MERCHANT_ORDER_TRANSITION_ACTION_MESSAGES.REVALIDATION_FAILURE,
      );
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

async function requireMerchantOrFailure(
  dependencies: MerchantOrderTransitionActionCoreDependencies,
): Promise<
  | { ok: true; auth: AuthSessionContext }
  | { ok: false; state: MerchantOrderTransitionActionState }
> {
  try {
    const rawToken = await dependencies.readSessionCookie();
    const auth = await dependencies.requireMerchantSession(rawToken);

    return { ok: true, auth };
  } catch (error) {
    return {
      ok: false,
      state: merchantOrderTransitionErrorState(getPublicAuthErrorMessage(error)),
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

function getMerchantOrderTransitionFormSubmission(formData: FormData): {
  input: MerchantOrderTransitionPayloadCandidate;
  values: MerchantOrderTransitionActionValues;
} {
  const input: MerchantOrderTransitionPayloadCandidate = {
    orderId: "",
    expectedStatus: "",
    targetStatus: "",
    note: "",
  };
  const values: MerchantOrderTransitionActionValues = {};

  for (const fieldName of MERCHANT_ORDER_TRANSITION_ACTION_FIELD_NAMES) {
    const value = stringifyFormValue(formData.get(fieldName));
    input[fieldName] = value;

    if (isMerchantOrderTransitionRecoveryFieldName(fieldName)) {
      values[fieldName] = getSafePreservedMerchantOrderTransitionValue(
        fieldName,
        value,
      );
    }
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

function merchantOrderTransitionSuccessState(
  data: NormalizedMerchantOrderTransitionData,
  message: string,
): MerchantOrderTransitionActionState {
  return {
    status: "success",
    message,
    publicCode: data.publicCode,
    previousStatus: data.previousStatus,
    currentStatus: data.currentStatus,
    note: data.note,
    changedAt: data.changedAt,
  };
}

function merchantOrderTransitionFailureState(
  failure: Extract<NormalizedMerchantOrderTransitionResult, { ok: false }>,
  values: MerchantOrderTransitionActionValues,
): MerchantOrderTransitionActionState {
  const message = MERCHANT_ORDER_TRANSITION_ERROR_MESSAGES[failure.code];

  return merchantOrderTransitionErrorState(message, {
    fieldErrors: merchantOrderTransitionFieldErrors(failure.code, message),
    formErrors: [message],
    values,
  });
}

function merchantOrderTransitionGenericFailureState(
  values: MerchantOrderTransitionActionValues,
): MerchantOrderTransitionActionState {
  return merchantOrderTransitionErrorState(
    MERCHANT_ORDER_TRANSITION_ACTION_MESSAGES.GENERIC_FAILURE,
    {
      formErrors: [MERCHANT_ORDER_TRANSITION_ACTION_MESSAGES.GENERIC_FAILURE],
      values,
    },
  );
}

function merchantOrderTransitionErrorState(
  message: string,
  options: {
    fieldErrors?: MerchantOrderTransitionActionFieldErrors;
    formErrors?: string[];
    values?: MerchantOrderTransitionActionValues;
  } = {},
): MerchantOrderTransitionActionState {
  return {
    status: "error",
    message,
    ...(hasMerchantOrderTransitionFieldErrors(options.fieldErrors)
      ? { fieldErrors: options.fieldErrors }
      : {}),
    ...(options.formErrors ? { formErrors: options.formErrors } : {}),
    ...(options.values ? { values: options.values } : {}),
  };
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

function normalizeMerchantOrderTransitionResult(
  result: unknown,
): NormalizedMerchantOrderTransitionResult | null {
  if (!isRecord(result)) {
    return null;
  }

  if (result.ok === true) {
    const data = result.data;

    if (!isRecord(data)) {
      return null;
    }

    const publicCode = data.publicCode;
    const previousStatus = data.previousStatus;
    const currentStatus = data.status;
    const note = data.note;
    const changedAt = data.changedAt;

    if (
      typeof publicCode !== "string" ||
      !isPublicOrderCode(publicCode) ||
      !isOrderStatusValue(previousStatus) ||
      !isOrderStatusValue(currentStatus) ||
      !isMerchantOrderTransitionNote(note) ||
      !isValidDate(changedAt)
    ) {
      return null;
    }

    return {
      ok: true,
      data: {
        publicCode,
        previousStatus,
        currentStatus,
        note,
        changedAt: changedAt.toISOString(),
      },
    };
  }

  if (
    result.ok === false &&
    isMerchantOrderTransitionFailureCode(result.code)
  ) {
    return {
      ok: false,
      code: result.code,
    };
  }

  return null;
}

async function revalidateMerchantOrderTransitionPaths(
  dependencies: Pick<MerchantOrderTransitionActionCoreDependencies, "revalidatePath">,
  orderId: string,
  publicCode: string,
): Promise<{ ok: true } | { ok: false }> {
  const paths = [
    "/estabelecimento",
    "/estabelecimento/pedidos",
    `/estabelecimento/pedidos/${encodeURIComponent(orderId)}`,
    `/pedido/${encodeURIComponent(publicCode)}`,
  ];
  let ok = true;

  for (const path of paths) {
    try {
      await dependencies.revalidatePath(path);
    } catch {
      ok = false;
    }
  }

  return ok ? { ok: true } : { ok: false };
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

function isMerchantOrderTransitionFailureCode(
  code: unknown,
): code is MerchantOrderTransitionFailureCode {
  return (
    typeof code === "string" &&
    MERCHANT_ORDER_TRANSITION_FAILURE_CODE_SET.has(code)
  );
}

function merchantOrderTransitionFieldErrors(
  code: MerchantOrderTransitionFailureCode,
  message: string,
): MerchantOrderTransitionActionFieldErrors {
  switch (code) {
    case "INVALID_NOTE":
      return { note: [message] };
    case "INVALID_STATUS":
    case "INVALID_TRANSITION":
      return { targetStatus: [message] };
    case "INVALID_OWNER":
    case "INVALID_ORDER":
    case "ESTABLISHMENT_NOT_FOUND":
    case "INACTIVE_ESTABLISHMENT":
    case "ORDER_NOT_FOUND":
    case "STALE_STATUS":
    case "DATABASE_ERROR":
      return {};
  }
}

function hasFieldErrors(
  fieldErrors: CheckoutActionFieldErrors | undefined,
): fieldErrors is CheckoutActionFieldErrors {
  return Boolean(fieldErrors && Object.keys(fieldErrors).length > 0);
}

function hasMerchantOrderTransitionFieldErrors(
  fieldErrors: MerchantOrderTransitionActionFieldErrors | undefined,
): fieldErrors is MerchantOrderTransitionActionFieldErrors {
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

function getSafePreservedMerchantOrderTransitionValue(
  fieldName: MerchantOrderTransitionActionValueFieldName,
  value: string,
) {
  if (fieldName === "targetStatus") {
    return ORDER_STATUS_VALUE_SET.has(value) ? value : "";
  }

  if (value.length > MERCHANT_ORDER_TRANSITION_NOTE_MAX_LENGTH) {
    return "";
  }

  return value;
}

function isMerchantOrderTransitionRecoveryFieldName(
  field: string,
): field is MerchantOrderTransitionActionValueFieldName {
  return (
    MERCHANT_ORDER_TRANSITION_ACTION_FIELD_NAME_SET.has(field) &&
    MERCHANT_ORDER_TRANSITION_RECOVERY_FIELD_NAME_SET.has(field)
  );
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

function isOrderStatusValue(value: unknown): value is OrderStatusValue {
  return typeof value === "string" && ORDER_STATUS_VALUE_SET.has(value);
}

function isMerchantOrderTransitionNote(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length <= MERCHANT_ORDER_TRANSITION_NOTE_MAX_LENGTH)
  );
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
