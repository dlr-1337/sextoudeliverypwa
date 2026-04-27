import { z } from "zod";

const REQUIRED_FIELD_MESSAGE = "Campo obrigatório.";
const FORBIDDEN_FIELD_MESSAGE = "Campo não permitido.";
const MONEY_REQUIRED_MESSAGE = "Informe o preço do produto.";
const MONEY_INVALID_MESSAGE = "Informe um valor em dinheiro válido.";
const MONEY_POSITIVE_MESSAGE = "Informe um valor maior que zero.";
const UPLOAD_PATH_INVALID_MESSAGE = "Informe um caminho de upload válido.";
export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;

export type ProductStatusValue = (typeof PRODUCT_STATUSES)[number];
export type ProductFieldErrors = Record<string, string[]>;
export type ProductValidationErrors = {
  fieldErrors: ProductFieldErrors;
  formErrors: string[];
};

const idSchema = (message: string) =>
  z
    .string({ error: REQUIRED_FIELD_MESSAGE })
    .trim()
    .min(1, message)
    .max(128, "Informe um identificador com até 128 caracteres.");

const nameSchema = z
  .string({ error: REQUIRED_FIELD_MESSAGE })
  .trim()
  .min(2, "Informe um nome com pelo menos 2 caracteres.")
  .max(120, "Informe um nome com até 120 caracteres.");

const nullableTextSchema = (max: number, message: string) =>
  z
    .string({ error: REQUIRED_FIELD_MESSAGE })
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      return value.length > 0 ? value : null;
    });

const categoryIdSchema = z
  .string({ error: REQUIRED_FIELD_MESSAGE })
  .trim()
  .max(128, "Informe um identificador com até 128 caracteres.")
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    return value.length > 0 ? value : null;
  });

const requiredMoneySchema = z.unknown().transform((value, context) =>
  parseMoneyValue(value, context, { required: true }),
);

const optionalMoneySchema = z
  .unknown()
  .optional()
  .transform((value, context): string | undefined | typeof z.NEVER => {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === "string" && value.trim().length === 0) {
      return undefined;
    }

    return parseMoneyValue(value, context, { required: false });
  });

const uploadPathSchema = z.unknown().transform((value, context): string | null => {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    context.addIssue({ code: "custom", message: "Informe o caminho da foto." });
    return z.NEVER;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  if (trimmedValue.length > 2048) {
    context.addIssue({
      code: "custom",
      message: "Informe um caminho de upload com até 2048 caracteres.",
    });
    return z.NEVER;
  }

  if (
    !trimmedValue.startsWith("/uploads/") ||
    trimmedValue.includes("\\") ||
    trimmedValue.includes("../") ||
    trimmedValue.includes("/..")
  ) {
    context.addIssue({ code: "custom", message: UPLOAD_PATH_INVALID_MESSAGE });
    return z.NEVER;
  }

  return trimmedValue;
});

export const productOwnerInputSchema = z
  .object({
    ownerId: idSchema("Informe o identificador do comerciante."),
  })
  .strict();

export const productIdInputSchema = z
  .object({
    productId: idSchema("Informe o identificador do produto."),
  })
  .strict();

export const productLifecycleInputSchema = productIdInputSchema;

export const createProductSchema = z
  .object({
    name: nameSchema,
    description: nullableTextSchema(
      500,
      "Informe uma descrição com até 500 caracteres.",
    ),
    categoryId: categoryIdSchema,
    price: requiredMoneySchema,
  })
  .strict()
  .transform(({ categoryId, description, name, price }) => ({
    name,
    description: description ?? null,
    categoryId: categoryId ?? null,
    price,
  }));

export const updateProductSchema = z
  .object({
    name: nameSchema.optional(),
    description: nullableTextSchema(
      500,
      "Informe uma descrição com até 500 caracteres.",
    ),
    categoryId: categoryIdSchema,
    price: optionalMoneySchema,
  })
  .strict();

export const productImageUrlInputSchema = z
  .object({
    imageUrl: uploadPathSchema,
  })
  .strict();

export type ProductOwnerInput = z.infer<typeof productOwnerInputSchema>;
export type ProductIdInput = z.infer<typeof productIdInputSchema>;
export type ProductLifecycleInput = z.infer<typeof productLifecycleInputSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductImageUrlInput = z.infer<typeof productImageUrlInputSchema>;

export function formatProductValidationErrors(
  error: z.ZodError,
): ProductValidationErrors {
  const fieldErrors: ProductFieldErrors = {};
  const formErrors: string[] = [];

  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        addFieldError(fieldErrors, key, FORBIDDEN_FIELD_MESSAGE);
      }
      continue;
    }

    const [field] = issue.path;

    if (typeof field === "string") {
      addFieldError(fieldErrors, field, issue.message);
    } else {
      formErrors.push(issue.message);
    }
  }

  return { fieldErrors, formErrors };
}

function parseMoneyValue(
  value: unknown,
  context: z.RefinementCtx,
  options: { required: boolean },
): string | typeof z.NEVER {
  if (value === undefined || value === null) {
    context.addIssue({ code: "custom", message: MONEY_REQUIRED_MESSAGE });
    return z.NEVER;
  }

  if (typeof value === "number") {
    return parseMoneyNumber(value, context);
  }

  if (typeof value !== "string") {
    context.addIssue({ code: "custom", message: MONEY_INVALID_MESSAGE });
    return z.NEVER;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    context.addIssue({
      code: "custom",
      message: options.required ? MONEY_REQUIRED_MESSAGE : MONEY_INVALID_MESSAGE,
    });
    return z.NEVER;
  }

  if (trimmedValue.startsWith("-")) {
    context.addIssue({ code: "custom", message: MONEY_POSITIVE_MESSAGE });
    return z.NEVER;
  }

  const normalizedValue = trimmedValue.replace(",", ".");

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedValue)) {
    context.addIssue({ code: "custom", message: MONEY_INVALID_MESSAGE });
    return z.NEVER;
  }

  return parseMoneyNumber(Number(normalizedValue), context);
}

function parseMoneyNumber(
  value: number,
  context: z.RefinementCtx,
): string | typeof z.NEVER {
  if (!Number.isFinite(value)) {
    context.addIssue({ code: "custom", message: MONEY_INVALID_MESSAGE });
    return z.NEVER;
  }

  if (value <= 0) {
    context.addIssue({ code: "custom", message: MONEY_POSITIVE_MESSAGE });
    return z.NEVER;
  }

  return value.toFixed(2);
}

function addFieldError(
  fieldErrors: ProductFieldErrors,
  field: string,
  message: string,
) {
  fieldErrors[field] = [...(fieldErrors[field] ?? []), message];
}
