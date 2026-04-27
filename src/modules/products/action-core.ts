import { getPublicAuthErrorMessage } from "../auth/errors";
import type { AuthSessionContext } from "../auth/types";

import type {
  ProductDto,
  ProductFailure,
  ProductResult,
  ProductServiceCore,
} from "./service-core";
import {
  PRODUCT_FORM_FIELD_NAMES,
  type ProductActionFieldErrors,
  type ProductActionHandler,
  type ProductActionState,
  type ProductActionValues,
  type ProductFormFieldName,
} from "./action-state";

const MERCHANT_PANEL_PATH = "/estabelecimento";
const PUBLIC_STORES_PATH = "/lojas";

export const PRODUCT_ACTION_MESSAGES = {
  GENERIC_FAILURE: "Não foi possível salvar o produto. Tente novamente.",
  REVALIDATION_FAILURE:
    "Produto salvo, mas não foi possível atualizar a visualização. Recarregue a página.",
  PRODUCT_CREATED: "Produto criado com sucesso.",
  PRODUCT_UPDATED: "Produto atualizado com sucesso.",
  PRODUCT_ACTIVATED: "Produto ativado com sucesso.",
  PRODUCT_PAUSED: "Produto pausado com sucesso.",
  PRODUCT_ARCHIVED: "Produto arquivado com sucesso.",
  FIELD_FAILURE: "Revise este campo.",
} as const;

type MaybePromise<T> = T | Promise<T>;

type ProductActionService = Pick<
  ProductServiceCore,
  | "activateForOwner"
  | "archiveForOwner"
  | "createForOwner"
  | "pauseForOwner"
  | "updateForOwner"
>;

type ProductActionServiceResult = ProductResult<ProductDto>;

export type ProductActionCoreDependencies = {
  readSessionCookie: () => MaybePromise<unknown>;
  requireMerchantSession: (rawToken: unknown) => MaybePromise<AuthSessionContext>;
  productService: ProductActionService;
  revalidatePath: (path: string) => MaybePromise<void>;
};

export function createProductActionCore(
  dependencies: ProductActionCoreDependencies,
): Record<
  | "activateProductAction"
  | "archiveProductAction"
  | "createProductAction"
  | "pauseProductAction"
  | "updateProductAction",
  ProductActionHandler
> {
  return {
    activateProductAction: async (_previousState, formData) => {
      const values = getProductIdFormValues(formData);

      return runProductMutation({
        dependencies,
        serviceCall: (merchantId) =>
          dependencies.productService.activateForOwner(merchantId, values),
        successMessage: PRODUCT_ACTION_MESSAGES.PRODUCT_ACTIVATED,
        values,
      });
    },
    archiveProductAction: async (_previousState, formData) => {
      const values = getProductIdFormValues(formData);

      return runProductMutation({
        dependencies,
        serviceCall: (merchantId) =>
          dependencies.productService.archiveForOwner(merchantId, values),
        successMessage: PRODUCT_ACTION_MESSAGES.PRODUCT_ARCHIVED,
        values,
      });
    },
    createProductAction: async (_previousState, formData) => {
      const { input, values } = getCreateProductFormSubmission(formData);

      return runProductMutation({
        dependencies,
        serviceCall: (merchantId) =>
          dependencies.productService.createForOwner(merchantId, input),
        successMessage: PRODUCT_ACTION_MESSAGES.PRODUCT_CREATED,
        values,
      });
    },
    pauseProductAction: async (_previousState, formData) => {
      const values = getProductIdFormValues(formData);

      return runProductMutation({
        dependencies,
        serviceCall: (merchantId) =>
          dependencies.productService.pauseForOwner(merchantId, values),
        successMessage: PRODUCT_ACTION_MESSAGES.PRODUCT_PAUSED,
        values,
      });
    },
    updateProductAction: async (_previousState, formData) => {
      const { input, productIdInput, values } = getUpdateProductFormSubmission(formData);

      return runProductMutation({
        dependencies,
        serviceCall: (merchantId) =>
          dependencies.productService.updateForOwner(
            merchantId,
            productIdInput,
            input,
          ),
        successMessage: PRODUCT_ACTION_MESSAGES.PRODUCT_UPDATED,
        values,
      });
    },
  };
}

