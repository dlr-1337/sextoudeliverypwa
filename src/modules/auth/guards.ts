import { AuthError } from "./errors";
import type { AuthServiceCore } from "./service-core";
import type { AuthResult, AuthRole, AuthSessionContext } from "./types";

export type AuthGuardService = Pick<AuthServiceCore, "getSessionByToken">;

export type AuthGuardOptions = {
  service?: AuthGuardService;
  touchLastUsedAt?: boolean;
};

export async function getCurrentSessionByToken(
  rawToken: unknown,
  options: AuthGuardOptions = {},
): Promise<AuthResult<AuthSessionContext>> {
  if (!rawToken) {
    return {
      ok: false,
      code: "TOKEN_INVALID",
      message: "Sessão inválida. Faça login novamente.",
    };
  }

  const service = await resolveAuthGuardService(options);

  return service.getSessionByToken(rawToken, {
    touchLastUsedAt: options.touchLastUsedAt,
  });
}

export async function requireAuthenticatedSession(
  rawToken: unknown,
  options: AuthGuardOptions = {},
) {
  const result = await getCurrentSessionByToken(rawToken, options);

  if (!result.ok) {
    throw failureToAuthError(result);
  }

  return result.data;
}

export async function requireRole(
  rawToken: unknown,
  allowedRoles: AuthRole | readonly AuthRole[],
  options: AuthGuardOptions = {},
) {
  const context = await requireAuthenticatedSession(rawToken, options);

  assertRole(context, allowedRoles);

  return context;
}

export async function requireAdminSession(
  rawToken: unknown,
  options: AuthGuardOptions = {},
) {
  return requireRole(rawToken, "ADMIN", options);
}

export async function requireMerchantSession(
  rawToken: unknown,
  options: AuthGuardOptions = {},
) {
  return requireRole(rawToken, "MERCHANT", options);
}

export async function requireCustomerSession(
  rawToken: unknown,
  options: AuthGuardOptions = {},
) {
  return requireRole(rawToken, "CUSTOMER", options);
}

export function assertRole(
  context: AuthSessionContext,
  allowedRoles: AuthRole | readonly AuthRole[],
): asserts context is AuthSessionContext {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  if (!roles.includes(context.user.role)) {
    throw new AuthError(
      "FORBIDDEN_ROLE",
      `Role ${context.user.role} cannot access this server-only surface.`,
    );
  }
}

async function resolveAuthGuardService(options: AuthGuardOptions) {
  if (options.service) {
    return options.service;
  }

  const { authService } = await import("./service");

  return authService;
}

function failureToAuthError(
  failure: Extract<AuthResult<AuthSessionContext>, { ok: false }>,
) {
  return new AuthError(failure.code, failure.message, {
    publicMessage: failure.message,
  });
}
