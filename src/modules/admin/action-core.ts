import { getPublicAuthErrorMessage } from "../auth/errors";
import type {
  CategoryDto,
  CategoryResult,
  CategoryServiceCore,
} from "../categories/service-core";
import type {
  EstablishmentDetailDto,
  EstablishmentResult,
  EstablishmentServiceCore,
} from "../establishments/service-core";

import type {
  AdminActionFieldErrors,
  AdminActionHandler,
  AdminActionState,
  AdminActionValues,
} from "./action-state";

const ADMIN_DASHBOARD_PATH = "/admin";
const ADMIN_CATEGORIES_PATH = "/admin/categorias";
const ADMIN_ESTABLISHMENTS_PATH = "/admin/estabelecimentos";

export const ADMIN_ACTION_MESSAGES = {
  GENERIC_FAILURE:
    "Não foi possível concluir a operação administrativa. Tente novamente.",
  REVALIDATION_FAILURE:
    "Operação concluída, mas não foi possível atualizar a visualização. Recarregue a página.",
  CATEGORY_CREATED: "Categoria criada com sucesso.",
  CATEGORY_UPDATED: "Categoria atualizada com sucesso.",
  CATEGORY_ACTIVATED: "Categoria ativada com sucesso.",
  CATEGORY_INACTIVATED: "Categoria inativada com sucesso.",
  ESTABLISHMENT_APPROVED: "Estabelecimento aprovado com sucesso.",
  ESTABLISHMENT_BLOCKED: "Estabelecimento bloqueado com sucesso.",
  ESTABLISHMENT_REACTIVATED: "Estabelecimento reativado com sucesso.",
  ESTABLISHMENT_INACTIVATED: "Estabelecimento inativado com sucesso.",
} as const;

type MaybePromise<T> = T | Promise<T>;

type AdminCategoryService = Pick<
  CategoryServiceCore,
  "create" | "update" | "activate" | "inactivate"
>;

type AdminEstablishmentService = Pick<
  EstablishmentServiceCore,
  "approve" | "block" | "reactivate" | "inactivate"
>;

type ServiceValidationErrors = {
  fieldErrors: AdminActionFieldErrors;
  formErrors: string[];
};

type ActionServiceFailure = {
  ok: false;
  message: string;
  validationErrors?: ServiceValidationErrors;
};

type ActionServiceResult<TData extends { id: string }> =
  | { ok: true; data: TData }
  | ActionServiceFailure;

export type AdminActionCoreDependencies = {
  readSessionCookie: () => MaybePromise<unknown>;
  requireAdminSession: (rawToken: unknown) => MaybePromise<unknown>;
  categoryService: AdminCategoryService;
  establishmentService: AdminEstablishmentService;
  revalidatePath: (path: string) => MaybePromise<void>;
};

export function createAdminActionCore(
  dependencies: AdminActionCoreDependencies,
): Record<
  | "createCategoryAction"
  | "updateCategoryAction"
  | "activateCategoryAction"
  | "inactivateCategoryAction"
  | "approveEstablishmentAction"
  | "blockEstablishmentAction"
  | "reactivateEstablishmentAction"
  | "inactivateEstablishmentAction",
  AdminActionHandler
> {
  return {
    createCategoryAction: async (_previousState, formData) => {
      const { input, values } = getCategoryFormSubmission(formData);

      return runCategoryMutation({
        dependencies,
        serviceCall: () => dependencies.categoryService.create(input),
        successMessage: ADMIN_ACTION_MESSAGES.CATEGORY_CREATED,
        values,
      });
    },
    updateCategoryAction: async (_previousState, formData) => {
      const { input, values } = getCategoryFormSubmission(formData, {
        includeId: true,
        includeType: false,
      });

      return runCategoryMutation({
        dependencies,
        serviceCall: () => dependencies.categoryService.update(input),
        successMessage: ADMIN_ACTION_MESSAGES.CATEGORY_UPDATED,
        values,
      });
    },
    activateCategoryAction: async (_previousState, formData) => {
      const values = getIdFormValues(formData);

      return runCategoryMutation({
        dependencies,
        serviceCall: () => dependencies.categoryService.activate(values),
        successMessage: ADMIN_ACTION_MESSAGES.CATEGORY_ACTIVATED,
        values,
      });
    },
    inactivateCategoryAction: async (_previousState, formData) => {
      const values = getIdFormValues(formData);

      return runCategoryMutation({
        dependencies,
        serviceCall: () => dependencies.categoryService.inactivate(values),
        successMessage: ADMIN_ACTION_MESSAGES.CATEGORY_INACTIVATED,
        values,
      });
    },
    approveEstablishmentAction: async (_previousState, formData) => {
      const values = getIdFormValues(formData);

      return runEstablishmentMutation({
        dependencies,
        serviceCall: () => dependencies.establishmentService.approve(values),
        successMessage: ADMIN_ACTION_MESSAGES.ESTABLISHMENT_APPROVED,
        values,
      });
    },
    blockEstablishmentAction: async (_previousState, formData) => {
      const values = getIdFormValues(formData);

      return runEstablishmentMutation({
        dependencies,
        serviceCall: () => dependencies.establishmentService.block(values),
        successMessage: ADMIN_ACTION_MESSAGES.ESTABLISHMENT_BLOCKED,
        values,
      });
    },
    reactivateEstablishmentAction: async (_previousState, formData) => {
      const values = getIdFormValues(formData);

      return runEstablishmentMutation({
        dependencies,
        serviceCall: () => dependencies.establishmentService.reactivate(values),
        successMessage: ADMIN_ACTION_MESSAGES.ESTABLISHMENT_REACTIVATED,
        values,
      });
    },
    inactivateEstablishmentAction: async (_previousState, formData) => {
      const values = getIdFormValues(formData);

      return runEstablishmentMutation({
        dependencies,
        serviceCall: () => dependencies.establishmentService.inactivate(values),
        successMessage: ADMIN_ACTION_MESSAGES.ESTABLISHMENT_INACTIVATED,
        values,
      });
    },
  };
}