async function runProductMutation(options: {
  dependencies: ProductActionCoreDependencies;
  serviceCall: (merchantId: string) => Promise<ProductActionServiceResult>;
  successMessage: string;
  values: ProductActionValues;
}): Promise<ProductActionState> {
  const guard = await requireMerchantOrFailure(options.dependencies);

  if (!guard.ok) {
    return guard.state;
  }

  const result = await safelyCallProductService(() =>
    options.serviceCall(guard.session.user.id),
  );

  if (!result.ok) {
    return serviceFailureState(result, options.values, guard.session.user.id);
  }

  const revalidation = await revalidateProductPaths(
    options.dependencies,
    result.data.establishmentSlug,
  );

  if (!revalidation.ok) {
    return errorState(PRODUCT_ACTION_MESSAGES.REVALIDATION_FAILURE, {
      establishmentSlug: result.data.establishmentSlug,
      merchantId: guard.session.user.id,
      productId: result.data.id,
      values: options.values,
    });
  }

  return {
    status: "success",
    message: options.successMessage,
    establishmentSlug: result.data.establishmentSlug,
    merchantId: guard.session.user.id,
    productId: result.data.id,
  };
}

async function requireMerchantOrFailure(
  dependencies: ProductActionCoreDependencies,
): Promise<
  | { ok: true; session: AuthSessionContext }
  | { ok: false; state: ProductActionState }
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

async function safelyCallProductService(
  serviceCall: () => Promise<ProductActionServiceResult>,
): Promise<ProductActionServiceResult> {
  try {
    return await serviceCall();
  } catch {
    return {
      ok: false,
      code: "DATABASE_ERROR",
      message: PRODUCT_ACTION_MESSAGES.GENERIC_FAILURE,
    };
  }
}

async function revalidateProductPaths(
  dependencies: ProductActionCoreDependencies,
  establishmentSlug: string,
): Promise<{ ok: true } | { ok: false }> {
  const paths = [
    MERCHANT_PANEL_PATH,
    PUBLIC_STORES_PATH,
    `${PUBLIC_STORES_PATH}/${encodeURIComponent(establishmentSlug)}`,
  ];

  try {
    for (const path of paths) {
      await dependencies.revalidatePath(path);
    }

    return { ok: true };
  } catch {
    return { ok: false };
  }
}

function serviceFailureState(
  failure: ProductFailure,
  values: ProductActionValues,
  merchantId: string,
): ProductActionState {
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
    establishmentSlug?: string;
    fieldErrors?: ProductActionFieldErrors;
    formErrors?: string[];
    merchantId?: string;
    productId?: string;
    values?: ProductActionValues;
  } = {},
): ProductActionState {
  return {
    status: "error",
    message,
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
    ...(options.formErrors ? { formErrors: options.formErrors } : {}),
    ...(options.values ? { values: options.values } : {}),
    ...(options.merchantId ? { merchantId: options.merchantId } : {}),
    ...(options.productId ? { productId: options.productId } : {}),
    ...(options.establishmentSlug
      ? { establishmentSlug: options.establishmentSlug }
      : {}),
  };
}

function getCreateProductFormSubmission(formData: FormData): {
  input: ProductActionValues;
  values: ProductActionValues;
} {
  const values: ProductActionValues = {
    name: getStringFormValue(formData, "name"),
    description: getStringFormValue(formData, "description"),
    categoryId: getStringFormValue(formData, "categoryId"),
    price: getStringFormValue(formData, "price"),
  };

  return { input: { ...values }, values };
}

function getUpdateProductFormSubmission(formData: FormData): {
  input: ProductActionValues;
  productIdInput: { productId: string };
  values: ProductActionValues;
} {
  const values = getProductIdFormValues(formData);
  const input: ProductActionValues = {};

  for (const fieldName of PRODUCT_FORM_FIELD_NAMES) {
    if (!formData.has(fieldName)) {
      continue;
    }

    const value = getStringFormValue(formData, fieldName);
    values[fieldName] = value;
    input[fieldName] = value;
  }

  return {
    input,
    productIdInput: { productId: values.productId ?? "" },
    values,
  };
}

function getProductIdFormValues(formData: FormData): ProductActionValues {
  return {
    productId: getStringFormValue(formData, "productId"),
  };
}

function getStringFormValue(formData: FormData, key: ProductFormFieldName | "productId") {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function sanitizeFieldErrors(
  fieldErrors: ProductActionFieldErrors | undefined,
): ProductActionFieldErrors | undefined {
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
            safeFailureMessage(message, PRODUCT_ACTION_MESSAGES.FIELD_FAILURE),
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
  fallback: string = PRODUCT_ACTION_MESSAGES.GENERIC_FAILURE,
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
