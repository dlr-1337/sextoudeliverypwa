import { isAuthError } from "./errors";
import { parseSafeRelativeRedirect } from "./schemas";
import { ROLE_DEFAULT_REDIRECTS, type AuthRole } from "./types";

export type AccessDeniedReason =
  | "perfil"
  | "conta-inativa"
  | "autenticacao";

export type LoginNotice = "sessao" | "saida";

const AUTH_SURFACE_PATHS = new Set(["/login", "/cadastro"]);

export function getRoleDestination(role: AuthRole) {
  return ROLE_DEFAULT_REDIRECTS[role];
}

export function resolvePostAuthRedirect(
  unsafeNext: unknown,
  role: AuthRole,
): string {
  const fallback = getRoleDestination(role);
  const safeNext = parseSafeRelativeRedirect(unsafeNext);

  if (!safeNext || isAuthSurface(safeNext) || !isRoleDestination(safeNext, role)) {
    return fallback;
  }

  return safeNext;
}

export function buildLoginPath(
  unsafeNext?: unknown,
  notice?: LoginNotice,
): string {
  const params = new URLSearchParams();
  const safeNext = parseSafeRelativeRedirect(unsafeNext);

  if (safeNext && !isAuthSurface(safeNext)) {
    params.set("next", safeNext);
  }

  if (notice === "sessao") {
    params.set("erro", "sessao");
  }

  if (notice === "saida") {
    params.set("saida", "ok");
  }

  const query = params.toString();

  return query ? `/login?${query}` : "/login";
}

export function buildAccessDeniedPath(
  reason: AccessDeniedReason = "autenticacao",
  unsafeNext?: unknown,
): string {
  const params = new URLSearchParams({ motivo: reason });
  const safeNext = parseSafeRelativeRedirect(unsafeNext);

  if (safeNext && !isAuthSurface(safeNext)) {
    params.set("next", safeNext);
  }

  return `/acesso-negado?${params.toString()}`;
}

export function resolveAuthErrorRedirect(
  error: unknown,
  currentPath: `/${string}`,
): string {
  if (!isAuthError(error)) {
    return buildAccessDeniedPath("autenticacao", currentPath);
  }

  switch (error.code) {
    case "TOKEN_INVALID":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
      return buildLoginPath(currentPath, "sessao");
    case "INACTIVE_USER":
      return buildAccessDeniedPath("conta-inativa", currentPath);
    case "FORBIDDEN_ROLE":
      return buildAccessDeniedPath("perfil", currentPath);
    default:
      return buildAccessDeniedPath("autenticacao", currentPath);
  }
}

export function getAccessDeniedCopy(reason: unknown) {
  switch (reason) {
    case "perfil":
      return {
        title: "Acesso negado para este perfil",
        description:
          "Sua conta está autenticada, mas não tem permissão para acessar esta área. Entre com o perfil correto ou volte para sua área inicial.",
      };
    case "conta-inativa":
      return {
        title: "Conta sem acesso no momento",
        description:
          "Esta conta não está ativa para acessar áreas privadas. Fale com o suporte do Sextou Delivery.",
      };
    default:
      return {
        title: "Não foi possível liberar o acesso",
        description:
          "A verificação de acesso falhou de forma segura. Faça login novamente ou tente a área correspondente ao seu perfil.",
      };
  }
}

function isRoleDestination(path: string, role: AuthRole) {
  const pathname = getPathname(path);
  const destination = getRoleDestination(role);

  return pathname === destination || pathname.startsWith(`${destination}/`);
}

function isAuthSurface(path: string) {
  return AUTH_SURFACE_PATHS.has(getPathname(path));
}

function getPathname(path: string) {
  return path.split(/[?#]/, 1)[0] ?? path;
}
