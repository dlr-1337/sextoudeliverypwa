import { describe, expect, it, vi } from "vitest";

import { AuthError } from "./errors";
import {
  assertRole,
  getCurrentSessionByToken,
  requireAuthenticatedSession,
  requireRole,
} from "./guards";
import type { AuthGuardService } from "./guards";
import type {
  AuthFailure,
  AuthResult,
  AuthRole,
  AuthSessionContext,
} from "./types";

const TOKEN = "a".repeat(43);
const NOW = new Date("2026-04-26T21:30:00.000Z");

describe("auth guards", () => {
  it("rejects missing session tokens without touching the service", async () => {
    const service = serviceReturning(ok(context()));

    const result = await getCurrentSessionByToken(undefined, { service });

    expect(result.ok).toBe(false);
    expect(service.getSessionByToken).not.toHaveBeenCalled();

    if (!result.ok) {
      expect(result.code).toBe("TOKEN_INVALID");
    }
  });

  it.each([
    "SESSION_EXPIRED",
    "SESSION_REVOKED",
    "INACTIVE_USER",
    "TOKEN_INVALID",
  ] as const)("throws %s before protected work runs", async (code) => {
    const service = serviceReturning(failure(code));

    await expect(
      requireAuthenticatedSession(TOKEN, { service }),
    ).rejects.toMatchObject({ code });
  });

  it("returns the active session context and forwards last-used touch options", async () => {
    const activeContext = context("MERCHANT");
    const service: AuthGuardService = {
      getSessionByToken: vi.fn(async () => ok(activeContext)),
    };

    const result = await requireAuthenticatedSession(TOKEN, {
      service,
      touchLastUsedAt: false,
    });

    expect(result).toEqual(activeContext);
    expect(service.getSessionByToken).toHaveBeenCalledWith(TOKEN, {
      touchLastUsedAt: false,
    });
  });

  it("rejects wrong-role sessions server-side", async () => {
    const service = serviceReturning(ok(context("CUSTOMER")));

    await expect(
      requireRole(TOKEN, "ADMIN", { service }),
    ).rejects.toMatchObject({ code: "FORBIDDEN_ROLE" });
  });

  it("allows any explicitly permitted role", async () => {
    const activeContext = context("MERCHANT");
    const service = serviceReturning(ok(activeContext));

    await expect(
      requireRole(TOKEN, ["ADMIN", "MERCHANT"], { service }),
    ).resolves.toEqual(activeContext);
  });

  it("exposes an assertion helper for already-loaded sessions", () => {
    const activeContext = context("CUSTOMER");

    expect(() => assertRole(activeContext, "CUSTOMER")).not.toThrow();
    expect(() => assertRole(activeContext, "MERCHANT")).toThrow(AuthError);
  });
});

function context(role: AuthRole = "CUSTOMER"): AuthSessionContext {
  return {
    session: {
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(NOW.getTime() + 60_000),
      lastUsedAt: null,
      revokedAt: null,
      createdAt: NOW,
    },
    user: {
      id: "user-1",
      name: "Maria Cliente",
      email: "maria@example.com",
      role,
      status: "ACTIVE",
      phone: null,
    },
  };
}

function serviceReturning(
  result: AuthResult<AuthSessionContext>,
): AuthGuardService {
  return {
    getSessionByToken: vi.fn(async () => result),
  };
}

function ok<TData>(data: TData): AuthResult<TData> {
  return { ok: true, data };
}

function failure(code: AuthFailure["code"]): AuthFailure {
  return {
    ok: false,
    code,
    message: "Mensagem pública segura.",
  };
}
