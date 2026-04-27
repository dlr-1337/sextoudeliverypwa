import { describe, expect, it, vi } from "vitest";

import { AuthError } from "../auth/errors";
import type { AuthSessionContext } from "../auth/types";

import { CHECKOUT_ACTION_IDLE_STATE } from "./action-state";
import { CHECKOUT_ACTION_MESSAGES, createCheckoutActionCore } from "./action-core";
import {
  CHECKOUT_MAX_DELIVERY_REFERENCE_LENGTH,
  CHECKOUT_MAX_GENERAL_OBSERVATION_LENGTH,
} from "./schemas";

describe("customer checkout server action core", () => {
  it("rejects missing, wrong-role, and thrown guard failures before payload validation or order creation", async () => {
    const missingCreateCashOrder = vi.fn();
    const missingGuard = vi.fn(async (rawToken: unknown) => {
      expect(rawToken).toBeUndefined();
      throw new AuthError("TOKEN_INVALID", "raw session token missing");
    });
    const missingCore = createCheckoutActionCore({
      createCashOrder: missingCreateCashOrder,
      readSessionCookie: () => undefined,
      requireCustomerSession: missingGuard,
    });

    const missing = await missingCore.checkoutOrderAction(
      CHECKOUT_ACTION_IDLE_STATE,
      new FormData(),
    );

    expect(missing).toMatchObject({
      status: "error",
      message: "Sessão inválida. Faça login novamente.",
    });
    expect(JSON.stringify(missing)).not.toContain("session token");
    expect(missing).not.toHaveProperty("fieldErrors");
    expect(missingCreateCashOrder).not.toHaveBeenCalled();

    for (const role of ["ADMIN", "MERCHANT"] as const) {
      const createCashOrder = vi.fn();
      const roleGuard = vi.fn(async (rawToken: unknown) => {
        expect(rawToken).toBe(`${role.toLowerCase()}-token`);
        throw new AuthError(
          "FORBIDDEN_ROLE",
          `Role ${role} cannot access this server-only surface.`,
        );
      });
      const roleCore = createCheckoutActionCore({
        createCashOrder,
        readSessionCookie: () => `${role.toLowerCase()}-token`,
        requireCustomerSession: roleGuard,
      });

      const forbidden = await roleCore.checkoutOrderAction(
        CHECKOUT_ACTION_IDLE_STATE,
        checkoutForm(),
      );

      expect(forbidden).toMatchObject({
        status: "error",
        message: "Você não tem permissão para acessar esta área.",
      });
      expect(JSON.stringify(forbidden)).not.toContain(role);
      expect(createCashOrder).not.toHaveBeenCalled();
    }

    const thrownCreateCashOrder = vi.fn();
    const thrownCore = createCheckoutActionCore({
      createCashOrder: thrownCreateCashOrder,
      readSessionCookie: () => "customer-token",
      requireCustomerSession: async () => {
        throw new Error("Prisma DATABASE_URL tokenHash raw session token");
      },
    });

    const thrown = await thrownCore.checkoutOrderAction(
      CHECKOUT_ACTION_IDLE_STATE,
      checkoutForm(),
    );

    expect(thrown).toMatchObject({
      status: "error",
      message: "Configuração de autenticação indisponível. Contate o suporte.",
    });
    const serializedThrown = JSON.stringify(thrown);
    expect(serializedThrown).not.toContain("DATABASE_URL");
    expect(serializedThrown).not.toContain("tokenHash");
    expect(serializedThrown).not.toContain("raw session token");
    expect(thrownCreateCashOrder).not.toHaveBeenCalled();
  });

  it("creates a CASH order through the service with authenticated customer context", async () => {
    const createCashOrder = vi.fn(async () =>
      createdOrderResult("PED-20260427-ABC123"),
    );
    const requireCustomerSession = vi.fn(async (rawToken: unknown) => {
      expect(rawToken).toBe("customer-token");
      return customerSession("customer-a");
    });
    const core = createCheckoutActionCore({
      createCashOrder,
      readSessionCookie: () => "customer-token",
      requireCustomerSession,
    });

    const created = await core.checkoutOrderAction(
      CHECKOUT_ACTION_IDLE_STATE,
      checkoutForm({
        fields: {
          deliveryComplement: " ",
          deliveryReference: " ",
          generalObservation: " ",
        },
        items: [{ productId: " product-a ", quantity: "3" }],
      }),
    );

    expect(created).toEqual({
      status: "created",
      message: CHECKOUT_ACTION_MESSAGES.CREATED,
      publicCode: "PED-20260427-ABC123",
      redirectPath: "/pedido/PED-20260427-ABC123",
    });
    expect(createCashOrder).toHaveBeenCalledTimes(1);
    expect(createCashOrder).toHaveBeenCalledWith("customer-a", {
      establishmentId: "establishment-a",
      items: [{ productId: "product-a", quantity: 3 }],
      customerName: "Maria Cliente",
      customerPhone: "11999999999",
      deliveryStreet: "Rua das Flores",
      deliveryNumber: "42A",
      deliveryComplement: null,
      deliveryNeighborhood: "Centro",
      deliveryCity: "São Paulo",
      deliveryState: "SP",
      deliveryPostalCode: "01001-000",
      deliveryReference: null,
      generalObservation: null,
      paymentMethod: "CASH",
    });
    expect(requireCustomerSession).toHaveBeenCalledTimes(1);

    const serialized = JSON.stringify(created);
    for (const forbiddenFragment of [
      "payload",
      "values",
      "customer-a",
      "Maria Cliente",
      "product-a",
      "provider",
      "orderId",
    ]) {
      expect(serialized).not.toContain(forbiddenFragment);
    }
  });

  it("rejects PIX, CARD, FAKE, and unknown payment submissions before invoking the service", async () => {
    const { core, createCashOrder } = authenticatedCore();

    for (const paymentMethod of ["PIX", "CARD", "FAKE", "BOLETO"] as const) {
      const state = await core.checkoutOrderAction(
        CHECKOUT_ACTION_IDLE_STATE,
        checkoutForm({ fields: { paymentMethod } }),
      );

      expect(state.status).toBe("error");
      expect(state.fieldErrors?.paymentMethod).toContain(
        "Pague em dinheiro para concluir este pedido.",
      );
      expect(state.formErrors).toEqual([]);

      const serialized = JSON.stringify(state);
      expect(serialized).not.toContain("provider");
      expect(serialized).not.toContain("publicCode");

      if (paymentMethod === "FAKE") {
        expect(serialized).not.toContain("FAKE");
      }
    }

    expect(createCashOrder).not.toHaveBeenCalled();
  });

  it("coerces quantity strings before service invocation and reports empty or malformed cart lines", async () => {
    const { core, createCashOrder } = authenticatedCore();

    const created = await core.checkoutOrderAction(
      CHECKOUT_ACTION_IDLE_STATE,
      checkoutForm({ items: [{ productId: "product-a", quantity: "2" }] }),
    );

    expect(created.status).toBe("created");
    expect(createCashOrder).toHaveBeenCalledWith(
      "customer-a",
      expect.objectContaining({
        items: [{ productId: "product-a", quantity: 2 }],
      }),
    );

    const invalidQuantity = await core.checkoutOrderAction(
      CHECKOUT_ACTION_IDLE_STATE,
      checkoutForm({ items: [{ productId: "product-a", quantity: "abc" }] }),
    );

    expect(invalidQuantity.status).toBe("error");
    expect(invalidQuantity.fieldErrors?.["items.0.quantity"]).toBeDefined();
    expect(invalidQuantity.values?.items).toEqual([
      { productId: "product-a", quantity: "abc" },
    ]);

    const emptyCart = await core.checkoutOrderAction(
      CHECKOUT_ACTION_IDLE_STATE,
      checkoutForm({ items: [] }),
    );

    expect(emptyCart.status).toBe("error");
    expect(emptyCart.fieldErrors?.items).toContain(
      "Adicione pelo menos um item ao pedido.",
    );
    expect(createCashOrder).toHaveBeenCalledTimes(1);
  });

  it("maps malformed required fields and oversized optional text to field errors before service invocation", async () => {
    const { core, createCashOrder } = authenticatedCore();

    const malformed = await core.checkoutOrderAction(
      CHECKOUT_ACTION_IDLE_STATE,
      checkoutForm({
        fields: {
          establishmentId: " ",
          deliveryReference: "x".repeat(
            CHECKOUT_MAX_DELIVERY_REFERENCE_LENGTH + 1,
          ),
          generalObservation: "x".repeat(
            CHECKOUT_MAX_GENERAL_OBSERVATION_LENGTH + 1,
          ),
        },
      }),
    );

    expect(malformed.status).toBe("error");
    expect(malformed.fieldErrors?.establishmentId).toContain(
      "Informe o identificador da loja.",
    );
    expect(malformed.fieldErrors?.deliveryReference).toContain(
      `Informe uma referência com até ${CHECKOUT_MAX_DELIVERY_REFERENCE_LENGTH} caracteres.`,
    );
    expect(malformed.fieldErrors?.generalObservation).toContain(
      `Informe uma observação com até ${CHECKOUT_MAX_GENERAL_OBSERVATION_LENGTH} caracteres.`,
    );
    expect(createCashOrder).not.toHaveBeenCalled();
  });

  it("rejects forged root and item authority fields without echoing forged values or invoking the service", async () => {
    const { core, createCashOrder } = authenticatedCore();
    const providerSecret = "provider-secret-token-123";

    const forged = await core.checkoutOrderAction(
      CHECKOUT_ACTION_IDLE_STATE,
      checkoutForm({
        extra: {
          price: "0.01",
          subtotal: "0.01",
          total: "0.01",
          discount: "100.00",
          status: "DELIVERED",
          paymentStatus: "PAID",
          customerId: "forged-customer",
          publicCode: "PED-000001",
          provider: "forged-provider",
          providerPayload: providerSecret,
          "items.0.price": "0.01",
          "items.0.subtotal": "0.01",
          "items.0.total": "0.01",
          "items.0.discount": "100.00",
          "items.0.providerPayload": providerSecret,
        },
      }),
    );

    expect(forged.status).toBe("error");

    for (const field of [
      "price",
      "subtotal",
      "total",
      "discount",
      "status",
      "paymentStatus",
      "customerId",
      "publicCode",
      "provider",
      "providerPayload",
      "items.0.price",
      "items.0.subtotal",
      "items.0.total",
      "items.0.discount",
      "items.0.providerPayload",
    ]) {
      expect(forged.fieldErrors?.[field]).toContain("Campo não permitido.");
    }

    const serialized = JSON.stringify(forged);
    expect(serialized).not.toContain(providerSecret);
    expect(serialized).not.toContain("forged-provider");
    expect(serialized).not.toContain("forged-customer");
    expect(serialized).not.toContain("PED-000001");
    expect(serialized).not.toContain("DELIVERED");
    expect(serialized).not.toContain("PAID");
    expect(forged).not.toHaveProperty("payload");
    expect(createCashOrder).not.toHaveBeenCalled();
  });

  it("maps service validation failures to sanitized recoverable form and field errors", async () => {
    const createCashOrder = vi.fn(async () => ({
      ok: false,
      code: "PRODUCT_UNAVAILABLE",
      message: "raw Prisma product secret should not leak",
      fieldErrors: {
        "items.0.productId": ["raw unavailable product product-a"],
        publicCode: ["PED-secret"],
      },
      formErrors: ["DATABASE_URL raw provider payload"],
      retryable: false,
    }));
    const core = createCheckoutActionCore({
      createCashOrder,
      readSessionCookie: () => "customer-token",
      requireCustomerSession: async () => customerSession("customer-a"),
    });

    const state = await core.checkoutOrderAction(
      CHECKOUT_ACTION_IDLE_STATE,
      checkoutForm({ items: [{ productId: "product-a", quantity: "2" }] }),
    );

    expect(state).toMatchObject({
      status: "error",
      message: "Um ou mais produtos estão indisponíveis no momento.",
      formErrors: ["Um ou mais produtos estão indisponíveis no momento."],
      fieldErrors: {
        "items.0.productId": [
          "Um ou mais produtos estão indisponíveis no momento.",
        ],
      },
      values: {
        establishmentId: "establishment-a",
        paymentMethod: "CASH",
        items: [{ productId: "product-a", quantity: "2" }],
      },
    });
    expect(state.fieldErrors?.publicCode).toBeUndefined();
    expect(createCashOrder).toHaveBeenCalledTimes(1);

    const serialized = JSON.stringify(state);
    for (const forbiddenFragment of [
      "Prisma",
      "DATABASE_URL",
      "provider payload",
      "PED-secret",
      "raw unavailable product",
    ]) {
      expect(serialized).not.toContain(forbiddenFragment);
    }
  });

  it("preserves recovery state for service exceptions and malformed service results", async () => {
    const rejectingCore = createCheckoutActionCore({
      createCashOrder: vi.fn(async () => {
        throw new Error("Prisma DATABASE_URL transaction timeout raw payload");
      }),
      readSessionCookie: () => "customer-token",
      requireCustomerSession: async () => customerSession("customer-a"),
    });

    const rejected = await rejectingCore.checkoutOrderAction(
      CHECKOUT_ACTION_IDLE_STATE,
      checkoutForm(),
    );

    expect(rejected).toMatchObject({
      status: "error",
      message: CHECKOUT_ACTION_MESSAGES.ORDER_CREATION_FAILED,
      formErrors: [CHECKOUT_ACTION_MESSAGES.ORDER_CREATION_FAILED],
      values: expect.objectContaining({ establishmentId: "establishment-a" }),
    });
    expect(JSON.stringify(rejected)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(rejected)).not.toContain("raw payload");

    const malformedCore = createCheckoutActionCore({
      createCashOrder: vi.fn(async () => ({
        ok: true,
        data: {
          publicCode: "internal-order-id",
          redirectPath: "/admin/orders/internal-order-id",
          providerPayload: "secret",
        },
      })),
      readSessionCookie: () => "customer-token",
      requireCustomerSession: async () => customerSession("customer-a"),
    });

    const malformed = await malformedCore.checkoutOrderAction(
      CHECKOUT_ACTION_IDLE_STATE,
      checkoutForm(),
    );

    expect(malformed).toMatchObject({
      status: "error",
      message: CHECKOUT_ACTION_MESSAGES.ORDER_CREATION_FAILED,
      formErrors: [CHECKOUT_ACTION_MESSAGES.ORDER_CREATION_FAILED],
      values: expect.objectContaining({ establishmentId: "establishment-a" }),
    });
    const serializedMalformed = JSON.stringify(malformed);
    expect(serializedMalformed).not.toContain("internal-order-id");
    expect(serializedMalformed).not.toContain("/admin/orders");
    expect(serializedMalformed).not.toContain("secret");
  });
});

