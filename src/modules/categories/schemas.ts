import { z } from "zod";

const REQUIRED_FIELD_MESSAGE = "Campo obrigatório.";
const FORBIDDEN_FIELD_MESSAGE = "Campo não permitido.";
const CATEGORY_TYPES = ["ESTABLISHMENT", "PRODUCT"] as const;

export type CategoryTypeValue = (typeof CATEGORY_TYPES)[number];

export type CategoryFieldErrors = Record<string, string[]>;

export type CategoryValidationErrors = {
  fieldErrors: CategoryFieldErrors;
  formErrors: string[];
};

const idSchema = z
  .string({ error: REQUIRED_FIELD_MESSAGE })
  .trim()
  .min(1, "Informe o identificador da categoria.")
  .max(128, "Informe um identificador com até 128 caracteres.");

const categoryTypeSchema = z.enum(CATEGORY_TYPES, {
  error: "Selecione um tipo de categoria válido.",
});

const nameSchema = z
  .string({ error: REQUIRED_FIELD_MESSAGE })
  .trim()
  .min(2, "Informe um nome com pelo menos 2 caracteres.")
  .max(120, "Informe um nome com até 120 caracteres.");

const descriptionSchema = z
  .string({ error: REQUIRED_FIELD_MESSAGE })
  .trim()
  .max(500, "Informe uma descrição com até 500 caracteres.")
  .optional()
  .transform((description) => {
    if (description === undefined) {
      return undefined;
    }

    return description.length > 0 ? description : null;
  });

const displayOrderSchema = z
  .preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === "string") {
      const trimmedValue = value.trim();

      return trimmedValue.length > 0 ? Number(trimmedValue) : undefined;
    }

    return value;
  }, z.number({ error: "Informe uma ordem numérica." }).int("Informe uma ordem inteira.").min(0, "Informe uma ordem maior ou igual a zero.").max(9999, "Informe uma ordem com até 9999."))
  .optional();

const optionalBooleanSchema = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    if (typeof value === "string") {
      const normalizedValue = value.trim().toLowerCase();

      if (["1", "true", "on", "sim"].includes(normalizedValue)) {
        return true;
      }

      if (["0", "false", "off", "nao", "não"].includes(normalizedValue)) {
        return false;
      }
    }

    return value;
  }, z.boolean({ error: "Informe uma opção válida." }))
  .optional();

const limitSchema = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    if (typeof value === "string") {
      const trimmedValue = value.trim();

      return trimmedValue.length > 0 ? Number(trimmedValue) : undefined;
    }

    return value;
  }, z.number({ error: "Informe um limite numérico." }).int("Informe um limite inteiro.").min(1, "Informe um limite maior que zero.").max(100, "Informe um limite de até 100 categorias."))
  .optional();

export const createCategorySchema = z
  .object({
    name: nameSchema,
    type: categoryTypeSchema,
    description: descriptionSchema,
    displayOrder: displayOrderSchema,
  })
  .strict()
  .transform(({ description, displayOrder, name, type }) => ({
    name,
    type,
    description: description ?? null,
    displayOrder: displayOrder ?? 0,
  }));

export const updateCategorySchema = z
  .object({
    id: idSchema,
    name: nameSchema.optional(),
    description: descriptionSchema,
    displayOrder: displayOrderSchema,
  })
  .strict();

export const activateCategorySchema = z
  .object({
    id: idSchema,
  })
  .strict();

export const inactivateCategorySchema = activateCategorySchema;

export const categoryListByTypeSchema = z
  .object({
    type: categoryTypeSchema,
    includeInactive: optionalBooleanSchema,
    limit: limitSchema,
  })
  .strict()
  .transform(({ includeInactive, limit, type }) => ({
    type,
    includeInactive: includeInactive ?? true,
    limit: limit ?? 100,
  }));

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ToggleCategoryInput = z.infer<typeof activateCategorySchema>;
export type CategoryListByTypeInput = z.infer<typeof categoryListByTypeSchema>;

export function formatCategoryValidationErrors(
  error: z.ZodError,
): CategoryValidationErrors {
  const fieldErrors: CategoryFieldErrors = {};
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

function addFieldError(
  fieldErrors: CategoryFieldErrors,
  field: string,
  message: string,
) {
  fieldErrors[field] = [...(fieldErrors[field] ?? []), message];
}
