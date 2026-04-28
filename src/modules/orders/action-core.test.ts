import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { AuthError } from "../auth/errors";
import type { AuthSessionContext } from "../auth/types";

import {
  CHECKOUT_ACTION_IDLE_STATE,
  MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
  type CheckoutActionState,
} from "./action-state";
import {
  CHECKOUT_ACTION_MESSAGES,
  MERCHANT_ORDER_TRANSITION_ACTION_MESSAGES,
  createCheckoutActionCore,
  createMerchantOrderTransitionActionCore,
} from "./action-core";
import {
  CHECKOUT_MAX_DELIVERY_REFERENCE_LENGTH,
  CHECKOUT_MAX_GENERAL_OBSERVATION_LENGTH,
} from "./schemas";
import {
  MERCHANT_ORDER_TRANSITION_ERROR_MESSAGES,
  MERCHANT_ORDER_TRANSITION_NOTE_MAX_LENGTH,
  type MerchantOrderTransitionFailureCode,
  type OrderStatusValue,
} from "./service-core";

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

      const errorState = asCheckoutErrorState(state);
      expect(errorState.fieldErrors?.paymentMethod).toContain(
        "Pague em dinheiro para concluir este pedido.",
      );
      expect(errorState.formErrors).toEqual([]);

      const serialized = JSON.stringify(errorState);
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

    const invalidQuantityError = asCheckoutErrorState(invalidQuantity);
    expect(invalidQuantityError.fieldErrors?.["items.0.quantity"]).toBeDefined();
    expect(invalidQuantityError.values?.items).toEqual([
      { productId: "product-a", quantity: "abc" },
    ]);

    const emptyCart = await core.checkoutOrderAction(
      CHECKOUT_ACTION_IDLE_STATE,
      checkoutForm({ items: [] }),
    );

    const emptyCartError = asCheckoutErrorState(emptyCart);
    expect(emptyCartError.fieldErrors?.items).toContain(
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

    const malformedError = asCheckoutErrorState(malformed);
    expect(malformedError.fieldErrors?.establishmentId).toContain(
      "Informe o identificador da loja.",
    );
    expect(malformedError.fieldErrors?.deliveryReference).toContain(
      `Informe uma referência com até ${CHECKOUT_MAX_DELIVERY_REFERENCE_LENGTH} caracteres.`,
    );
    expect(malformedError.fieldErrors?.generalObservation).toContain(
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

    const forgedError = asCheckoutErrorState(forged);

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
      expect(forgedError.fieldErrors?.[field]).toContain("Campo não permitido.");
    }

    const serialized = JSON.stringify(forgedError);
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
    const errorState = asCheckoutErrorState(state);
    expect(errorState.fieldErrors?.publicCode).toBeUndefined();
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

describe("merchant order status transition server action core", () => {
  it("rejects missing, wrong-role, and thrown guard failures before service or revalidation", async () => {
    const missingService = vi.fn();
    const missingGuard = vi.fn(async (rawToken: unknown) => {
      expect(rawToken).toBeUndefined();
      throw new AuthError("TOKEN_INVALID", "raw merchant session token missing");
    });
    const missingCore = createMerchantOrderTransitionActionCore({
      orderService: {
        transitionMerchantOrderStatusForOwner: missingService,
      },
      readSessionCookie: () => undefined,
      requireMerchantSession: missingGuard,
      revalidatePath: vi.fn(),
    });

    const missing = await missingCore.transitionMerchantOrderStatusAction(
      MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
      merchantTransitionForm(),
    );

    expect(missing).toMatchObject({
      status: "error",
      message: "Sessão inválida. Faça login novamente.",
    });
    expect(JSON.stringify(missing)).not.toContain("session token");
    expect(missingService).not.toHaveBeenCalled();

    for (const role of ["ADMIN", "CUSTOMER"] as const) {
      const service = vi.fn();
      const revalidatePath = vi.fn();
      const roleCore = createMerchantOrderTransitionActionCore({
        orderService: {
          transitionMerchantOrderStatusForOwner: service,
        },
        readSessionCookie: () => `${role.toLowerCase()}-token`,
        requireMerchantSession: vi.fn(async (rawToken: unknown) => {
          expect(rawToken).toBe(`${role.toLowerCase()}-token`);
          throw new AuthError(
            "FORBIDDEN_ROLE",
            `Role ${role} cannot access merchant transitions.`,
          );
        }),
        revalidatePath,
      });

      const forbidden = await roleCore.transitionMerchantOrderStatusAction(
        MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
        merchantTransitionForm(),
      );

      expect(forbidden).toMatchObject({
        status: "error",
        message: "Você não tem permissão para acessar esta área.",
      });
      expect(JSON.stringify(forbidden)).not.toContain(role);
      expect(service).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    }

    const thrownService = vi.fn();
    const thrownCore = createMerchantOrderTransitionActionCore({
      orderService: {
        transitionMerchantOrderStatusForOwner: thrownService,
      },
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: async () => {
        throw new Error("AUTH_SECRET tokenHash stack raw merchant token");
      },
      revalidatePath: vi.fn(),
    });

    const thrown = await thrownCore.transitionMerchantOrderStatusAction(
      MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
      merchantTransitionForm(),
    );

    expect(thrown).toMatchObject({
      status: "error",
      message: "Configuração de autenticação indisponível. Contate o suporte.",
    });
    const serializedThrown = JSON.stringify(thrown);
    expect(serializedThrown).not.toContain("AUTH_SECRET");
    expect(serializedThrown).not.toContain("tokenHash");
    expect(serializedThrown).not.toContain("merchant token");
    expect(thrownService).not.toHaveBeenCalled();
  });

  it("delegates an allowlisted payload and revalidates exact merchant and public paths on success", async () => {
    const orderId = "order/with space";
    const servicePublicCode = "PED-20260427-SERVICE1";
    const forgedPublicCode = "PED-20260427-FORGED1";
    const changedAt = new Date("2026-04-27T16:30:00.000Z");
    const transitionMerchantOrderStatusForOwner = vi.fn(
      async (ownerId: string, input: unknown) => {
        expect(ownerId).toBe("merchant-a");
        expect(input).toEqual({
          orderId,
          expectedStatus: "PENDING",
          targetStatus: "ACCEPTED",
          note: "Confirmar pedido",
        });
        expect(input).not.toHaveProperty("ownerId");
        expect(input).not.toHaveProperty("establishmentId");
        expect(input).not.toHaveProperty("changedById");
        expect(input).not.toHaveProperty("acceptedAt");
        expect(input).not.toHaveProperty("status");
        expect(input).not.toHaveProperty("publicCode");

        return merchantTransitionSuccess({
          publicCode: servicePublicCode,
          previousStatus: "PENDING",
          status: "ACCEPTED",
          note: "Confirmar pedido",
          changedAt,
          id: "internal-order-id",
          ownerId: "merchant-a",
          publicCodeFromBrowser: forgedPublicCode,
        });
      },
    );
    const revalidatePath = vi.fn(async (_path: string) => undefined);
    const core = createMerchantOrderTransitionActionCore({
      orderService: { transitionMerchantOrderStatusForOwner },
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: async () => merchantSession("merchant-a"),
      revalidatePath,
    });

    const state = await core.transitionMerchantOrderStatusAction(
      MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
      merchantTransitionForm({
        fields: {
          orderId,
          expectedStatus: "PENDING",
          targetStatus: "ACCEPTED",
          note: "Confirmar pedido",
        },
        extra: {
          ownerId: "forged-owner",
          establishmentId: "forged-establishment",
          changedById: "forged-user",
          acceptedAt: "1999-01-01T00:00:00.000Z",
          updatedAt: "1999-01-01T00:00:00.000Z",
          status: "DELIVERED",
          publicCode: forgedPublicCode,
        },
      }),
    );

    expect(state).toEqual({
      status: "success",
      message: MERCHANT_ORDER_TRANSITION_ACTION_MESSAGES.SUCCESS,
      publicCode: servicePublicCode,
      previousStatus: "PENDING",
      currentStatus: "ACCEPTED",
      note: "Confirmar pedido",
      changedAt: changedAt.toISOString(),
    });
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/estabelecimento",
      "/estabelecimento/pedidos",
      `/estabelecimento/pedidos/${encodeURIComponent(orderId)}`,
      `/pedido/${encodeURIComponent(servicePublicCode)}`,
    ]);

    const serialized = JSON.stringify(state);
    for (const forbiddenFragment of [
      "internal-order-id",
      "merchant-a",
      "forged-owner",
      "forged-establishment",
      "forged-user",
      forgedPublicCode,
      orderId,
    ]) {
      expect(serialized).not.toContain(forbiddenFragment);
    }
  });

  it("maps typed S03 transition failures to safe action errors without revalidation or raw service echoes", async () => {
    const failureCodes = [
      "STALE_STATUS",
      "ORDER_NOT_FOUND",
      "INVALID_TRANSITION",
      "DATABASE_ERROR",
    ] as const satisfies readonly MerchantOrderTransitionFailureCode[];

    for (const code of failureCodes) {
      const transitionMerchantOrderStatusForOwner = vi.fn(async () => ({
        ...merchantTransitionFailure(code),
        message: `Prisma DATABASE_URL raw ${code} internal-order-id`,
        formErrors: ["provider payload should stay private"],
        ownerId: "merchant-secret",
        publicCode: "PED-20260427-SECRET1",
      }));
      const revalidatePath = vi.fn();
      const core = createMerchantOrderTransitionActionCore({
        orderService: { transitionMerchantOrderStatusForOwner },
        readSessionCookie: () => "merchant-token",
        requireMerchantSession: async () => merchantSession("merchant-a"),
        revalidatePath,
      });

      const state = await core.transitionMerchantOrderStatusAction(
        MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
        merchantTransitionForm({
          fields: {
            targetStatus: "ACCEPTED",
            note: "Confirmar pedido",
          },
        }),
      );
      const safeMessage = MERCHANT_ORDER_TRANSITION_ERROR_MESSAGES[code];

      expect(state).toMatchObject({
        status: "error",
        message: safeMessage,
        formErrors: [safeMessage],
        values: {
          targetStatus: "ACCEPTED",
          note: "Confirmar pedido",
        },
      });
      expect(revalidatePath).not.toHaveBeenCalled();

      const serialized = JSON.stringify(state);
      for (const forbiddenFragment of [
        "Prisma",
        "DATABASE_URL",
        "provider payload",
        "merchant-secret",
        "internal-order-id",
        "PED-20260427-SECRET1",
        code,
      ]) {
        expect(serialized).not.toContain(forbiddenFragment);
      }
    }
  });

  it("does not trust malformed form values or forged browser fields and preserves only safe recovery values", async () => {
    const oversizedNote = "x".repeat(MERCHANT_ORDER_TRANSITION_NOTE_MAX_LENGTH + 1);
    const malformedService = vi.fn(async (_ownerId: string, input: unknown) => {
      expect(input).toEqual({
        orderId: " ",
        expectedStatus: "BOGUS_STATUS",
        targetStatus: "DROP_TABLE",
        note: oversizedNote,
      });
      expect(input).not.toHaveProperty("ownerId");
      expect(input).not.toHaveProperty("establishmentId");
      expect(input).not.toHaveProperty("publicCode");

      return merchantTransitionFailure("INVALID_NOTE");
    });
    const malformedCore = createMerchantOrderTransitionActionCore({
      orderService: {
        transitionMerchantOrderStatusForOwner: malformedService,
      },
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: async () => merchantSession("merchant-a"),
      revalidatePath: vi.fn(),
    });

    const malformed = await malformedCore.transitionMerchantOrderStatusAction(
      MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
      merchantTransitionForm({
        fields: {
          orderId: " ",
          expectedStatus: "BOGUS_STATUS",
          targetStatus: "DROP_TABLE",
          note: oversizedNote,
        },
        extra: {
          ownerId: "forged-owner",
          establishmentId: "forged-establishment",
          publicCode: "PED-20260427-FORGED1",
        },
      }),
    );

    expect(malformed).toMatchObject({
      status: "error",
      message: MERCHANT_ORDER_TRANSITION_ERROR_MESSAGES.INVALID_NOTE,
      fieldErrors: {
        note: [MERCHANT_ORDER_TRANSITION_ERROR_MESSAGES.INVALID_NOTE],
      },
      values: {
        targetStatus: "",
        note: "",
      },
    });
    expect(JSON.stringify(malformed)).not.toContain("DROP_TABLE");
    expect(JSON.stringify(malformed)).not.toContain(oversizedNote);

    const missingService = vi.fn(async (_ownerId: string, input: unknown) => {
      expect(input).toEqual({
        orderId: "",
        expectedStatus: "PENDING",
        targetStatus: "ACCEPTED",
        note: "",
      });

      return merchantTransitionFailure("INVALID_ORDER");
    });
    const missingCore = createMerchantOrderTransitionActionCore({
      orderService: {
        transitionMerchantOrderStatusForOwner: missingService,
      },
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: async () => merchantSession("merchant-a"),
      revalidatePath: vi.fn(),
    });
    const missingOrderForm = new FormData();
    missingOrderForm.set("expectedStatus", "PENDING");
    missingOrderForm.set("targetStatus", "ACCEPTED");

    const missing = await missingCore.transitionMerchantOrderStatusAction(
      MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
      missingOrderForm,
    );

    expect(missing).toMatchObject({
      status: "error",
      message: MERCHANT_ORDER_TRANSITION_ERROR_MESSAGES.INVALID_ORDER,
    });

    const blobService = vi.fn(async (_ownerId: string, input: unknown) => {
      expect(input).toEqual({
        orderId: "order-a",
        expectedStatus: "PENDING",
        targetStatus: "ACCEPTED",
        note: "",
      });

      return merchantTransitionFailure("INVALID_NOTE");
    });
    const blobCore = createMerchantOrderTransitionActionCore({
      orderService: {
        transitionMerchantOrderStatusForOwner: blobService,
      },
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: async () => merchantSession("merchant-a"),
      revalidatePath: vi.fn(),
    });
    const blobForm = merchantTransitionForm();
    blobForm.set("note", new Blob(["raw-binary-secret"]));

    const blobState = await blobCore.transitionMerchantOrderStatusAction(
      MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
      blobForm,
    );

    expect(blobState).toMatchObject({
      status: "error",
      message: MERCHANT_ORDER_TRANSITION_ERROR_MESSAGES.INVALID_NOTE,
      values: {
        targetStatus: "ACCEPTED",
        note: "",
      },
    });
    expect(JSON.stringify(blobState)).not.toContain("raw-binary-secret");
  });

  it("accepts exact max-length and blank notes through the service boundary", async () => {
    const exactMaxNote = "x".repeat(MERCHANT_ORDER_TRANSITION_NOTE_MAX_LENGTH);
    const transitionMerchantOrderStatusForOwner = vi.fn(async () =>
      merchantTransitionSuccess({ note: exactMaxNote }),
    );
    const core = createMerchantOrderTransitionActionCore({
      orderService: { transitionMerchantOrderStatusForOwner },
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: async () => merchantSession("merchant-a"),
      revalidatePath: vi.fn(async (_path: string) => undefined),
    });

    const exactMax = await core.transitionMerchantOrderStatusAction(
      MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
      merchantTransitionForm({ fields: { note: exactMaxNote } }),
    );

    expect(exactMax.status).toBe("success");
    expect(transitionMerchantOrderStatusForOwner).toHaveBeenLastCalledWith(
      "merchant-a",
      expect.objectContaining({ note: exactMaxNote }),
    );

    const blank = await core.transitionMerchantOrderStatusAction(
      MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
      merchantTransitionForm({ fields: { note: "   " } }),
    );

    expect(blank.status).toBe("success");
    expect(transitionMerchantOrderStatusForOwner).toHaveBeenLastCalledWith(
      "merchant-a",
      expect.objectContaining({ note: "   " }),
    );
  });

  it("collapses thrown or malformed service results to a generic retryable message", async () => {
    const rejectingCore = createMerchantOrderTransitionActionCore({
      orderService: {
        transitionMerchantOrderStatusForOwner: vi.fn(async () => {
          throw new Error("Prisma DATABASE_URL transaction timeout raw payload");
        }),
      },
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: async () => merchantSession("merchant-a"),
      revalidatePath: vi.fn(),
    });

    const rejected = await rejectingCore.transitionMerchantOrderStatusAction(
      MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
      merchantTransitionForm(),
    );

    expect(rejected).toMatchObject({
      status: "error",
      message: MERCHANT_ORDER_TRANSITION_ACTION_MESSAGES.GENERIC_FAILURE,
      formErrors: [MERCHANT_ORDER_TRANSITION_ACTION_MESSAGES.GENERIC_FAILURE],
      values: {
        targetStatus: "ACCEPTED",
        note: "Confirmar pedido",
      },
    });
    expect(JSON.stringify(rejected)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(rejected)).not.toContain("raw payload");

    for (const malformedResult of [
      {
        ok: true,
        data: {
          publicCode: "internal-order-id",
          previousStatus: "PENDING",
          status: "ACCEPTED",
          changedAt: new Date("2026-04-27T16:30:00.000Z"),
          providerPayload: "secret-provider-payload",
        },
      },
      {
        ok: false,
        code: "SECRET_INTERNAL_CODE",
        message: "Prisma stack should not leak",
        ownerId: "merchant-secret",
      },
    ]) {
      const revalidatePath = vi.fn();
      const malformedCore = createMerchantOrderTransitionActionCore({
        orderService: {
          transitionMerchantOrderStatusForOwner: vi.fn(async () => malformedResult),
        },
        readSessionCookie: () => "merchant-token",
        requireMerchantSession: async () => merchantSession("merchant-a"),
        revalidatePath,
      });

      const malformed = await malformedCore.transitionMerchantOrderStatusAction(
        MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
        merchantTransitionForm(),
      );

      expect(malformed).toMatchObject({
        status: "error",
        message: MERCHANT_ORDER_TRANSITION_ACTION_MESSAGES.GENERIC_FAILURE,
      });
      expect(revalidatePath).not.toHaveBeenCalled();

      const serializedMalformed = JSON.stringify(malformed);
      for (const forbiddenFragment of [
        "internal-order-id",
        "secret-provider-payload",
        "SECRET_INTERNAL_CODE",
        "Prisma stack",
        "merchant-secret",
      ]) {
        expect(serializedMalformed).not.toContain(forbiddenFragment);
      }
    }
  });

  it("returns safe refresh guidance when revalidation throws after the mutation succeeds", async () => {
    const servicePublicCode = "PED-20260427-SERVICE1";
    const revalidatePath = vi.fn(async (path: string) => {
      if (path === "/estabelecimento/pedidos") {
        throw new Error("Next cache DATABASE_URL internals");
      }
    });
    const core = createMerchantOrderTransitionActionCore({
      orderService: {
        transitionMerchantOrderStatusForOwner: vi.fn(async () =>
          merchantTransitionSuccess({ publicCode: servicePublicCode }),
        ),
      },
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: async () => merchantSession("merchant-a"),
      revalidatePath,
    });

    const state = await core.transitionMerchantOrderStatusAction(
      MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
      merchantTransitionForm({ fields: { orderId: "order-a" } }),
    );

    expect(state).toMatchObject({
      status: "success",
      message: MERCHANT_ORDER_TRANSITION_ACTION_MESSAGES.REVALIDATION_FAILURE,
      publicCode: servicePublicCode,
    });
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/estabelecimento",
      "/estabelecimento/pedidos",
      "/estabelecimento/pedidos/order-a",
      `/pedido/${servicePublicCode}`,
    ]);
    expect(JSON.stringify(state)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(state)).not.toContain("Next cache");
  });

  it("keeps checkout exported while wiring the merchant transition action in actions.ts", () => {
    const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");

    expect(source).toContain("createCheckoutActionCore");
    expect(source).toContain("checkoutOrderAction");
    expect(source).toContain("createMerchantOrderTransitionActionCore");
    expect(source).toContain("transitionMerchantOrderStatusAction");
    expect(source).toContain("requireMerchantSession");
    expect(source).toContain("revalidatePath");
  });
});

