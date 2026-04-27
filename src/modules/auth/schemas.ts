import { z } from "zod";

import {
  ROLE_DEFAULT_REDIRECTS,
  type AuthRole,
  type AuthValidationErrors,
} from "./types";

const REQUIRED_FIELD_MESSAGE = "Campo obrigatório.";
const FORBIDDEN_FIELD_MESSAGE = "Campo não permitido.";
const SAFE_REDIRECT_BASE_URL = "https://sextou.local";

const forbiddenRoleStatusFields = {
  role: z.never({ error: FORBIDDEN_FIELD_MESSAGE }).optional(),
  status: z.never({ error: FORBIDDEN_FIELD_MESSAGE }).optional(),
};

const normalizedEmailSchema = z
  .string({ error: REQUIRED_FIELD_MESSAGE })
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .email("Informe um e-mail válido.")
  .max(254, "Informe um e-mail com até 254 caracteres.");

const loginPasswordSchema = z
  .string({ error: REQUIRED_FIELD_MESSAGE })
  .refine((password) => password.trim().length > 0, "Informe a senha.")
  .refine(
    (password) => password.length <= 256,
    "Informe uma senha com até 256 caracteres.",
  );

const registrationPasswordSchema = z
  .string({ error: REQUIRED_FIELD_MESSAGE })
  .refine((password) => password.trim().length > 0, "Informe a senha.")
  .refine(
    (password) => password.length >= 8,
    "Informe uma senha com pelo menos 8 caracteres.",
  )
  .refine(
    (password) => password.length <= 256,
    "Informe uma senha com até 256 caracteres.",
  );

const nameSchema = z
  .string({ error: REQUIRED_FIELD_MESSAGE })
  .trim()
  .min(2, "Informe um nome com pelo menos 2 caracteres.")
  .max(120, "Informe um nome com até 120 caracteres.");

const optionalPhoneSchema = z
  .string()
  .trim()
  .max(32, "Informe um telefone com até 32 caracteres.")
  .optional()
  .transform((phone) => (phone && phone.length > 0 ? phone : undefined));

const safeNextPathInputSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => parseSafeRelativeRedirect(value));

export const loginSchema = z
  .object({
    email: normalizedEmailSchema,
    password: loginPasswordSchema,
    next: safeNextPathInputSchema,
  })
  .strict();

export const customerRegistrationSchema = z
  .object({
    name: nameSchema,
    email: normalizedEmailSchema,
    password: registrationPasswordSchema,
    phone: optionalPhoneSchema,
    ...forbiddenRoleStatusFields,
  })
  .strict()
  .transform(({ email, name, password, phone }) => ({
    email,
    name,
    password,
    phone,
  }));

export const merchantRegistrationSchema = z
  .object({
    name: nameSchema,
    email: normalizedEmailSchema,
    password: registrationPasswordSchema,
    phone: optionalPhoneSchema,
    establishmentName: nameSchema,
    establishmentPhone: optionalPhoneSchema,
    ...forbiddenRoleStatusFields,
  })
  .strict()
  .transform(
    ({
      email,
      establishmentName,
      establishmentPhone,
      name,
      password,
      phone,
    }) => ({
      email,
      establishmentName,
      establishmentPhone,
      name,
      password,
      phone,
    }),
  );

export const safeRedirectSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => parseSafeRelativeRedirect(value));

export type LoginInput = z.infer<typeof loginSchema>;
export type CustomerRegistrationInput = z.infer<
  typeof customerRegistrationSchema
>;
export type MerchantRegistrationInput = z.infer<
  typeof merchantRegistrationSchema
>;

export function parseSafeRelativeRedirect(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (!isSafeRelativeRedirect(trimmedValue)) {
    return undefined;
  }

  return trimmedValue;
}

export function resolveRoleRedirect(
  unsafeNext: unknown,
  role: AuthRole,
): string {
  return parseSafeRelativeRedirect(unsafeNext) ?? ROLE_DEFAULT_REDIRECTS[role];
}

export function isSafeRelativeRedirect(value: string) {
  if (
    value.length === 0 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return false;
  }

  try {
    const url = new URL(value, SAFE_REDIRECT_BASE_URL);

    return url.origin === SAFE_REDIRECT_BASE_URL && url.pathname.startsWith("/");
  } catch {
    return false;
  }
}

export function formatAuthValidationErrors(
  error: z.ZodError,
): AuthValidationErrors {
  const fieldErrors: AuthValidationErrors["fieldErrors"] = {};
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
  fieldErrors: AuthValidationErrors["fieldErrors"],
  field: string,
  message: string,
) {
  fieldErrors[field] = [...(fieldErrors[field] ?? []), message];
}
