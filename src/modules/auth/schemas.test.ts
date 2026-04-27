import { describe, expect, it } from "vitest";

import {
  customerRegistrationSchema,
  formatAuthValidationErrors,
  isSafeRelativeRedirect,
  loginSchema,
  merchantRegistrationSchema,
  parseSafeRelativeRedirect,
  resolveRoleRedirect,
  safeRedirectSchema,
} from "./schemas";

describe("loginSchema", () => {
  it("normalizes e-mail and preserves a safe relative next path", () => {
    expect(
      loginSchema.parse({
        email: " Cliente@Example.COM ",
        password: "secret-password",
        next: " /conta?tab=pedidos ",
      }),
    ).toEqual({
      email: "cliente@example.com",
      password: "secret-password",
      next: "/conta?tab=pedidos",
    });
  });

  it("returns field-level errors for blank or invalid login values", () => {
    const parsed = loginSchema.safeParse({
      email: "not an email",
      password: "   ",
    });

    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      const errors = formatAuthValidationErrors(parsed.error);
      expect(errors.fieldErrors.email).toContain("Informe um e-mail válido.");
      expect(errors.fieldErrors.password).toContain("Informe a senha.");
    }
  });
});

describe("customerRegistrationSchema", () => {
  it("normalizes customer registration data without role/status fields", () => {
    const parsed = customerRegistrationSchema.parse({
      name: " Maria Cliente ",
      email: " MARIA@Example.COM ",
      password: "strong-password",
      phone: " 11999999999 ",
    });

    expect(parsed).toEqual({
      name: "Maria Cliente",
      email: "maria@example.com",
      password: "strong-password",
      phone: "11999999999",
    });
    expect(parsed).not.toHaveProperty("role");
    expect(parsed).not.toHaveProperty("status");
  });

  it("rejects blank email, short password, and role/status injection attempts", () => {
    const parsed = customerRegistrationSchema.safeParse({
      name: "A",
      email: "   ",
      password: "short",
      role: "ADMIN",
      status: "SUSPENDED",
    });

    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      const errors = formatAuthValidationErrors(parsed.error);
      expect(errors.fieldErrors.name).toContain(
        "Informe um nome com pelo menos 2 caracteres.",
      );
      expect(errors.fieldErrors.email).toContain("Informe o e-mail.");
      expect(errors.fieldErrors.password).toContain(
        "Informe uma senha com pelo menos 8 caracteres.",
      );
      expect(errors.fieldErrors.role).toContain("Campo não permitido.");
      expect(errors.fieldErrors.status).toContain("Campo não permitido.");
    }
  });
});

describe("merchantRegistrationSchema", () => {
  it("normalizes merchant registration data and optional phone fields", () => {
    expect(
      merchantRegistrationSchema.parse({
        name: " João Merchant ",
        email: " JOAO@Example.COM ",
        password: "strong-password",
        phone: " ",
        establishmentName: " Sextou Bar ",
        establishmentPhone: " 1133334444 ",
      }),
    ).toEqual({
      name: "João Merchant",
      email: "joao@example.com",
      password: "strong-password",
      phone: undefined,
      establishmentName: "Sextou Bar",
      establishmentPhone: "1133334444",
    });
  });

  it("rejects missing establishment name and status injection attempts", () => {
    const parsed = merchantRegistrationSchema.safeParse({
      name: "João Merchant",
      email: "joao@example.com",
      password: "strong-password",
      establishmentName: " ",
      status: "ACTIVE",
    });

    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      const errors = formatAuthValidationErrors(parsed.error);
      expect(errors.fieldErrors.establishmentName).toContain(
        "Informe um nome com pelo menos 2 caracteres.",
      );
      expect(errors.fieldErrors.status).toContain("Campo não permitido.");
    }
  });
});

describe("safe redirect validation", () => {
  it("accepts safe relative paths and rejects external or protocol-relative values", () => {
    expect(parseSafeRelativeRedirect(" /admin?from=login ")).toBe(
      "/admin?from=login",
    );
    expect(safeRedirectSchema.parse("/conta")).toBe("/conta");
    expect(isSafeRelativeRedirect("/estabelecimento")).toBe(true);

    for (const unsafe of [
      "https://evil.example",
      "//evil.example/path",
      "javascript:alert(1)",
      "admin",
      "/\\evil.example",
    ]) {
      expect(parseSafeRelativeRedirect(unsafe)).toBeUndefined();
    }
  });

  it("falls back to safe role destinations for malformed next values", () => {
    expect(resolveRoleRedirect("https://evil.example", "ADMIN")).toBe("/admin");
    expect(resolveRoleRedirect("//evil.example", "MERCHANT")).toBe(
      "/estabelecimento",
    );
    expect(resolveRoleRedirect(undefined, "CUSTOMER")).toBe("/conta");
    expect(resolveRoleRedirect("/conta?tab=pedidos", "CUSTOMER")).toBe(
      "/conta?tab=pedidos",
    );
  });
});