type CheckoutFormOptions = {
  fields?: Partial<Record<CheckoutRootFieldName, string>>;
  items?: Array<Partial<Record<CheckoutItemFieldName, string>>>;
  extra?: Record<string, string>;
};

type CheckoutRootFieldName = keyof ReturnType<typeof validCheckoutFields>;
type CheckoutItemFieldName = "productId" | "quantity";

function authenticatedCore() {
  const createCashOrder = vi.fn(async () => createdOrderResult("PED-20260427-ABC123"));
  const core = createCheckoutActionCore({
    createCashOrder,
    readSessionCookie: () => "customer-token",
    requireCustomerSession: vi.fn(async () => customerSession("customer-a")),
  });

  return { core, createCashOrder };
}

function createdOrderResult(publicCode: string) {
  return {
    ok: true,
    data: {
      publicCode,
      redirectPath: `/pedido/${publicCode}`,
    },
  } as const;
}

function checkoutForm(options: CheckoutFormOptions = {}) {
  const formData = new FormData();
  const fields = {
    ...validCheckoutFields(),
    ...(options.fields ?? {}),
  };
  const items = options.items ?? [{ productId: "product-a", quantity: "2" }];

  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }

  items.forEach((item, index) => {
    const itemFields = {
      productId: "product-a",
      quantity: "2",
      ...item,
    };

    for (const [key, value] of Object.entries(itemFields)) {
      formData.set(`items.${index}.${key}`, value);
    }
  });

  for (const [key, value] of Object.entries(options.extra ?? {})) {
    formData.set(key, value);
  }

  return formData;
}

function validCheckoutFields() {
  return {
    establishmentId: "establishment-a",
    customerName: "Maria Cliente",
    customerPhone: "11999999999",
    deliveryStreet: "Rua das Flores",
    deliveryNumber: "42A",
    deliveryComplement: "apto 7",
    deliveryNeighborhood: "Centro",
    deliveryCity: "São Paulo",
    deliveryState: "SP",
    deliveryPostalCode: "01001-000",
    deliveryReference: "portão laranja",
    generalObservation: "tocar campainha",
    paymentMethod: "CASH",
  };
}

function customerSession(id: string): AuthSessionContext {
  const now = new Date("2026-04-27T12:00:00.000Z");

  return {
    session: {
      id: `session-${id}`,
      userId: id,
      expiresAt: new Date("2026-04-28T12:00:00.000Z"),
      lastUsedAt: now,
      revokedAt: null,
      createdAt: now,
    },
    user: {
      id,
      name: "Maria Cliente",
      email: "maria@example.com",
      role: "CUSTOMER",
      status: "ACTIVE",
      phone: "11999999999",
    },
  };
}
