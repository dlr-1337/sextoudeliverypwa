import { z } from "zod";

const REQUIRED_FIELD_MESSAGE = "Campo obrigatório.";
const FORBIDDEN_FIELD_MESSAGE = "Campo não permitido.";
const MONEY_INVALID_MESSAGE = "Informe um valor em dinheiro válido.";
const MONEY_NON_NEGATIVE_MESSAGE = "Informe um valor maior ou igual a zero.";

export type MerchantFieldErrors = Record<string, string[]>;

export type MerchantValidationErrors = {
  fieldErrors: MerchantFieldErrors;
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

const moneySchema = z
  .unknown()
  .optional()
  .transform((value, context): string | undefined => {
    if (value === undefined || value === null) {
      return undefined;
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
      return undefined;
    }

    if (trimmedValue.startsWith("-")) {
      context.addIssue({ code: "custom", message: MONEY_NON_NEGATIVE_MESSAGE });
      return z.NEVER;
    }

    const normalizedValue = trimmedValue.replace(",", ".");

    if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedValue)) {
      context.addIssue({ code: "custom", message: MONEY_INVALID_MESSAGE });
      return z.NEVER;
    }

    return parseMoneyNumber(Number(normalizedValue), context);
  });

const logoUrlValueSchema = z.unknown().transform((value, context): string | null => {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    context.addIssue({
      code: "custom",
      message: "Informe o caminho do logo.",
    });
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
    context.addIssue({
      code: "custom",
      message: "Informe um caminho de upload válido.",
    });
    return z.NEVER;
  }

  return trimmedValue;
});

export const merchantOwnerInputSchema = z
  .object({
    ownerId: idSchema("Informe o identificador do comerciante."),
  })
  .strict();

export const merchantProfileSchema = z
  .object({
    name: nameSchema.optional(),
    categoryId: categoryIdSchema,
    description: nullableTextSchema(
      500,
      "Informe uma descrição com até 500 caracteres.",
    ),
    phone: nullableTextSchema("11999999999".length + 10, "Informe um telefone válido."),
    whatsapp: nullableTextSchema(
      "11999999999".length + 10,
      "Informe um WhatsApp válido.",
    ),
    addressLine1: nullableTextSchema(
      160,
      "Informe um endereço com até 160 caracteres.",
    ),
    addressLine2: nullableTextSchema(
      160,
      "Informe um complemento com até 160 caracteres.",
    ),
    city: nullableTextSchema(120, "Informe uma cidade com até 120 caracteres."),
    state: nullableTextSchema(64, "Informe um estado com até 64 caracteres."),
    postalCode: nullableTextSchema(
      32,
      "Informe um CEP com até 32 caracteres.",
    ),
    deliveryFee: moneySchema,
    minimumOrder: moneySchema,
  })
  .strict();

export const merchantLogoUrlInputSchema = z
  .object({
    logoUrl: logoUrlValueSchema,
  })
  .strict();

export type MerchantOwnerInput = z.infer<typeof merchantOwnerInputSchema>;
export type MerchantProfileInput = z.infer<typeof merchantProfileSchema>;
export type MerchantLogoUrlInput = z.infer<typeof merchantLogoUrlInputSchema>;

export function formatMerchantValidationErrors(
  error: z.ZodError,
): MerchantValidationErrors {
  const fieldErrors: MerchantFieldErrors = {};
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

function parseMoneyNumber(
  value: number,
  context: z.RefinementCtx,
): string | typeof z.NEVER {
  if (!Number.isFinite(value)) {
    context.addIssue({ code: "custom", message: MONEY_INVALID_MESSAGE });
    return z.NEVER;
  }

  if (value < 0) {
    context.addIssue({ code: "custom", message: MONEY_NON_NEGATIVE_MESSAGE });
    return z.NEVER;
  }

  return value.toFixed(2);
}

function addFieldError(
  fieldErrors: MerchantFieldErrors,
  field: string,
  message: string,
) {
  fieldErrors[field] = [...(fieldErrors[field] ?? []), message];
}
