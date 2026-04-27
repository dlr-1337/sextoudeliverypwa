import { describe, expect, it } from "vitest";

import { AuthError } from "./errors";
import {
  buildAccessDeniedPath,
  buildLoginPath,
  getAccessDeniedCopy,
  getRoleDestination,
  resolveAuthErrorRedirect,
  resolvePostAuthRedirect,
} from "./navigation";

describe("auth navigation helpers", () => {
  it("maps authenticated roles to their private destinations", () => {
    expect(getRoleDestination("ADMIN")).toBe("/admin");
    expect(getRoleDestination("MERCHANT")).toBe("/estabelecimento");
    expect(getRoleDestination("CUSTOMER")).toBe("/conta");
  });

  it("uses safe same-role next paths but rejects external, auth-surface, and cross-role redirects", () => {
    expect(resolvePostAuthRedirect("/conta?tab=pedidos", "CUSTOMER")).toBe(
      "/conta?tab=pedidos",
    );
    expect(resolvePostAuthRedirect("/checkout?foo=1#carrinho", "CUSTOMER")).toBe(
      "/checkout?foo=1#carrinho",
    );
    expect(resolvePostAuthRedirect("/admin/lojas", "ADMIN")).toBe(
      "/admin/lojas",
    );
    expect(resolvePostAuthRedirect("/checkout", "ADMIN")).toBe("/admin");
    expect(resolvePostAuthRedirect("/checkout", "MERCHANT")).toBe(
      "/estabelecimento",
    );
    expect(resolvePostAuthRedirect("/admin", "CUSTOMER")).toBe("/conta");
    expect(resolvePostAuthRedirect("https://evil.example", "ADMIN")).toBe(
      "/admin",
    );
    expect(resolvePostAuthRedirect("//evil.example/path", "MERCHANT")).toBe(
      "/estabelecimento",
    );
    expect(resolvePostAuthRedirect("/login?next=/admin", "ADMIN")).toBe(
      "/admin",
    );
  });

  it("builds safe login and access-denied paths without preserving unsafe next values", () => {
    expect(buildLoginPath("/admin", "sessao")).toBe(
      "/login?next=%2Fadmin&erro=sessao",
    );
    expect(buildLoginPath("https://evil.example", "saida")).toBe(
      "/login?saida=ok",
    );
    expect(buildAccessDeniedPath("perfil", "/conta")).toBe(
      "/acesso-negado?motivo=perfil&next=%2Fconta",
    );
    expect(buildAccessDeniedPath("perfil", "//evil.example")).toBe(
      "/acesso-negado?motivo=perfil",
    );
  });

  it("routes auth guard failures to the appropriate safe feedback surface", () => {
    expect(
      resolveAuthErrorRedirect(
        new AuthError("FORBIDDEN_ROLE", "wrong role"),
        "/admin",
      ),
    ).toBe("/acesso-negado?motivo=perfil&next=%2Fadmin");
    expect(
      resolveAuthErrorRedirect(
        new AuthError("SESSION_REVOKED", "revoked"),
        "/conta",
      ),
    ).toBe("/login?next=%2Fconta&erro=sessao");
    expect(
      resolveAuthErrorRedirect(
        { code: "TOKEN_INVALID", publicMessage: "Sessão inválida." },
        "/admin",
      ),
    ).toBe("/login?next=%2Fadmin&erro=sessao");
    expect(resolveAuthErrorRedirect(new Error("boom"), "/admin")).toBe(
      "/acesso-negado?motivo=autenticacao&next=%2Fadmin",
    );
  });

  it("provides Portuguese feedback copy without technical details", () => {
    expect(getAccessDeniedCopy("perfil").title).toBe(
      "Acesso negado para este perfil",
    );
    expect(getAccessDeniedCopy("conta-inativa").description).toContain(
      "suporte",
    );
    expect(getAccessDeniedCopy("unknown").title).toBe(
      "Não foi possível liberar o acesso",
    );
  });
});
