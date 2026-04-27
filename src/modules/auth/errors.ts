export const AUTH_ERROR_MESSAGES = {
  CONFIG_INVALID:
    "Configuração de autenticação indisponível. Contate o suporte.",
  PASSWORD_HASH_FAILED: "Não foi possível proteger a senha informada.",
  PASSWORD_VERIFY_FAILED: "Não foi possível validar a senha informada.",
  TOKEN_INVALID: "Sessão inválida. Faça login novamente.",
  VALIDATION_FAILED: "Revise os campos destacados.",
  INVALID_CREDENTIALS: "E-mail ou senha inválidos.",
  DUPLICATE_EMAIL: "Já existe uma conta com este e-mail.",
  INACTIVE_USER: "Sua conta está inativa. Fale com o suporte.",
  SESSION_EXPIRED: "Sua sessão expirou. Faça login novamente.",
  SESSION_REVOKED: "Sua sessão foi encerrada. Faça login novamente.",
  FORBIDDEN_ROLE: "Você não tem permissão para acessar esta área.",
  DATABASE_ERROR:
    "Não foi possível concluir a operação de autenticação. Tente novamente.",
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_MESSAGES;

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly publicMessage: string;

  constructor(
    code: AuthErrorCode,
    message: string,
    options: { cause?: unknown; publicMessage?: string } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AuthError";
    this.code = code;
    this.publicMessage = options.publicMessage ?? AUTH_ERROR_MESSAGES[code];
  }
}

export class AuthConfigError extends AuthError {
  readonly keys: readonly string[];

  constructor(keys: readonly string[], options: { cause?: unknown } = {}) {
    const uniqueKeys = [...new Set(keys)].sort();

    super(
      "CONFIG_INVALID",
      `Configuração de autenticação inválida: ${uniqueKeys.join(", ")}.`,
      options,
    );
    this.name = "AuthConfigError";
    this.keys = uniqueKeys;
  }
}

export class AuthPasswordError extends AuthError {
  constructor(
    code: "PASSWORD_HASH_FAILED" | "PASSWORD_VERIFY_FAILED",
    operation: "hash" | "verify",
    cause: unknown,
  ) {
    super(
      code,
      `Falha segura de Argon2id durante ${operation} (${getErrorClass(cause)}).`,
      { cause },
    );
    this.name = "AuthPasswordError";
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return (
    error instanceof AuthError ||
    (isRecord(error) &&
      typeof error.code === "string" &&
      error.code in AUTH_ERROR_MESSAGES)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getPublicAuthErrorMessage(error: unknown) {
  if (isAuthError(error)) {
    if (isRecord(error) && typeof error.publicMessage === "string") {
      return error.publicMessage;
    }

    return AUTH_ERROR_MESSAGES[error.code];
  }

  return AUTH_ERROR_MESSAGES.CONFIG_INVALID;
}

export function getErrorClass(error: unknown) {
  if (error instanceof Error && error.name) {
    return error.name;
  }

  return "Error";
}