async function runCategoryMutation(options: {
  dependencies: AdminActionCoreDependencies;
  serviceCall: () => Promise<CategoryResult<CategoryDto>>;
  successMessage: string;
  values: AdminActionValues;
}): Promise<AdminActionState> {
  const guardFailure = await requireAdminOrFailure(options.dependencies);

  if (guardFailure) {
    return guardFailure;
  }

  const result = await safelyCallService(options.serviceCall);

  if (!result.ok) {
    return serviceFailureState(result, options.values);
  }

  const revalidation = await revalidateAdminPaths(options.dependencies, [
    ADMIN_DASHBOARD_PATH,
    ADMIN_CATEGORIES_PATH,
  ]);

  if (!revalidation.ok) {
    return errorState(ADMIN_ACTION_MESSAGES.REVALIDATION_FAILURE);
  }

  return {
    status: "success",
    message: options.successMessage,
    categoryId: result.data.id,
  };
}

async function runEstablishmentMutation(options: {
  dependencies: AdminActionCoreDependencies;
  serviceCall: () => Promise<EstablishmentResult<EstablishmentDetailDto>>;
  successMessage: string;
  values: AdminActionValues;
}): Promise<AdminActionState> {
  const guardFailure = await requireAdminOrFailure(options.dependencies);

  if (guardFailure) {
    return guardFailure;
  }

  const result = await safelyCallService(options.serviceCall);

  if (!result.ok) {
    return serviceFailureState(result, options.values);
  }

  const detailPath = `${ADMIN_ESTABLISHMENTS_PATH}/${encodeURIComponent(
    result.data.id,
  )}`;
  const revalidation = await revalidateAdminPaths(options.dependencies, [
    ADMIN_DASHBOARD_PATH,
    ADMIN_ESTABLISHMENTS_PATH,
    detailPath,
  ]);

  if (!revalidation.ok) {
    return errorState(ADMIN_ACTION_MESSAGES.REVALIDATION_FAILURE);
  }

  return {
    status: "success",
    message: options.successMessage,
    detailId: result.data.id,
    establishmentId: result.data.id,
  };
}

async function requireAdminOrFailure(
  dependencies: AdminActionCoreDependencies,
): Promise<AdminActionState | null> {
  try {
    const rawToken = await dependencies.readSessionCookie();
    await dependencies.requireAdminSession(rawToken);

    return null;
  } catch (error) {
    return errorState(getPublicAuthErrorMessage(error));
  }
}

async function safelyCallService<TData extends { id: string }>(
  serviceCall: () => Promise<ActionServiceResult<TData>>,
): Promise<ActionServiceResult<TData>> {
  try {
    return await serviceCall();
  } catch {
    return {
      ok: false,
      message: ADMIN_ACTION_MESSAGES.GENERIC_FAILURE,
    };
  }
}

async function revalidateAdminPaths(
  dependencies: AdminActionCoreDependencies,
  paths: string[],
): Promise<{ ok: true } | { ok: false }> {
  const uniquePaths = [...new Set(paths)];

  try {
    for (const path of uniquePaths) {
      await dependencies.revalidatePath(path);
    }

    return { ok: true };
  } catch {
    return { ok: false };
  }
}

function serviceFailureState(
  failure: ActionServiceFailure,
  values: AdminActionValues,
): AdminActionState {
  return errorState(safeFailureMessage(failure.message), {
    fieldErrors: failure.validationErrors?.fieldErrors,
    formErrors: failure.validationErrors?.formErrors,
    values,
  });
}

function errorState(
  message: string,
  options: {
    fieldErrors?: AdminActionFieldErrors;
    formErrors?: string[];
    values?: AdminActionValues;
  } = {},
): AdminActionState {
  return {
    status: "error",
    message,
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
    ...(options.formErrors ? { formErrors: options.formErrors } : {}),
    ...(options.values ? { values: options.values } : {}),
  };
}

function safeFailureMessage(message: string) {
  if (!message || containsSensitiveToken(message)) {
    return ADMIN_ACTION_MESSAGES.GENERIC_FAILURE;
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
    "session token",
    "stack",
    "tokenHash",
    "Unique constraint",
  ].some((token) => message.toLowerCase().includes(token.toLowerCase()));
}

function getCategoryFormSubmission(
  formData: FormData,
  options: { includeId?: boolean; includeType?: boolean } = {},
): { input: AdminCategoryInput; values: AdminActionValues } {
  const includeType = options.includeType ?? true;
  const values: AdminActionValues = {
    ...(options.includeId ? { id: getStringFormValue(formData, "id") } : {}),
    name: getStringFormValue(formData, "name"),
    ...(includeType ? { type: getStringFormValue(formData, "type") } : {}),
    description: getStringFormValue(formData, "description"),
    displayOrder: getStringFormValue(formData, "displayOrder"),
  };
  const input: AdminCategoryInput = {
    ...(options.includeId ? { id: values.id } : {}),
    name: values.name,
    ...(includeType ? { type: values.type } : {}),
    description: values.description,
  };

  if (values.displayOrder !== "") {
    input.displayOrder = values.displayOrder;
  }

  return { input, values };
}

type AdminCategoryInput = Record<string, string | undefined>;

function getIdFormValues(formData: FormData): AdminActionValues {
  return {
    id: getStringFormValue(formData, "id"),
  };
}

function getStringFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}