type CheckoutFormOptions = {
  fields?: Partial<Record<CheckoutRootFieldName, string>>;
  items?: Array<Partial<Record<CheckoutItemFieldName, string>>>;
  extra?: Record<string, string>;
};

type CheckoutRootFieldName = keyof ReturnType<typeof validCheckoutFields>;
type CheckoutItemFieldName = "productId" | "quantity";
type CheckoutErrorState = Extract<CheckoutActionState, { status: "error" }>;

function asCheckoutErrorState(state: CheckoutActionState): CheckoutErrorState {
  expect(state.status).toBe("error");

  if (state.status !== "error") {
    throw new Error("Expected checkout action error state.");
  }

  return state;
}

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

type MerchantTransitionFormOptions = {
  fields?: Partial<Record<MerchantTransitionFieldName, string>>;
  extra?: Record<string, string>;
};

type MerchantTransitionFieldName =
  | "orderId"
  | "expectedStatus"
  | "targetStatus"
  | "note";

type MerchantTransitionSuccessOverrides = Partial<{
  publicCode: string;
  previousStatus: OrderStatusValue;
  status: OrderStatusValue;
  note: string | null;
  changedAt: Date;
}> &
  Record<string, unknown>;

function merchantTransitionForm(options: MerchantTransitionFormOptions = {}) {
  const formData = new FormData();
  const fields = {
    orderId: "order-a",
    expectedStatus: "PENDING",
    targetStatus: "ACCEPTED",
    note: "Confirmar pedido",
    ...(options.fields ?? {}),
  };

  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }

  for (const [key, value] of Object.entries(options.extra ?? {})) {
    formData.set(key, value);
  }

  return formData;
}

function merchantTransitionSuccess(
  overrides: MerchantTransitionSuccessOverrides = {},
) {
  const changedAt =
    overrides.changedAt ?? new Date("2026-04-27T16:30:00.000Z");

  return {
    ok: true,
    data: {
      publicCode: "PED-20260427-SERVICE1",
      previousStatus: "PENDING",
      status: "ACCEPTED",
      placedAt: new Date("2026-04-27T15:00:00.000Z"),
      acceptedAt: changedAt,
      deliveredAt: null,
      canceledAt: null,
      updatedAt: changedAt,
      note: "Confirmar pedido",
      changedAt,
      ...overrides,
    },
  } as const;
}

function merchantTransitionFailure(code: MerchantOrderTransitionFailureCode) {
  return {
    ok: false,
    code,
    message: MERCHANT_ORDER_TRANSITION_ERROR_MESSAGES[code],
    retryable: code === "DATABASE_ERROR",
  } as const;
}

function merchantSession(id: string): AuthSessionContext {
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
      name: "Mercado Sextou",
      email: "merchant@example.com",
      role: "MERCHANT",
      status: "ACTIVE",
      phone: "11988887777",
    },
  };
}
