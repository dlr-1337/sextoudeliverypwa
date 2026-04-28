import { describe, expect, it, vi } from "vitest";

import {
  ALLOWED_MERCHANT_ORDER_TRANSITIONS,
  buildMerchantOrderTransitionTimestampData,
  canMerchantTransitionOrderStatus,
  createCashOrderCore,
  createOrderServiceCore,
  MERCHANT_ORDER_DETAIL_SELECT,
  MERCHANT_ORDER_ESTABLISHMENT_SELECT,
  MERCHANT_ORDER_LIST_LIMIT,
  MERCHANT_ORDER_LIST_SELECT,
  MERCHANT_ORDER_TRANSITION_ESTABLISHMENT_SELECT,
  MERCHANT_ORDER_TRANSITION_NOTE_MAX_LENGTH,
  MERCHANT_ORDER_TRANSITION_SELECT,
  ORDER_STATUS_VALUES,
  PUBLIC_ORDER_READ_SELECT,
  parseMerchantOrderTransitionInput,
  parseMerchantOrderTransitionOwnerId,
  type CashOrderFailureCode,
  type CashOrderResult,
  type CreatedCashOrder,
  type MerchantOrderDetailFailureCode,
  type MerchantOrderDetailRow,
  type MerchantOrderListFailureCode,
  type MerchantOrderListRow,
  type MerchantOrderTransitionFailureCode,
  type MerchantOrderTransitionResult,
  type OrderServiceClient,
  type OrderServiceTransactionClient,
  type OrderStatusValue,
  type PublicOrderReadRow,
} from "./service-core";
import type {
  PaymentGatewayProvider,
  PaymentInitiationInput,
  PaymentInitiationResult,
  PaymentInitiationSuccessData,
} from "../payments/types";
import type { CheckoutOrderPayload } from "./schemas";

const NOW = new Date("2026-04-27T12:30:00.000Z");

describe("cash order service core", () => {
  it("creates a CASH order transaction from authenticated customer and DB-owned prices", async () => {
    const db = createFakeOrderDb({
      establishments: [buildEstablishment({ id: "est-a", deliveryFee: "5.50" })],
      products: [
        buildProduct({ id: "product-a", establishmentId: "est-a", price: "19.90" }),
      ],
    });
    const core = createCashOrderCore({
      db,
      now: () => NOW,
      generatePublicCode: () => "PED-20260427-0001",
    });

    const result = await core.createCashOrder(
      " customer-a ",
      checkoutPayload({ items: [{ productId: "product-a", quantity: 2 }] }),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        publicCode: "PED-20260427-0001",
        redirectPath: "/pedido/PED-20260427-0001",
      },
    });
    expect(db.calls.transactionCount).toBe(1);
    expect(db.calls.establishmentFindUnique[0]).toMatchObject({
      where: { id: "est-a" },
    });
    expect(db.calls.productFindMany[0]).toMatchObject({
      where: { id: { in: ["product-a"] } },
    });
    expect(db.data.orders).toEqual([
      expect.objectContaining({
        id: "order-1",
        publicCode: "PED-20260427-0001",
        establishmentId: "est-a",
        customerId: "customer-a",
        status: "PENDING",
        paymentMethod: "CASH",
        paymentStatus: "MANUAL_CASH_ON_DELIVERY",
        subtotal: "39.80",
        deliveryFee: "5.50",
        discount: "0.00",
        total: "45.30",
        placedAt: NOW,
      }),
    ]);
    expect(db.data.orderItems).toEqual([
      expect.objectContaining({
        orderId: "order-1",
        productId: "product-a",
        productName: "Batata frita",
        unitPrice: "19.90",
        quantity: 2,
        total: "39.80",
      }),
    ]);
    expect(db.data.payments).toEqual([
      expect.objectContaining({
        orderId: "order-1",
        method: "CASH",
        status: "MANUAL_CASH_ON_DELIVERY",
        amount: "45.30",
        provider: null,
        providerPaymentId: null,
        providerStatus: null,
        providerPayload: null,
        pixQrCode: null,
        pixCopyPaste: null,
        pixExpiresAt: null,
        cardBrand: null,
        cardLast4: null,
      }),
    ]);
    expect(db.data.orderStatusHistory).toEqual([
      expect.objectContaining({
        orderId: "order-1",
        status: "PENDING",
        changedById: "customer-a",
        note: "Pedido criado pelo checkout.",
        createdAt: NOW,
      }),
    ]);
  });

  it("recalculates multi-item totals from DB snapshots and ignores forged browser authority", async () => {
    const db = createFakeOrderDb({
      establishments: [buildEstablishment({ id: "est-a", deliveryFee: "3.25" })],
      products: [
        buildProduct({ id: "product-a", establishmentId: "est-a", price: "10.00" }),
        buildProduct({
          id: "product-b",
          establishmentId: "est-a",
          name: "Refrigerante",
          price: "4.50",
        }),
      ],
    });
    const core = createCashOrderCore({
      db,
      now: () => NOW,
      generatePublicCode: () => "PED-20260427-0002",
    });
    const forgedPayload = {
      ...checkoutPayload({
        items: [
          { productId: "product-a", quantity: 2, price: "0.01", total: "0.02" },
          { productId: "product-b", quantity: 3, price: "0.01", total: "0.03" },
        ] as unknown as CheckoutOrderPayload["items"],
      }),
      subtotal: "0.05",
      total: "0.05",
      discount: "100.00",
      status: "DELIVERED",
      paymentStatus: "PAID",
      customerId: "forged-customer",
      provider: "forged-provider",
      providerPayload: { token: "provider-secret" },
    } as unknown as CheckoutOrderPayload;

    const result = await core.createCashOrder("customer-a", forgedPayload);

    expect(result.ok).toBe(true);
    expect(db.data.orders[0]).toMatchObject({
      subtotal: "33.50",
      deliveryFee: "3.25",
      discount: "0.00",
      total: "36.75",
      customerId: "customer-a",
      status: "PENDING",
      paymentStatus: "MANUAL_CASH_ON_DELIVERY",
    });
    expect(db.data.orderItems).toEqual([
      expect.objectContaining({
        productId: "product-a",
        productName: "Batata frita",
        unitPrice: "10.00",
        quantity: 2,
        total: "20.00",
      }),
      expect.objectContaining({
        productId: "product-b",
        productName: "Refrigerante",
        unitPrice: "4.50",
        quantity: 3,
        total: "13.50",
      }),
    ]);
    expect(db.data.payments[0]).toMatchObject({
      amount: "36.75",
      provider: null,
      providerPayload: null,
    });

    const persisted = JSON.stringify(db.data);
    expect(persisted).not.toContain("0.01");
    expect(persisted).not.toContain("0.05");
    expect(persisted).not.toContain("100.00");
    expect(persisted).not.toContain("forged-customer");
    expect(persisted).not.toContain("forged-provider");
    expect(persisted).not.toContain("provider-secret");
    expect(persisted).not.toContain("DELIVERED");
    expect(persisted).not.toContain("PAID");
  });

  it("rejects malformed cart/payment inputs before opening a transaction", async () => {
    for (const scenario of [
      {
        payload: checkoutPayload({ items: [] }),
        code: "VALIDATION_FAILED",
        field: "items",
      },
      {
        payload: checkoutPayload({
          items: [
            { productId: "product-a", quantity: 1 },
            { productId: "product-a", quantity: 2 },
          ],
        }),
        code: "DUPLICATE_ITEM",
        field: "items.1.productId",
      },
      {
        payload: checkoutPayload({
          items: [{ productId: "product-a", quantity: 0 }],
        } as unknown as Partial<CheckoutOrderPayload>),
        code: "VALIDATION_FAILED",
        field: "items.0.quantity",
      },
      {
        payload: checkoutPayload({
          paymentMethod: "PIX",
        } as unknown as Partial<CheckoutOrderPayload>),
        code: "UNSUPPORTED_PAYMENT_METHOD",
        field: "paymentMethod",
      },
    ] satisfies Array<{
      payload: CheckoutOrderPayload;
      code: CashOrderFailureCode;
      field: string;
    }>) {
      const db = createFakeOrderDb({
        establishments: [buildEstablishment()],
        products: [buildProduct()],
      });
      const core = createCashOrderCore({ db });

      const failure = expectFailure(
        await core.createCashOrder("customer-a", scenario.payload),
        scenario.code,
      );

      expect(failure.fieldErrors[scenario.field]).toBeDefined();
      expect(db.calls.transactionCount).toBe(0);
      expectNoWrites(db);
    }
  });

  it("rejects unavailable stores/products and mixed-store carts inside the transaction without writes", async () => {
    for (const scenario of [
      {
        db: createFakeOrderDb({
          establishments: [],
          products: [buildProduct()],
        }),
        code: "STORE_UNAVAILABLE",
      },
      {
        db: createFakeOrderDb({
          establishments: [buildEstablishment({ status: "BLOCKED" })],
          products: [buildProduct()],
        }),
        code: "STORE_UNAVAILABLE",
      },
      {
        db: createFakeOrderDb({
          establishments: [buildEstablishment()],
          products: [],
        }),
        code: "PRODUCT_UNAVAILABLE",
      },
      {
        db: createFakeOrderDb({
          establishments: [buildEstablishment()],
          products: [buildProduct({ status: "PAUSED" })],
        }),
        code: "PRODUCT_UNAVAILABLE",
      },
      {
        db: createFakeOrderDb({
          establishments: [buildEstablishment({ id: "est-a" })],
          products: [buildProduct({ establishmentId: "est-b" })],
        }),
        code: "PRODUCT_FROM_DIFFERENT_STORE",
      },
      {
        db: createFakeOrderDb({
          establishments: [buildEstablishment({ deliveryFee: "not-money" })],
          products: [buildProduct()],
        }),
        code: "STORE_UNAVAILABLE",
      },
      {
        db: createFakeOrderDb({
          establishments: [buildEstablishment()],
          products: [buildProduct({ price: "not-money" })],
        }),
        code: "PRODUCT_UNAVAILABLE",
      },
    ] satisfies Array<{
      db: ReturnType<typeof createFakeOrderDb>;
      code: CashOrderFailureCode;
    }>) {
      const core = createCashOrderCore({ db: scenario.db });

      expectFailure(
        await core.createCashOrder("customer-a", checkoutPayload()),
        scenario.code,
      );

      expect(scenario.db.calls.transactionCount).toBe(1);
      expectNoWrites(scenario.db);
    }
  });

  it("rolls back order, item, payment and history writes when a transaction write fails", async () => {
    for (const failOn of ["orderItemCreateMany", "paymentCreate", "historyCreate"] as const) {
      const db = createFakeOrderDb({
        establishments: [buildEstablishment()],
        products: [buildProduct()],
        failOn,
      });
      const core = createCashOrderCore({
        db,
        now: () => NOW,
        generatePublicCode: () => "PED-20260427-ROLLBACK",
      });

      const failure = expectFailure(
        await core.createCashOrder("customer-a", checkoutPayload()),
        "TRANSACTION_FAILED",
      );

      expect(failure.retryable).toBe(true);
      expect(db.calls.transactionCount).toBe(1);
      expectNoWrites(db);
    }
  });

  it("maps public-code collisions to a safe retryable error without leaking raw database details", async () => {
    const db = createFakeOrderDb({
      establishments: [buildEstablishment()],
      products: [buildProduct()],
      failOn: "publicCodeCollision",
    });
    const core = createCashOrderCore({
      db,
      now: () => NOW,
      generatePublicCode: () => "PED-COLLISION",
    });

    const failure = expectFailure(
      await core.createCashOrder("customer-a", checkoutPayload()),
      "PUBLIC_CODE_COLLISION",
    );

    expect(failure.retryable).toBe(true);
    expect(JSON.stringify(failure)).not.toContain("public_code");
    expect(JSON.stringify(failure)).not.toContain("P2002");
    expectNoWrites(db);
  });

  it("retries public-code collisions with bounded fresh codes before creating the order", async () => {
    const db = createFakeOrderDb({
      establishments: [buildEstablishment()],
      products: [buildProduct()],
      publicCodeCollisionsBeforeSuccess: 2,
    });
    const generatePublicCode = vi
      .fn()
      .mockReturnValueOnce("PED-20260427-ABC123")
      .mockReturnValueOnce("PED-20260427-DEF456")
      .mockReturnValueOnce("PED-20260427-GHI789");
    const service = createOrderServiceCore({
      db,
      now: () => NOW,
      generatePublicCode,
      maxPublicCodeAttempts: 3,
    });

    const result = await service.createCashOrder("customer-a", checkoutPayload());

    expect(result).toEqual({
      ok: true,
      data: {
        publicCode: "PED-20260427-GHI789",
        redirectPath: "/pedido/PED-20260427-GHI789",
      },
    });
    expect(generatePublicCode).toHaveBeenCalledTimes(3);
    expect(db.calls.transactionCount).toBe(3);
    expect(db.calls.orderCreate).toHaveLength(3);
    expect(db.data.orders).toEqual([
      expect.objectContaining({ publicCode: "PED-20260427-GHI789" }),
    ]);
    expect(db.data.payments).toHaveLength(1);
    expect(db.data.orderStatusHistory).toHaveLength(1);
  });

  it("rejects invalid generated public codes without persisting order evidence", async () => {
    const db = createFakeOrderDb({
      establishments: [buildEstablishment()],
      products: [buildProduct()],
    });
    const service = createOrderServiceCore({
      db,
      now: () => NOW,
      generatePublicCode: () => "",
      maxPublicCodeAttempts: 2,
    });

    const failure = expectFailure(
      await service.createCashOrder("customer-a", checkoutPayload()),
      "PUBLIC_CODE_COLLISION",
    );

    expect(failure.retryable).toBe(true);
    expect(db.calls.transactionCount).toBe(2);
    expectNoWrites(db);
  });

  it("creates CASH through the generic checkout path without provider/config helpers", async () => {
    const db = createFakeOrderDb({
      establishments: [buildEstablishment({ deliveryFee: "5.50" })],
      products: [buildProduct()],
    });
    const getPaymentGatewayProvider = vi.fn((): PaymentGatewayProvider => {
      throw new Error("CASH must not request a payment provider");
    });
    const generateInternalOrderId = vi.fn(() => "order-online-should-not-run");
    const getAppBaseUrl = vi.fn(() => "https://app.example.test");
    const service = createOrderServiceCore({
      db,
      now: () => NOW,
      generatePublicCode: () => "PED-20260427-CASH02",
      generateInternalOrderId,
      getPaymentGatewayProvider,
      getAppBaseUrl,
    });

    const result = await service.createCheckoutOrder(
      " customer-a ",
      checkoutPayload({ paymentMethod: "CASH" }),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        publicCode: "PED-20260427-CASH02",
        redirectPath: "/pedido/PED-20260427-CASH02",
      },
    });
    expect(getPaymentGatewayProvider).not.toHaveBeenCalled();
    expect(generateInternalOrderId).not.toHaveBeenCalled();
    expect(getAppBaseUrl).not.toHaveBeenCalled();
    expect(db.data.payments).toEqual([
      expect.objectContaining({
        method: "CASH",
        status: "MANUAL_CASH_ON_DELIVERY",
        provider: null,
        providerPaymentId: null,
        providerStatus: null,
        providerPayload: null,
        checkoutUrl: null,
        pixQrCode: null,
        pixCopyPaste: null,
        pixExpiresAt: null,
        cardBrand: null,
        cardLast4: null,
      }),
    ]);
  });

  it("persists pending PIX payments with safe provider fields after provider success", async () => {
    const db = createFakeOrderDb({
      establishments: [buildEstablishment({ deliveryFee: "5.50" })],
      products: [buildProduct()],
    });
    const initiatePayment = vi.fn(async (input: unknown): Promise<PaymentInitiationResult> => {
      expect(input).toEqual({
        method: "PIX",
        internalOrderId: "order-online-pix",
        publicOrderCode: "PED-20260427-PIX01",
        establishmentId: "est-a",
        amountCents: 2540,
        currency: "BRL",
        customer: {
          name: "Maria Cliente",
          phone: "11999999999",
          email: null,
        },
        requestedAt: NOW,
        expiresAt: new Date("2026-04-27T13:00:00.000Z"),
      });

      return pixInitiationSuccess({
        providerPaymentId: "fake_dev_pix_safe_001",
        expiresAt: new Date("2026-04-27T13:00:00.000Z"),
      });
    });
    const service = createOrderServiceCore({
      db,
      now: () => NOW,
      generatePublicCode: () => "PED-20260427-PIX01",
      generateInternalOrderId: () => "order-online-pix",
      getPaymentGatewayProvider: () => ({
        provider: "fake-dev",
        initiatePayment,
      }),
    });

    const result = await service.createCheckoutOrder(
      "customer-a",
      checkoutPayload({ paymentMethod: "PIX" }),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        publicCode: "PED-20260427-PIX01",
        redirectPath: "/pedido/PED-20260427-PIX01",
      },
    });
    expect(initiatePayment).toHaveBeenCalledTimes(1);
    expect(db.data.orders).toEqual([
      expect.objectContaining({
        id: "order-online-pix",
        paymentMethod: "PIX",
        paymentStatus: "PENDING",
        total: "25.40",
      }),
    ]);
    expect(db.data.payments).toEqual([
      expect.objectContaining({
        orderId: "order-online-pix",
        method: "PIX",
        status: "PENDING",
        amount: "25.40",
        provider: "fake-dev",
        providerPaymentId: "fake_dev_pix_safe_001",
        providerStatus: "pending",
        providerPayload: null,
        checkoutUrl: null,
        pixQrCode: "fake-dev-pix://fake_dev_pix_safe_001",
        pixCopyPaste: "FAKEDEVPIX|fake_dev_pix_safe_001",
        pixExpiresAt: new Date("2026-04-27T13:00:00.000Z"),
        cardBrand: null,
        cardLast4: null,
        paidAt: null,
        failedAt: null,
      }),
    ]);
  });

  it("persists pending CARD hosted checkout fields without storing card data", async () => {
    const db = createFakeOrderDb({
      establishments: [buildEstablishment({ deliveryFee: "0.00" })],
      products: [buildProduct({ price: "42.00" })],
    });
    const checkoutUrl = "https://payments.example.test/checkout/card-safe-001";
    const initiatePayment = vi.fn(async (input: unknown): Promise<PaymentInitiationResult> => {
      expect(input).toEqual({
        method: "CARD",
        internalOrderId: "order-online-card",
        publicOrderCode: "PED-20260427-CARD01",
        establishmentId: "est-a",
        amountCents: 4200,
        currency: "BRL",
        customer: {
          name: "Maria Cliente",
          phone: "11999999999",
          email: null,
        },
        requestedAt: NOW,
        successUrl: "https://app.example.test/pedido/PED-20260427-CARD01",
        cancelUrl: "https://app.example.test/pedido/PED-20260427-CARD01",
      });

      return cardInitiationSuccess({
        providerPaymentId: "fake_dev_card_safe_001",
        checkoutUrl,
      });
    });
    const service = createOrderServiceCore({
      db,
      now: () => NOW,
      generatePublicCode: () => "PED-20260427-CARD01",
      generateInternalOrderId: () => "order-online-card",
      getAppBaseUrl: () => "https://app.example.test/base/path?ignored=true",
      getPaymentGatewayProvider: () => ({
        provider: "fake-dev",
        initiatePayment,
      }),
    });

    const result = await service.createCheckoutOrder(
      "customer-a",
      checkoutPayload({ paymentMethod: "CARD" }),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        publicCode: "PED-20260427-CARD01",
        redirectPath: "/pedido/PED-20260427-CARD01",
      },
    });
    expect(db.data.orders).toEqual([
      expect.objectContaining({
        id: "order-online-card",
        paymentMethod: "CARD",
        paymentStatus: "PENDING",
        total: "42.00",
      }),
    ]);
    expect(db.data.payments).toEqual([
      expect.objectContaining({
        orderId: "order-online-card",
        method: "CARD",
        status: "PENDING",
        amount: "42.00",
        provider: "fake-dev",
        providerPaymentId: "fake_dev_card_safe_001",
        providerStatus: "pending",
        providerPayload: null,
        checkoutUrl,
        pixQrCode: null,
        pixCopyPaste: null,
        pixExpiresAt: null,
        cardBrand: null,
        cardLast4: null,
      }),
    ]);
    const persisted = JSON.stringify(db.data);
    for (const forbiddenFragment of [
      "cardNumber",
      "cvv",
      "expiry",
      "token",
      "4111111111111111",
    ]) {
      expect(persisted).not.toContain(forbiddenFragment);
    }
  });

  it("fails online checkout safely before provider calls for invalid identifiers and app URLs", async () => {
    const scenarios = [
      {
        payload: checkoutPayload({ paymentMethod: "PIX" }),
        generatePublicCode: () => "",
        generateInternalOrderId: () => "order-online-pix",
        getAppBaseUrl: () => "https://app.example.test",
        code: "PUBLIC_CODE_COLLISION",
        expectedTransactions: 2,
      },
      {
        payload: checkoutPayload({ paymentMethod: "PIX" }),
        generatePublicCode: () => "PED-20260427-PIX02",
        generateInternalOrderId: () => "",
        getAppBaseUrl: () => "https://app.example.test",
        code: "INTERNAL_ORDER_ID_INVALID",
        expectedTransactions: 1,
      },
      {
        payload: checkoutPayload({ paymentMethod: "CARD" }),
        generatePublicCode: () => "PED-20260427-CARD02",
        generateInternalOrderId: () => "order-online-card",
        getAppBaseUrl: () => "not-a-url",
        code: "INVALID_APP_BASE_URL",
        expectedTransactions: 1,
      },
    ] satisfies Array<{
      payload: CheckoutOrderPayload;
      generatePublicCode: () => string;
      generateInternalOrderId: () => string;
      getAppBaseUrl: () => string;
      code: CashOrderFailureCode;
      expectedTransactions: number;
    }>;

    for (const scenario of scenarios) {
      const db = createFakeOrderDb({
        establishments: [buildEstablishment()],
        products: [buildProduct()],
      });
      const getPaymentGatewayProvider = vi.fn((): PaymentGatewayProvider => ({
        provider: "fake-dev",
        initiatePayment: vi.fn(),
      }));
      const service = createOrderServiceCore({
        db,
        now: () => NOW,
        maxPublicCodeAttempts: 2,
        generatePublicCode: scenario.generatePublicCode,
        generateInternalOrderId: scenario.generateInternalOrderId,
        getAppBaseUrl: scenario.getAppBaseUrl,
        getPaymentGatewayProvider,
      });

      const failure = expectFailure(
        await service.createCheckoutOrder("customer-a", scenario.payload),
        scenario.code,
      );

      expect(failure.retryable).toBe(true);
      expect(db.calls.transactionCount).toBe(scenario.expectedTransactions);
      expect(getPaymentGatewayProvider).not.toHaveBeenCalled();
      expectNoWrites(db);
    }
  });

  it("maps provider config, rejection and malformed successes to safe no-write failures", async () => {
    const scenarios = [
      {
        code: "PAYMENT_PROVIDER_CONFIG_INVALID",
        getPaymentGatewayProvider: () => {
          throw new Error("FAKE_PAYMENT_WEBHOOK_SECRET raw config value");
        },
      },
      {
        code: "PAYMENT_PROVIDER_UNAVAILABLE",
        getPaymentGatewayProvider: () => ({
          provider: "fake-dev",
          initiatePayment: async () => {
            throw new Error("provider raw timeout token");
          },
        }),
      },
      {
        code: "PAYMENT_PROVIDER_REJECTED",
        getPaymentGatewayProvider: () => ({
          provider: "fake-dev",
          initiatePayment: async (): Promise<PaymentInitiationResult> => ({
            ok: false,
            code: "PAYMENT_PROVIDER_REJECTED",
            message: "raw provider rejection should not leak",
            retryable: false,
          }),
        }),
      },
      {
        code: "PAYMENT_PROVIDER_MALFORMED_RESULT",
        getPaymentGatewayProvider: () => ({
          provider: "fake-dev",
          initiatePayment: async () => cardInitiationSuccess(),
        }),
      },
      {
        code: "PAYMENT_PROVIDER_MALFORMED_RESULT",
        getPaymentGatewayProvider: () => ({
          provider: "fake-dev",
          initiatePayment: async () =>
            pixInitiationSuccess({ providerPaymentId: "" }),
        }),
      },
    ] satisfies Array<{
      code: CashOrderFailureCode;
      getPaymentGatewayProvider: () => PaymentGatewayProvider;
    }>;

    for (const scenario of scenarios) {
      const db = createFakeOrderDb({
        establishments: [buildEstablishment()],
        products: [buildProduct()],
      });
      const service = createOrderServiceCore({
        db,
        now: () => NOW,
        generatePublicCode: () => "PED-20260427-PIX03",
        generateInternalOrderId: () => "order-online-pix",
        getPaymentGatewayProvider: scenario.getPaymentGatewayProvider,
      });

      const failure = expectFailure(
        await service.createCheckoutOrder(
          "customer-a",
          checkoutPayload({ paymentMethod: "PIX" }),
        ),
        scenario.code,
      );

      expect(JSON.stringify(failure)).not.toContain("FAKE_PAYMENT_WEBHOOK_SECRET");
      expect(JSON.stringify(failure)).not.toContain("raw provider");
      expect(db.calls.orderCreate).toEqual([]);
      expectNoWrites(db);
    }
  });

  it("does not call the provider when online checkout fails store, product or total validation", async () => {
    for (const scenario of [
      {
        db: createFakeOrderDb({ establishments: [], products: [buildProduct()] }),
        code: "STORE_UNAVAILABLE",
      },
      {
        db: createFakeOrderDb({
          establishments: [buildEstablishment({ status: "INACTIVE" })],
          products: [buildProduct()],
        }),
        code: "STORE_UNAVAILABLE",
      },
      {
        db: createFakeOrderDb({
          establishments: [buildEstablishment({ deliveryFee: "not-money" })],
          products: [buildProduct()],
        }),
        code: "STORE_UNAVAILABLE",
      },
      {
        db: createFakeOrderDb({
          establishments: [buildEstablishment()],
          products: [],
        }),
        code: "PRODUCT_UNAVAILABLE",
      },
      {
        db: createFakeOrderDb({
          establishments: [buildEstablishment()],
          products: [buildProduct({ price: "not-money" })],
        }),
        code: "PRODUCT_UNAVAILABLE",
      },
    ] satisfies Array<{
      db: ReturnType<typeof createFakeOrderDb>;
      code: CashOrderFailureCode;
    }>) {
      const getPaymentGatewayProvider = vi.fn((): PaymentGatewayProvider => ({
        provider: "fake-dev",
        initiatePayment: vi.fn(),
      }));
      const service = createOrderServiceCore({
        db: scenario.db,
        now: () => NOW,
        generatePublicCode: () => "PED-20260427-PIX04",
        generateInternalOrderId: () => "order-online-pix",
        getPaymentGatewayProvider,
      });

      expectFailure(
        await service.createCheckoutOrder(
          "customer-a",
          checkoutPayload({ paymentMethod: "PIX" }),
        ),
        scenario.code,
      );

      expect(getPaymentGatewayProvider).not.toHaveBeenCalled();
      expectNoWrites(scenario.db);
    }
  });

  it("rolls back online writes on DB failures and retries public-code collisions with fresh provider ids", async () => {
    for (const failOn of ["orderItemCreateMany", "paymentCreate", "historyCreate"] as const) {
      const db = createFakeOrderDb({
        establishments: [buildEstablishment()],
        products: [buildProduct()],
        failOn,
      });
      const initiatePayment = vi.fn(async () =>
        pixInitiationSuccess({ providerPaymentId: `fake_dev_pix_${failOn}` }),
      );
      const service = createOrderServiceCore({
        db,
        now: () => NOW,
        generatePublicCode: () => "PED-20260427-ROLLBK",
        generateInternalOrderId: () => "order-online-pix",
        getPaymentGatewayProvider: () => ({
          provider: "fake-dev",
          initiatePayment,
        }),
      });

      const failure = expectFailure(
        await service.createCheckoutOrder(
          "customer-a",
          checkoutPayload({ paymentMethod: "PIX" }),
        ),
        "TRANSACTION_FAILED",
      );

      expect(failure.retryable).toBe(true);
      expect(initiatePayment).toHaveBeenCalledTimes(1);
      expectNoWrites(db);
    }

    const collisionDb = createFakeOrderDb({
      establishments: [buildEstablishment()],
      products: [buildProduct()],
      publicCodeCollisionsBeforeSuccess: 1,
    });
    const generatePublicCode = vi
      .fn()
      .mockReturnValueOnce("PED-20260427-COLL01")
      .mockReturnValueOnce("PED-20260427-COLL02");
    const generateInternalOrderId = vi
      .fn()
      .mockReturnValueOnce("order-online-collision-1")
      .mockReturnValueOnce("order-online-collision-2");
    const initiatePayment = vi.fn(async (input: PaymentInitiationInput) =>
      pixInitiationSuccess({
        providerPaymentId: `fake_dev_pix_${input.publicOrderCode.toLowerCase()}`,
      }),
    );
    const collisionService = createOrderServiceCore({
      db: collisionDb,
      now: () => NOW,
      maxPublicCodeAttempts: 2,
      generatePublicCode,
      generateInternalOrderId,
      getPaymentGatewayProvider: () => ({
        provider: "fake-dev",
        initiatePayment,
      }),
    });

    const result = await collisionService.createCheckoutOrder(
      "customer-a",
      checkoutPayload({ paymentMethod: "PIX" }),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        publicCode: "PED-20260427-COLL02",
        redirectPath: "/pedido/PED-20260427-COLL02",
      },
    });
    expect(generatePublicCode).toHaveBeenCalledTimes(2);
    expect(generateInternalOrderId).toHaveBeenCalledTimes(2);
    expect(initiatePayment).toHaveBeenCalledTimes(2);
    expect(collisionDb.data.orders).toEqual([
      expect.objectContaining({
        id: "order-online-collision-2",
        publicCode: "PED-20260427-COLL02",
      }),
    ]);
    expect(collisionDb.data.payments).toEqual([
      expect.objectContaining({
        orderId: "order-online-collision-2",
        providerPaymentId: "fake_dev_pix_ped-20260427-coll02",
      }),
    ]);
  });

  it("uses a narrow public payment projection for safe instruction fields", () => {
    expect(PUBLIC_ORDER_READ_SELECT.payment.select).toEqual({
      method: true,
      status: true,
      amount: true,
      checkoutUrl: true,
      pixQrCode: true,
      pixCopyPaste: true,
      pixExpiresAt: true,
      paidAt: true,
      failedAt: true,
      createdAt: true,
      updatedAt: true,
    });

    for (const forbiddenField of [
      "provider",
      "providerPaymentId",
      "providerStatus",
      "providerPayload",
      "cardBrand",
      "cardLast4",
    ]) {
      expect(PUBLIC_ORDER_READ_SELECT.payment.select).not.toHaveProperty(
        forbiddenField,
      );
    }
  });

  it("projects public order reads without customer, internal or provider fields", async () => {
    const db = createFakeOrderDb({
      establishments: [buildEstablishment()],
      products: [buildProduct()],
      publicOrders: [buildPublicOrderReadRow()],
    });
    const service = createOrderServiceCore({ db });

    const order = await service.getPublicOrderByCode(" PED-20260427-SAFE01 ");

    expect(order).toEqual({
      publicCode: "PED-20260427-SAFE01",
      status: "PENDING",
      paymentMethod: "CASH",
      paymentStatus: "MANUAL_CASH_ON_DELIVERY",
      subtotal: "19.90",
      deliveryFee: "5.50",
      discount: "0.00",
      total: "25.40",
      placedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      establishment: {
        name: "Smoke Lanches",
        slug: "smoke-lanches",
        logoUrl: null,
      },
      items: [
        {
          productName: "Batata frita",
          unitPrice: "19.90",
          quantity: 1,
          total: "19.90",
          notes: null,
          createdAt: NOW,
        },
      ],
      payment: {
        method: "CASH",
        status: "MANUAL_CASH_ON_DELIVERY",
        amount: "25.40",
        instructions: null,
        paidAt: null,
        failedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
      statusHistory: [
        {
          status: "PENDING",
          note: "Pedido criado pelo checkout.",
          createdAt: NOW,
        },
      ],
    });
    expect(db.calls.orderFindUnique[0]).toMatchObject({
      where: { publicCode: "PED-20260427-SAFE01" },
    });

    const serialized = JSON.stringify(order);
    for (const forbiddenFragment of [
      "order-internal",
      "customer-a",
      "Maria Cliente",
      "11999999999",
      "Rua das Flores",
      "product-a",
      "payment-internal",
      "provider-secret",
      "provider-payment-id",
      "provider-status",
      "card-brand",
      "card-last4",
      "4111111111111111",
      "card-token",
      "12/30",
      "changed-by-user",
    ]) {
      expect(serialized).not.toContain(forbiddenFragment);
    }
  });

  it("projects safe PIX instructions without provider or card internals", async () => {
    const expiresAt = new Date("2026-04-27T13:00:00.000Z");
    const db = createFakeOrderDb({
      establishments: [buildEstablishment()],
      products: [buildProduct()],
      publicOrders: [
        buildPublicOrderReadRow({
          paymentMethod: "PIX",
          paymentStatus: "PENDING",
          payment: buildPublicOrderPaymentReadRow({
            method: "PIX",
            status: "PENDING",
            checkoutUrl: null,
            pixQrCode: "pix-qr-code-safe",
            pixCopyPaste: "pix-copy-paste-safe",
            pixExpiresAt: expiresAt,
          }),
        }),
      ],
    });
    const service = createOrderServiceCore({ db });

    const order = await service.getPublicOrderByCode("PED-20260427-SAFE01");

    expect(order?.payment?.instructions).toEqual({
      method: "PIX",
      qrCode: "pix-qr-code-safe",
      copyPaste: "pix-copy-paste-safe",
      expiresAt,
    });
    expect(Object.keys(order?.payment?.instructions ?? {})).toEqual([
      "method",
      "qrCode",
      "copyPaste",
      "expiresAt",
    ]);

    const serialized = JSON.stringify(order);
    for (const forbiddenFragment of [
      "provider-secret",
      "provider-payment-id",
      "provider-status",
      "card-brand",
      "card-last4",
      "4111111111111111",
      "card-token",
      "12/30",
    ]) {
      expect(serialized).not.toContain(forbiddenFragment);
    }
  });

  it("projects safe CARD hosted checkout instructions without card details", async () => {
    const checkoutUrl = "https://payments.example.test/checkout/card-safe-001";
    const db = createFakeOrderDb({
      establishments: [buildEstablishment()],
      products: [buildProduct()],
      publicOrders: [
        buildPublicOrderReadRow({
          paymentMethod: "CARD",
          paymentStatus: "PENDING",
          payment: buildPublicOrderPaymentReadRow({
            method: "CARD",
            status: "PENDING",
            checkoutUrl,
            pixQrCode: null,
            pixCopyPaste: null,
            pixExpiresAt: null,
          }),
        }),
      ],
    });
    const service = createOrderServiceCore({ db });

    const order = await service.getPublicOrderByCode("PED-20260427-SAFE01");

    expect(order?.payment?.instructions).toEqual({
      method: "CARD",
      checkoutUrl,
    });
    expect(Object.keys(order?.payment?.instructions ?? {})).toEqual([
      "method",
      "checkoutUrl",
    ]);

    const serialized = JSON.stringify(order);
    for (const forbiddenFragment of [
      "card-brand",
      "card-last4",
      "4111111111111111",
      "cvv",
      "card-token",
      "provider-secret",
      "provider-payment-id",
      "provider-status",
    ]) {
      expect(serialized).not.toContain(forbiddenFragment);
    }
  });

  it("falls back to null public instructions for incomplete or malformed PIX fields", async () => {
    const validExpiresAt = new Date("2026-04-27T13:00:00.000Z");
    const scenarios = [
      { paymentOverrides: { pixQrCode: null } },
      { paymentOverrides: { pixCopyPaste: "" } },
      { paymentOverrides: { pixExpiresAt: null } },
      { paymentOverrides: { pixExpiresAt: new Date("invalid-date") } },
    ];

    for (const scenario of scenarios) {
      const db = createFakeOrderDb({
        establishments: [buildEstablishment()],
        products: [buildProduct()],
        publicOrders: [
          buildPublicOrderReadRow({
            paymentMethod: "PIX",
            paymentStatus: "PENDING",
            payment: buildPublicOrderPaymentReadRow({
              method: "PIX",
              status: "PENDING",
              checkoutUrl: null,
              pixQrCode: "pix-qr-code-safe",
              pixCopyPaste: "pix-copy-paste-safe",
              pixExpiresAt: validExpiresAt,
              ...scenario.paymentOverrides,
            }),
          }),
        ],
      });
      const service = createOrderServiceCore({ db });

      const order = await service.getPublicOrderByCode("PED-20260427-SAFE01");

      expect(order?.payment?.instructions).toBeNull();
    }
  });

  it("falls back to null public instructions for unsafe CARD checkout URLs", async () => {
    for (const checkoutUrl of [
      null,
      "",
      "/checkout/card-safe-001",
      "ftp://payments.example.test/checkout/card-safe-001",
      "javascript:alert(1)",
      "https://user:pass@payments.example.test/checkout/card-safe-001",
    ]) {
      const db = createFakeOrderDb({
        establishments: [buildEstablishment()],
        products: [buildProduct()],
        publicOrders: [
          buildPublicOrderReadRow({
            paymentMethod: "CARD",
            paymentStatus: "PENDING",
            payment: buildPublicOrderPaymentReadRow({
              method: "CARD",
              status: "PENDING",
              checkoutUrl,
              pixQrCode: null,
              pixCopyPaste: null,
              pixExpiresAt: null,
            }),
          }),
        ],
      });
      const service = createOrderServiceCore({ db });

      const order = await service.getPublicOrderByCode("PED-20260427-SAFE01");

      expect(order?.payment?.instructions).toBeNull();
    }
  });

  it("returns null for invalid public-code reads before calling the database", async () => {
    for (const invalidCode of [
      undefined,
      null,
      42,
      {},
      "",
      "   ",
      "not-a-code",
      "PED-",
      "PED-!!",
    ]) {
      const db = createFakeOrderDb({
        establishments: [buildEstablishment()],
        products: [buildProduct()],
        publicOrders: [buildPublicOrderReadRow()],
      });
      const service = createOrderServiceCore({ db });

      await expect(service.getPublicOrderByCode(invalidCode)).resolves.toBeNull();

      expect(db.calls.orderFindUnique).toEqual([]);
      expect(db.calls.transactionCount).toBe(0);
      expectNoWrites(db);
    }
  });

  it("normalizes lowercase and padded valid public codes before reading", async () => {
    const db = createFakeOrderDb({
      establishments: [buildEstablishment()],
      products: [buildProduct()],
      publicOrders: [buildPublicOrderReadRow()],
    });
    const service = createOrderServiceCore({ db });

    const order = await service.getPublicOrderByCode(" ped-20260427-safe01 ");

    expect(order?.publicCode).toBe("PED-20260427-SAFE01");
    expect(db.calls.orderFindUnique).toEqual([
      expect.objectContaining({
        where: { publicCode: "PED-20260427-SAFE01" },
      }),
    ]);
  });

  it("returns null for a valid but missing public code without leaking internals", async () => {
    const db = createFakeOrderDb({
      establishments: [buildEstablishment()],
      products: [buildProduct()],
      publicOrders: [],
    });
    const service = createOrderServiceCore({ db });

    const result = await service.getPublicOrderByCode("PED-20260427-MISSING");

    expect(result).toBeNull();
    expect(db.calls.orderFindUnique).toEqual([
      expect.objectContaining({
        where: { publicCode: "PED-20260427-MISSING" },
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(result)).not.toContain("order-internal");
    expectNoWrites(db);
  });

  it("lists only orders for the merchant-owned establishment with a narrow projection", async () => {
    const db = createFakeOrderDb({
      establishments: [
        buildEstablishment({ id: "est-a", ownerId: "merchant-a" }),
        buildEstablishment({ id: "est-b", ownerId: "merchant-b" }),
      ],
      merchantOrders: [
        buildMerchantOrderListRow({
          publicCode: "PED-20260427-OWN01",
          establishmentId: "est-a",
          customerName: "Ana Cliente",
        }),
        buildMerchantOrderListRow({
          publicCode: "PED-20260427-OTHER",
          establishmentId: "est-b",
          customerName: "Cliente de outra loja",
        }),
      ],
    });
    const service = createOrderServiceCore({ db });

    const result = await service.listMerchantOrdersForOwner(" merchant-a ");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.data).toMatchObject({
      count: 1,
      limit: MERCHANT_ORDER_LIST_LIMIT,
      status: null,
    });
    expect(result.data.orders).toEqual([
      expect.objectContaining({
        id: "order-internal",
        publicCode: "PED-20260427-OWN01",
        customerName: "Ana Cliente",
        subtotal: "19.90",
        deliveryFee: "5.50",
        discount: "0.00",
        total: "25.40",
        payment: expect.objectContaining({
          amount: "25.40",
          method: "CASH",
          status: "MANUAL_CASH_ON_DELIVERY",
        }),
      }),
    ]);
    expect(db.calls.establishmentFindFirst).toEqual([
      {
        where: { ownerId: "merchant-a" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: MERCHANT_ORDER_ESTABLISHMENT_SELECT,
      },
    ]);
    expect(db.calls.orderFindMany).toEqual([
      {
        where: { establishmentId: "est-a" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MERCHANT_ORDER_LIST_LIMIT,
        select: MERCHANT_ORDER_LIST_SELECT,
      },
    ]);
    expect(JSON.stringify(result.data)).not.toContain("PED-20260427-OTHER");
    expect(JSON.stringify(result.data)).not.toContain("est-b");
  });

  it("applies valid status filters and caps requested limits", async () => {
    const db = createFakeOrderDb({
      establishments: [buildEstablishment({ ownerId: "merchant-a" })],
      merchantOrders: [
        buildMerchantOrderListRow({ publicCode: "PED-20260427-PEND1" }),
        buildMerchantOrderListRow({
          publicCode: "PED-20260427-DONE1",
          status: "DELIVERED",
          paymentStatus: "PAID",
        }),
      ],
    });
    const service = createOrderServiceCore({ db });

    const result = await service.listMerchantOrdersForOwner("merchant-a", {
      status: "DELIVERED",
      limit: 999,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.data.status).toBe("DELIVERED");
    expect(result.data.orders.map((order) => order.publicCode)).toEqual([
      "PED-20260427-DONE1",
    ]);
    expect(db.calls.orderFindMany[0]).toMatchObject({
      where: { establishmentId: "est-a", status: "DELIVERED" },
      take: MERCHANT_ORDER_LIST_LIMIT,
    });

    await service.listMerchantOrdersForOwner("merchant-a", { limit: "2.5" });

    expect(db.calls.orderFindMany[1]).toMatchObject({
      take: MERCHANT_ORDER_LIST_LIMIT,
    });
  });

  it("returns safe failures for invalid owners, missing establishments and invalid statuses", async () => {
    for (const ownerId of [undefined, null, 42, "", "   "]) {
      const db = createFakeOrderDb({
        establishments: [buildEstablishment({ ownerId: "merchant-a" })],
      });
      const service = createOrderServiceCore({ db });

      expectMerchantListFailure(
        await service.listMerchantOrdersForOwner(ownerId),
        "INVALID_OWNER",
      );
      expect(db.calls.establishmentFindFirst).toEqual([]);
      expect(db.calls.orderFindMany).toEqual([]);
    }

    const missingDb = createFakeOrderDb({ establishments: [] });
    const missingService = createOrderServiceCore({ db: missingDb });

    expectMerchantListFailure(
      await missingService.listMerchantOrdersForOwner("merchant-a"),
      "ESTABLISHMENT_NOT_FOUND",
    );
    expect(missingDb.calls.orderFindMany).toEqual([]);

    for (const status of [["PENDING"], "UNKNOWN", "pending", 123, null]) {
      const db = createFakeOrderDb({
        establishments: [buildEstablishment({ ownerId: "merchant-a" })],
      });
      const service = createOrderServiceCore({ db });

      expectMerchantListFailure(
        await service.listMerchantOrdersForOwner("merchant-a", { status }),
        "INVALID_STATUS",
      );
      expect(db.calls.establishmentFindFirst).toEqual([]);
      expect(db.calls.orderFindMany).toEqual([]);
    }
  });

  it("returns an empty success for own stores with no matching orders", async () => {
    const db = createFakeOrderDb({
      establishments: [
        buildEstablishment({ id: "est-a", ownerId: "merchant-a" }),
        buildEstablishment({ id: "est-b", ownerId: "merchant-b" }),
      ],
      merchantOrders: [
        buildMerchantOrderListRow({
          publicCode: "PED-20260427-OTHER",
          establishmentId: "est-b",
        }),
      ],
    });
    const service = createOrderServiceCore({ db });

    const result = await service.listMerchantOrdersForOwner("merchant-a");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.data.orders).toEqual([]);
    expect(result.data.count).toBe(0);
  });

  it("maps owner lookup, list query and malformed projection failures to safe errors", async () => {
    for (const failOn of ["establishmentFindFirst", "orderFindMany"] as const) {
      const db = createFakeOrderDb({
        establishments: [buildEstablishment({ ownerId: "merchant-a" })],
        merchantOrders: [buildMerchantOrderListRow()],
        failOn,
      });
      const service = createOrderServiceCore({ db });

      const failure = expectMerchantListFailure(
        await service.listMerchantOrdersForOwner("merchant-a"),
        "DATABASE_ERROR",
      );

      expect(failure.retryable).toBe(true);
    }

    const malformedDb = createFakeOrderDb({
      establishments: [buildEstablishment({ ownerId: "merchant-a" })],
      merchantOrders: [buildMerchantOrderListRow({ total: "not-money" })],
    });
    const malformedService = createOrderServiceCore({ db: malformedDb });

    expectMerchantListFailure(
      await malformedService.listMerchantOrdersForOwner("merchant-a"),
      "DATABASE_ERROR",
    );
  });

  it("keeps merchant list DTOs free of detail and payment-provider internals", async () => {
    const db = createFakeOrderDb({
      establishments: [buildEstablishment({ ownerId: "merchant-a" })],
      merchantOrders: [
        buildMerchantOrderListRow({
          payment: null,
          paymentMethod: "CASH",
          paymentStatus: "MANUAL_CASH_ON_DELIVERY",
        }),
      ],
    });
    const service = createOrderServiceCore({ db });

    const result = await service.listMerchantOrdersForOwner("merchant-a");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.data.orders[0]).toMatchObject({
      id: "order-internal",
      payment: null,
      paymentMethod: "CASH",
      paymentStatus: "MANUAL_CASH_ON_DELIVERY",
    });

    const serialized = JSON.stringify(result.data);
    for (const forbiddenFragment of [
      "est-a",
      "customer-a",
      "11999999999",
      "Rua das Flores",
      "delivery-reference",
      "product-a",
      "item-internal",
      "history-internal",
      "changed-by-user",
      "provider-secret",
      "provider-payment-id",
      "pix-copy-paste",
      "card-last4",
    ]) {
      expect(serialized).not.toContain(forbiddenFragment);
    }
  });

  it("reads merchant-owned order detail with operational PII and no internal/provider fields", async () => {
    const db = createFakeOrderDb({
      establishments: [
        buildEstablishment({ id: "est-a", ownerId: "merchant-a" }),
        buildEstablishment({ id: "est-b", ownerId: "merchant-b" }),
      ],
      merchantOrderDetails: [
        buildMerchantOrderDetailRow({ id: "order-own", establishmentId: "est-a" }),
        buildMerchantOrderDetailRow({
          id: "order-other",
          establishmentId: "est-b",
          publicCode: "PED-20260427-OTHER",
          customerName: "Cliente de outra loja",
        }),
      ],
    });
    const service = createOrderServiceCore({ db });

    const result = await service.getMerchantOrderDetailForOwner(
      " merchant-a ",
      " order-own ",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.data).toEqual({
      publicCode: "PED-20260427-SAFE01",
      status: "PENDING",
      paymentMethod: "CASH",
      paymentStatus: "MANUAL_CASH_ON_DELIVERY",
      customer: {
        name: "Maria Cliente",
        phone: "11999999999",
      },
      delivery: {
        address: "Rua das Flores, 42A - Centro",
        street: "Rua das Flores",
        number: "42A",
        complement: null,
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
        postalCode: "01001-000",
        reference: "Portão azul",
      },
      observation: {
        customer: "Sem cebola, por favor.",
        internal: "Confirmar troco na entrega.",
      },
      items: [
        {
          productName: "Batata frita",
          unitPrice: "19.90",
          quantity: 1,
          total: "19.90",
          notes: "Bem crocante",
          createdAt: NOW,
        },
      ],
      payment: {
        method: "CASH",
        status: "MANUAL_CASH_ON_DELIVERY",
        amount: "25.40",
        paidAt: null,
        failedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
      statusHistory: [
        {
          status: "PENDING",
          note: "Pedido criado pelo checkout.",
          createdAt: NOW,
        },
      ],
      totals: {
        subtotal: "19.90",
        deliveryFee: "5.50",
        discount: "0.00",
        total: "25.40",
      },
      timestamps: {
        placedAt: NOW,
        acceptedAt: null,
        deliveredAt: null,
        canceledAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
    expect(db.calls.establishmentFindFirst).toEqual([
      {
        where: { ownerId: "merchant-a" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: MERCHANT_ORDER_ESTABLISHMENT_SELECT,
      },
    ]);
    expect(db.calls.orderFindFirst).toEqual([
      {
        where: { id: "order-own", establishmentId: "est-a" },
        select: MERCHANT_ORDER_DETAIL_SELECT,
      },
    ]);
    expect(db.calls.orderFindUnique).toEqual([]);

    const serialized = JSON.stringify(result.data);
    for (const forbiddenFragment of [
      "order-own",
      "order-other",
      "est-a",
      "est-b",
      "customer-a",
      "product-a",
      "item-internal",
      "history-internal",
      "changed-by-user",
      "payment-internal",
      "provider-secret",
      "provider-payment-id",
      "pix-copy-paste",
      "pix-qr-code",
      "card-brand",
      "card-last4",
    ]) {
      expect(serialized).not.toContain(forbiddenFragment);
    }
  });

  it("returns the same safe not-found failure for wrong-owner and missing order details", async () => {
    for (const scenario of [
      {
        orderId: "order-other",
        merchantOrderDetails: [
          buildMerchantOrderDetailRow({
            id: "order-other",
            establishmentId: "est-b",
            publicCode: "PED-20260427-OTHER",
            customerName: "Cliente de outra loja",
          }),
        ],
      },
      {
        orderId: "order-missing",
        merchantOrderDetails: [],
      },
    ]) {
      const db = createFakeOrderDb({
        establishments: [
          buildEstablishment({ id: "est-a", ownerId: "merchant-a" }),
          buildEstablishment({ id: "est-b", ownerId: "merchant-b" }),
        ],
        merchantOrderDetails: scenario.merchantOrderDetails,
      });
      const service = createOrderServiceCore({ db });

      const failure = expectMerchantDetailFailure(
        await service.getMerchantOrderDetailForOwner("merchant-a", scenario.orderId),
        "ORDER_NOT_FOUND",
      );

      expect(failure.retryable).toBe(false);
      expect(db.calls.orderFindFirst).toEqual([
        {
          where: { id: scenario.orderId, establishmentId: "est-a" },
          select: MERCHANT_ORDER_DETAIL_SELECT,
        },
      ]);
      expect(JSON.stringify(failure)).not.toContain(scenario.orderId);
      expect(JSON.stringify(failure)).not.toContain("PED-20260427-OTHER");
      expect(JSON.stringify(failure)).not.toContain("Cliente de outra loja");
      expect(JSON.stringify(failure)).not.toContain("est-b");
    }
  });

  it("rejects invalid merchant detail owners and order ids before database reads", async () => {
    for (const ownerId of [undefined, null, 42, {}, [], "", "   "]) {
      const db = createFakeOrderDb({
        establishments: [buildEstablishment({ ownerId: "merchant-a" })],
        merchantOrderDetails: [buildMerchantOrderDetailRow({ id: "order-own" })],
      });
      const service = createOrderServiceCore({ db });

      expectMerchantDetailFailure(
        await service.getMerchantOrderDetailForOwner(ownerId, "order-own"),
        "INVALID_OWNER",
      );
      expect(db.calls.establishmentFindFirst).toEqual([]);
      expect(db.calls.orderFindFirst).toEqual([]);
    }

    for (const orderId of [
      undefined,
      null,
      42,
      {},
      ["order-own"],
      "",
      "   ",
      "x".repeat(129),
    ]) {
      const db = createFakeOrderDb({
        establishments: [buildEstablishment({ ownerId: "merchant-a" })],
        merchantOrderDetails: [buildMerchantOrderDetailRow({ id: "order-own" })],
      });
      const service = createOrderServiceCore({ db });

      expectMerchantDetailFailure(
        await service.getMerchantOrderDetailForOwner("merchant-a", orderId),
        "INVALID_ORDER",
      );
      expect(db.calls.establishmentFindFirst).toEqual([]);
      expect(db.calls.orderFindFirst).toEqual([]);
    }
  });

  it("returns a safe failure for missing merchant establishments without querying orders", async () => {
    const db = createFakeOrderDb({
      establishments: [],
      merchantOrderDetails: [buildMerchantOrderDetailRow({ id: "order-own" })],
    });
    const service = createOrderServiceCore({ db });

    const failure = expectMerchantDetailFailure(
      await service.getMerchantOrderDetailForOwner("merchant-a", "order-own"),
      "ESTABLISHMENT_NOT_FOUND",
    );

    expect(failure.retryable).toBe(false);
    expect(db.calls.establishmentFindFirst).toHaveLength(1);
    expect(db.calls.orderFindFirst).toEqual([]);
  });

  it("maps detail lookup and malformed projection failures to sanitized retryable errors", async () => {
    for (const failOn of ["establishmentFindFirst", "orderFindFirst"] as const) {
      const db = createFakeOrderDb({
        establishments: [buildEstablishment({ ownerId: "merchant-a" })],
        merchantOrderDetails: [buildMerchantOrderDetailRow({ id: "order-own" })],
        failOn,
      });
      const service = createOrderServiceCore({ db });

      const failure = expectMerchantDetailFailure(
        await service.getMerchantOrderDetailForOwner("merchant-a", "order-own"),
        "DATABASE_ERROR",
      );

      expect(failure.retryable).toBe(true);
    }

    const malformedDb = createFakeOrderDb({
      establishments: [buildEstablishment({ ownerId: "merchant-a" })],
      merchantOrderDetails: [
        buildMerchantOrderDetailRow({ id: "order-own", total: "not-money" }),
      ],
    });
    const malformedService = createOrderServiceCore({ db: malformedDb });

    const malformedFailure = expectMerchantDetailFailure(
      await malformedService.getMerchantOrderDetailForOwner("merchant-a", "order-own"),
      "DATABASE_ERROR",
    );

    expect(malformedFailure.retryable).toBe(true);
  });

  it("returns successful detail DTOs for null payment, empty item list and empty history", async () => {
    const db = createFakeOrderDb({
      establishments: [buildEstablishment({ ownerId: "merchant-a" })],
      merchantOrderDetails: [
        buildMerchantOrderDetailRow({
          id: "order-own",
          payment: null,
          items: [],
          statusHistory: [],
        }),
      ],
    });
    const service = createOrderServiceCore({ db });

    const result = await service.getMerchantOrderDetailForOwner(
      "merchant-a",
      "order-own",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.data.payment).toBeNull();
    expect(result.data.items).toEqual([]);
    expect(result.data.statusHistory).toEqual([]);
    expect(result.data.customer).toEqual({
      name: "Maria Cliente",
      phone: "11999999999",
    });
    expect(result.data.totals.total).toBe("25.40");
  });

  describe("merchant order status transition contract", () => {
    const expectedMatrix = {
      DRAFT: [],
      PENDING: ["ACCEPTED", "REJECTED", "CANCELED"],
      ACCEPTED: ["PREPARING", "CANCELED"],
      PREPARING: ["OUT_FOR_DELIVERY", "CANCELED"],
      READY_FOR_PICKUP: [],
      OUT_FOR_DELIVERY: ["DELIVERED", "CANCELED"],
      DELIVERED: [],
      REJECTED: [],
      CANCELED: [],
    } satisfies Record<OrderStatusValue, OrderStatusValue[]>;

    it("covers every order status and permits only the M003 matrix", () => {
      expect(Object.keys(ALLOWED_MERCHANT_ORDER_TRANSITIONS).sort()).toEqual(
        [...ORDER_STATUS_VALUES].sort(),
      );
      expect(ALLOWED_MERCHANT_ORDER_TRANSITIONS).toEqual(expectedMatrix);

      for (const currentStatus of ORDER_STATUS_VALUES) {
        const expectedTargets = expectedMatrix[currentStatus] as readonly OrderStatusValue[];

        for (const targetStatus of ORDER_STATUS_VALUES) {
          expect(
            canMerchantTransitionOrderStatus(currentStatus, targetStatus),
            `${currentStatus} -> ${targetStatus}`,
          ).toBe(expectedTargets.includes(targetStatus));
        }
      }
    });

    it("rejects representative illegal transitions and terminal statuses", () => {
      expect(canMerchantTransitionOrderStatus("PENDING", "DELIVERED")).toBe(false);
      expect(canMerchantTransitionOrderStatus("ACCEPTED", "READY_FOR_PICKUP")).toBe(
        false,
      );
      expect(canMerchantTransitionOrderStatus("PREPARING", "DELIVERED")).toBe(
        false,
      );

      for (const terminalStatus of [
        "DRAFT",
        "READY_FOR_PICKUP",
        "DELIVERED",
        "REJECTED",
        "CANCELED",
      ] satisfies OrderStatusValue[]) {
        for (const targetStatus of ORDER_STATUS_VALUES) {
          expect(
            canMerchantTransitionOrderStatus(terminalStatus, targetStatus),
            `${terminalStatus} -> ${targetStatus}`,
          ).toBe(false);
        }
      }
    });

    it("normalizes strict transition input and optional notes", () => {
      expectTransitionSuccess(
        parseMerchantOrderTransitionInput({
          orderId: " order-a ",
          expectedStatus: " PENDING ",
          targetStatus: " ACCEPTED ",
          note: "  Em preparo agora.  ",
        }),
      ).toEqual({
        orderId: "order-a",
        expectedStatus: "PENDING",
        targetStatus: "ACCEPTED",
        note: "Em preparo agora.",
      });

      expectTransitionSuccess(
        parseMerchantOrderTransitionInput({
          orderId: "order-a",
          expectedStatus: "PENDING",
          targetStatus: "REJECTED",
          note: "   ",
        }),
      ).toMatchObject({ note: null });

      expectTransitionSuccess(
        parseMerchantOrderTransitionInput({
          orderId: "order-a",
          expectedStatus: "PENDING",
          targetStatus: "CANCELED",
        }),
      ).toMatchObject({ note: null });
    });

    it("rejects forged authority fields without echoing raw values", () => {
      const validInput = {
        orderId: "order-a",
        expectedStatus: "PENDING",
        targetStatus: "ACCEPTED",
        note: "Pode aceitar.",
      };

      for (const forgedField of [
        "ownerId",
        "establishmentId",
        "changedById",
        "status",
        "acceptedAt",
        "deliveredAt",
        "canceledAt",
        "createdAt",
        "updatedAt",
        "publicCode",
      ]) {
        const failure = expectMerchantTransitionFailure(
          parseMerchantOrderTransitionInput({
            ...validInput,
            [forgedField]: `forged-${forgedField}`,
          }),
          "INVALID_STATUS",
        );

        expect(JSON.stringify(failure)).not.toContain(`forged-${forgedField}`);
      }
    });

    it("returns typed failures for malformed order ids and statuses before DB calls", () => {
      for (const orderId of [
        undefined,
        null,
        42,
        {},
        [],
        "",
        "   ",
        "x".repeat(129),
      ]) {
        const db = createFakeOrderDb({ establishments: [buildEstablishment()] });

        expectMerchantTransitionFailure(
          parseMerchantOrderTransitionInput({
            orderId,
            expectedStatus: "PENDING",
            targetStatus: "ACCEPTED",
          }),
          "INVALID_ORDER",
        );
        expectNoDbReads(db);
        expectNoWrites(db);
      }

      for (const statusValue of [
        undefined,
        null,
        42,
        {},
        [],
        "",
        "   ",
        "pending",
        "UNKNOWN",
        "PLACED",
      ]) {
        const db = createFakeOrderDb({ establishments: [buildEstablishment()] });

        expectMerchantTransitionFailure(
          parseMerchantOrderTransitionInput({
            orderId: "order-a",
            expectedStatus: statusValue,
            targetStatus: "ACCEPTED",
          }),
          "INVALID_STATUS",
        );
        expectMerchantTransitionFailure(
          parseMerchantOrderTransitionInput({
            orderId: "order-a",
            expectedStatus: "PENDING",
            targetStatus: statusValue,
          }),
          "INVALID_STATUS",
        );
        expectNoDbReads(db);
        expectNoWrites(db);
      }
    });

    it("parses merchant transition owner ids before DB calls", () => {
      expectTransitionSuccess(parseMerchantOrderTransitionOwnerId(" merchant-a ")).toBe(
        "merchant-a",
      );

      for (const ownerId of [
        undefined,
        null,
        42,
        {},
        [],
        "",
        "   ",
        "x".repeat(129),
      ]) {
        const db = createFakeOrderDb({ establishments: [buildEstablishment()] });

        expectMerchantTransitionFailure(
          parseMerchantOrderTransitionOwnerId(ownerId),
          "INVALID_OWNER",
        );
        expectNoDbReads(db);
        expectNoWrites(db);
      }
    });

    it("bounds transition notes and never echoes oversized values", () => {
      const maxNote = "a".repeat(MERCHANT_ORDER_TRANSITION_NOTE_MAX_LENGTH);
      const oversizedNote = `${maxNote}b`;

      expectTransitionSuccess(
        parseMerchantOrderTransitionInput({
          orderId: "order-a",
          expectedStatus: "PENDING",
          targetStatus: "CANCELED",
          note: maxNote,
        }),
      ).toMatchObject({ note: maxNote });

      const failure = expectMerchantTransitionFailure(
        parseMerchantOrderTransitionInput({
          orderId: "order-a",
          expectedStatus: "PENDING",
          targetStatus: "CANCELED",
          note: oversizedNote,
        }),
        "INVALID_NOTE",
      );

      expect(JSON.stringify(failure)).not.toContain(oversizedNote);

      for (const note of [null, 42, {}, []]) {
        expectMerchantTransitionFailure(
          parseMerchantOrderTransitionInput({
            orderId: "order-a",
            expectedStatus: "PENDING",
            targetStatus: "CANCELED",
            note,
          }),
          "INVALID_NOTE",
        );
      }
    });

    it("builds timestamp updates only for transitionable target statuses", () => {
      expectTransitionSuccess(
        buildMerchantOrderTransitionTimestampData("ACCEPTED", NOW),
      ).toEqual({ acceptedAt: NOW });
      expectTransitionSuccess(
        buildMerchantOrderTransitionTimestampData("PREPARING", NOW),
      ).toEqual({});
      expectTransitionSuccess(
        buildMerchantOrderTransitionTimestampData("OUT_FOR_DELIVERY", NOW),
      ).toEqual({});
      expectTransitionSuccess(
        buildMerchantOrderTransitionTimestampData("DELIVERED", NOW),
      ).toEqual({ deliveredAt: NOW });
      expectTransitionSuccess(
        buildMerchantOrderTransitionTimestampData("CANCELED", NOW),
      ).toEqual({ canceledAt: NOW });
      expectTransitionSuccess(
        buildMerchantOrderTransitionTimestampData("REJECTED", NOW),
      ).toEqual({ canceledAt: NOW });

      for (const nonTargetStatus of [
        "DRAFT",
        "PENDING",
        "READY_FOR_PICKUP",
      ] satisfies OrderStatusValue[]) {
        expectMerchantTransitionFailure(
          buildMerchantOrderTransitionTimestampData(nonTargetStatus, NOW),
          "INVALID_TRANSITION",
        );
      }
    });
  });

  describe("merchant order status transition persistence", () => {
    const BEFORE_TRANSITION = new Date("2026-04-27T11:00:00.000Z");
    const PREVIOUS_ACCEPTED_AT = new Date("2026-04-27T11:15:00.000Z");

    it("persists every allowed transition with timestamps and one history row", async () => {
      const scenarios = [
        {
          from: "PENDING",
          to: "ACCEPTED",
          existing: {},
          expected: { acceptedAt: NOW, deliveredAt: null, canceledAt: null },
        },
        {
          from: "PENDING",
          to: "REJECTED",
          existing: {},
          expected: { acceptedAt: null, deliveredAt: null, canceledAt: NOW },
        },
        {
          from: "PENDING",
          to: "CANCELED",
          existing: {},
          expected: { acceptedAt: null, deliveredAt: null, canceledAt: NOW },
        },
        {
          from: "ACCEPTED",
          to: "PREPARING",
          existing: { acceptedAt: PREVIOUS_ACCEPTED_AT },
          expected: {
            acceptedAt: PREVIOUS_ACCEPTED_AT,
            deliveredAt: null,
            canceledAt: null,
          },
        },
        {
          from: "ACCEPTED",
          to: "CANCELED",
          existing: { acceptedAt: PREVIOUS_ACCEPTED_AT },
          expected: {
            acceptedAt: PREVIOUS_ACCEPTED_AT,
            deliveredAt: null,
            canceledAt: NOW,
          },
        },
        {
          from: "PREPARING",
          to: "OUT_FOR_DELIVERY",
          existing: { acceptedAt: PREVIOUS_ACCEPTED_AT },
          expected: {
            acceptedAt: PREVIOUS_ACCEPTED_AT,
            deliveredAt: null,
            canceledAt: null,
          },
        },
        {
          from: "PREPARING",
          to: "CANCELED",
          existing: { acceptedAt: PREVIOUS_ACCEPTED_AT },
          expected: {
            acceptedAt: PREVIOUS_ACCEPTED_AT,
            deliveredAt: null,
            canceledAt: NOW,
          },
        },
        {
          from: "OUT_FOR_DELIVERY",
          to: "DELIVERED",
          existing: { acceptedAt: PREVIOUS_ACCEPTED_AT },
          expected: {
            acceptedAt: PREVIOUS_ACCEPTED_AT,
            deliveredAt: NOW,
            canceledAt: null,
          },
        },
        {
          from: "OUT_FOR_DELIVERY",
          to: "CANCELED",
          existing: { acceptedAt: PREVIOUS_ACCEPTED_AT },
          expected: {
            acceptedAt: PREVIOUS_ACCEPTED_AT,
            deliveredAt: null,
            canceledAt: NOW,
          },
        },
      ] satisfies Array<{
        from: OrderStatusValue;
        to: OrderStatusValue;
        existing: Partial<FakeMerchantOrderDetail>;
        expected: {
          acceptedAt: Date | null;
          deliveredAt: Date | null;
          canceledAt: Date | null;
        };
      }>;

      for (const scenario of scenarios) {
        const orderId = `order-${scenario.from.toLowerCase()}-${scenario.to.toLowerCase()}`;
        const db = createFakeOrderDb({
          establishments: [buildEstablishment({ id: "est-a", ownerId: "merchant-a" })],
          merchantOrderDetails: [
            buildMerchantOrderDetailRow({
              id: orderId,
              establishmentId: "est-a",
              status: scenario.from,
              updatedAt: BEFORE_TRANSITION,
              ...scenario.existing,
            }),
          ],
        });
        const service = createOrderServiceCore({ db, now: () => NOW });

        const result = await service.transitionMerchantOrderStatusForOwner(
          " merchant-a ",
          {
            orderId: ` ${orderId} `,
            expectedStatus: scenario.from,
            targetStatus: scenario.to,
            note: "  Loja confirmou.  ",
          },
        );

        const data = expectMerchantTransitionSuccess(result);
        expect(data).toEqual({
          publicCode: "PED-20260427-SAFE01",
          previousStatus: scenario.from,
          status: scenario.to,
          placedAt: NOW,
          acceptedAt: scenario.expected.acceptedAt,
          deliveredAt: scenario.expected.deliveredAt,
          canceledAt: scenario.expected.canceledAt,
          updatedAt: NOW,
          note: "Loja confirmou.",
          changedAt: NOW,
        });
        expect(db.calls.transactionCount).toBe(1);
        expect(db.calls.establishmentFindFirst).toEqual([
          {
            where: { ownerId: "merchant-a" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: MERCHANT_ORDER_TRANSITION_ESTABLISHMENT_SELECT,
          },
        ]);
        expect(db.calls.orderFindFirst).toEqual([
          {
            where: { id: orderId, establishmentId: "est-a" },
            select: MERCHANT_ORDER_TRANSITION_SELECT,
          },
        ]);
        expect(db.calls.orderUpdateMany[0]).toMatchObject({
          where: {
            id: orderId,
            establishmentId: "est-a",
            status: scenario.from,
          },
          data: expect.objectContaining({
            status: scenario.to,
            updatedAt: NOW,
          }),
        });
        expect(db.data.merchantOrderDetails[0]).toMatchObject({
          id: orderId,
          status: scenario.to,
          updatedAt: NOW,
          acceptedAt: scenario.expected.acceptedAt,
          deliveredAt: scenario.expected.deliveredAt,
          canceledAt: scenario.expected.canceledAt,
        });
        expect(db.data.orderStatusHistory).toEqual([
          {
            orderId,
            status: scenario.to,
            changedById: "merchant-a",
            note: "Loja confirmou.",
            createdAt: NOW,
          },
        ]);
      }
    });

    it("rejects invalid, terminal and READY_FOR_PICKUP transitions without writes", async () => {
      for (const scenario of [
        { current: "PENDING", target: "DELIVERED" },
        { current: "READY_FOR_PICKUP", target: "OUT_FOR_DELIVERY" },
        { current: "DELIVERED", target: "CANCELED" },
        { current: "REJECTED", target: "ACCEPTED" },
        { current: "CANCELED", target: "ACCEPTED" },
      ] satisfies Array<{ current: OrderStatusValue; target: OrderStatusValue }>) {
        const db = createFakeOrderDb({
          establishments: [buildEstablishment({ ownerId: "merchant-a" })],
          merchantOrderDetails: [
            buildMerchantOrderDetailRow({ id: "order-own", status: scenario.current }),
          ],
        });
        const service = createOrderServiceCore({ db, now: () => NOW });

        expectMerchantTransitionFailure(
          await service.transitionMerchantOrderStatusForOwner("merchant-a", {
            orderId: "order-own",
            expectedStatus: scenario.current,
            targetStatus: scenario.target,
          }),
          "INVALID_TRANSITION",
        );

        expect(db.calls.orderUpdateMany).toEqual([]);
        expect(db.calls.historyCreate).toEqual([]);
        expect(db.data.merchantOrderDetails[0].status).toBe(scenario.current);
        expect(db.data.orderStatusHistory).toEqual([]);
      }
    });

    it("maps stale expected statuses and compare-and-set misses to STALE_STATUS without history", async () => {
      const staleDb = createFakeOrderDb({
        establishments: [buildEstablishment({ ownerId: "merchant-a" })],
        merchantOrderDetails: [
          buildMerchantOrderDetailRow({ id: "order-own", status: "PENDING" }),
        ],
      });
      const staleService = createOrderServiceCore({ db: staleDb, now: () => NOW });

      expectMerchantTransitionFailure(
        await staleService.transitionMerchantOrderStatusForOwner("merchant-a", {
          orderId: "order-own",
          expectedStatus: "ACCEPTED",
          targetStatus: "PREPARING",
        }),
        "STALE_STATUS",
      );
      expect(staleDb.calls.orderUpdateMany).toEqual([]);
      expect(staleDb.calls.historyCreate).toEqual([]);
      expect(staleDb.data.merchantOrderDetails[0].status).toBe("PENDING");
      expect(staleDb.data.orderStatusHistory).toEqual([]);

      const raceDb = createFakeOrderDb({
        establishments: [buildEstablishment({ ownerId: "merchant-a" })],
        merchantOrderDetails: [
          buildMerchantOrderDetailRow({ id: "order-own", status: "PENDING" }),
        ],
        failOn: "orderUpdateManyZero",
      });
      const raceService = createOrderServiceCore({ db: raceDb, now: () => NOW });

      expectMerchantTransitionFailure(
        await raceService.transitionMerchantOrderStatusForOwner("merchant-a", {
          orderId: "order-own",
          expectedStatus: "PENDING",
          targetStatus: "ACCEPTED",
        }),
        "STALE_STATUS",
      );
      expect(raceDb.calls.orderUpdateMany).toHaveLength(1);
      expect(raceDb.calls.historyCreate).toEqual([]);
      expect(raceDb.data.merchantOrderDetails[0].status).toBe("PENDING");
      expect(raceDb.data.orderStatusHistory).toEqual([]);
    });

    it("collapses wrong-owner and missing transition orders to ORDER_NOT_FOUND", async () => {
      for (const scenario of [
        {
          orderId: "order-other",
          merchantOrderDetails: [
            buildMerchantOrderDetailRow({
              id: "order-other",
              establishmentId: "est-b",
              publicCode: "PED-20260427-OTHER",
              customerName: "Cliente de outra loja",
            }),
          ],
        },
        {
          orderId: "order-missing",
          merchantOrderDetails: [],
        },
      ]) {
        const db = createFakeOrderDb({
          establishments: [
            buildEstablishment({ id: "est-a", ownerId: "merchant-a" }),
            buildEstablishment({ id: "est-b", ownerId: "merchant-b" }),
          ],
          merchantOrderDetails: scenario.merchantOrderDetails,
        });
        const service = createOrderServiceCore({ db, now: () => NOW });

        const failure = expectMerchantTransitionFailure(
          await service.transitionMerchantOrderStatusForOwner("merchant-a", {
            orderId: scenario.orderId,
            expectedStatus: "PENDING",
            targetStatus: "ACCEPTED",
          }),
          "ORDER_NOT_FOUND",
        );

        expect(failure.retryable).toBe(false);
        expect(db.calls.orderFindFirst).toEqual([
          {
            where: { id: scenario.orderId, establishmentId: "est-a" },
            select: MERCHANT_ORDER_TRANSITION_SELECT,
          },
        ]);
        expect(db.calls.orderUpdateMany).toEqual([]);
        expect(db.calls.historyCreate).toEqual([]);
        expect(JSON.stringify(failure)).not.toContain(scenario.orderId);
        expect(JSON.stringify(failure)).not.toContain("PED-20260427-OTHER");
        expect(JSON.stringify(failure)).not.toContain("Cliente de outra loja");
        expect(JSON.stringify(failure)).not.toContain("est-b");
      }
    });

    it("fails missing or inactive establishments before order mutation", async () => {
      const missingDb = createFakeOrderDb({
        establishments: [],
        merchantOrderDetails: [buildMerchantOrderDetailRow({ id: "order-own" })],
      });
      const missingService = createOrderServiceCore({ db: missingDb, now: () => NOW });

      expectMerchantTransitionFailure(
        await missingService.transitionMerchantOrderStatusForOwner("merchant-a", {
          orderId: "order-own",
          expectedStatus: "PENDING",
          targetStatus: "ACCEPTED",
        }),
        "ESTABLISHMENT_NOT_FOUND",
      );
      expect(missingDb.calls.orderFindFirst).toEqual([]);
      expect(missingDb.calls.orderUpdateMany).toEqual([]);
      expect(missingDb.calls.historyCreate).toEqual([]);

      for (const status of ["PENDING", "BLOCKED", "INACTIVE"] as const) {
        const db = createFakeOrderDb({
          establishments: [buildEstablishment({ ownerId: "merchant-a", status })],
          merchantOrderDetails: [buildMerchantOrderDetailRow({ id: "order-own" })],
        });
        const service = createOrderServiceCore({ db, now: () => NOW });

        expectMerchantTransitionFailure(
          await service.transitionMerchantOrderStatusForOwner("merchant-a", {
            orderId: "order-own",
            expectedStatus: "PENDING",
            targetStatus: "ACCEPTED",
          }),
          "INACTIVE_ESTABLISHMENT",
        );
        expect(db.calls.orderFindFirst).toEqual([]);
        expect(db.calls.orderUpdateMany).toEqual([]);
        expect(db.calls.historyCreate).toEqual([]);
      }
    });

    it("rejects invalid transition inputs before opening a transaction", async () => {
      for (const scenario of [
        {
          ownerId: "",
          input: {
            orderId: "order-own",
            expectedStatus: "PENDING",
            targetStatus: "ACCEPTED",
          },
          code: "INVALID_OWNER",
        },
        {
          ownerId: "merchant-a",
          input: {
            orderId: "   ",
            expectedStatus: "PENDING",
            targetStatus: "ACCEPTED",
          },
          code: "INVALID_ORDER",
        },
        {
          ownerId: "merchant-a",
          input: {
            orderId: "order-own",
            expectedStatus: "pending",
            targetStatus: "ACCEPTED",
          },
          code: "INVALID_STATUS",
        },
        {
          ownerId: "merchant-a",
          input: {
            orderId: "order-own",
            expectedStatus: "PENDING",
            targetStatus: "ACCEPTED",
            note: null,
          },
          code: "INVALID_NOTE",
        },
      ] satisfies Array<{
        ownerId: unknown;
        input: unknown;
        code: MerchantOrderTransitionFailureCode;
      }>) {
        const db = createFakeOrderDb({
          establishments: [buildEstablishment({ ownerId: "merchant-a" })],
          merchantOrderDetails: [buildMerchantOrderDetailRow({ id: "order-own" })],
        });
        const service = createOrderServiceCore({ db, now: () => NOW });

        expectMerchantTransitionFailure(
          await service.transitionMerchantOrderStatusForOwner(
            scenario.ownerId,
            scenario.input,
          ),
          scenario.code,
        );
        expect(db.calls.transactionCount).toBe(0);
        expectNoDbReads(db);
        expectNoWrites(db);
      }
    });

    it("sanitizes DB and malformed projection failures while rolling back writes", async () => {
      for (const failOn of [
        "establishmentFindFirst",
        "orderFindFirst",
        "orderUpdateMany",
        "historyCreate",
      ] as const) {
        const db = createFakeOrderDb({
          establishments: [buildEstablishment({ ownerId: "merchant-a" })],
          merchantOrderDetails: [
            buildMerchantOrderDetailRow({
              id: "order-own",
              status: "PENDING",
              updatedAt: BEFORE_TRANSITION,
            }),
          ],
          failOn,
        });
        const service = createOrderServiceCore({ db, now: () => NOW });

        const failure = expectMerchantTransitionFailure(
          await service.transitionMerchantOrderStatusForOwner("merchant-a", {
            orderId: "order-own",
            expectedStatus: "PENDING",
            targetStatus: "ACCEPTED",
          }),
          "DATABASE_ERROR",
        );

        expect(failure.retryable).toBe(true);
        expect(db.data.merchantOrderDetails[0]).toMatchObject({
          status: "PENDING",
          updatedAt: BEFORE_TRANSITION,
          acceptedAt: null,
        });
        expect(db.data.orderStatusHistory).toEqual([]);
      }

      const malformedDb = createFakeOrderDb({
        establishments: [buildEstablishment({ ownerId: "merchant-a" })],
        merchantOrderDetails: [
          buildMerchantOrderDetailRow({
            id: "order-own",
            status: "BROKEN" as OrderStatusValue,
          }),
        ],
      });
      const malformedService = createOrderServiceCore({
        db: malformedDb,
        now: () => NOW,
      });

      const malformedFailure = expectMerchantTransitionFailure(
        await malformedService.transitionMerchantOrderStatusForOwner("merchant-a", {
          orderId: "order-own",
          expectedStatus: "PENDING",
          targetStatus: "ACCEPTED",
        }),
        "DATABASE_ERROR",
      );

      expect(malformedFailure.retryable).toBe(true);
      expect(malformedDb.calls.orderUpdateMany).toEqual([]);
      expect(malformedDb.calls.historyCreate).toEqual([]);
      expect(malformedDb.data.orderStatusHistory).toEqual([]);
    });
  });
});

type FakeEstablishment = {
  id: string;
  ownerId: string;
  status: "PENDING" | "ACTIVE" | "BLOCKED" | "INACTIVE";
  deliveryFee: string;
  createdAt: Date;
};

type FakeProduct = {
  id: string;
  establishmentId: string;
  name: string;
  price: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
};

type FakeOrder = Record<string, unknown> & { id: string; publicCode: string };
type FakeOrderItem = Record<string, unknown>;
type FakePayment = Record<string, unknown>;
type FakeOrderStatusHistory = Record<string, unknown>;
type FakeMerchantOrder = MerchantOrderListRow & {
  id: string;
  establishmentId: string;
};
type FakeMerchantOrderDetail = MerchantOrderDetailRow & {
  id: string;
  establishmentId: string;
};

type FakeOrderDbData = {
  establishments: FakeEstablishment[];
  products: FakeProduct[];
  orders: FakeOrder[];
  orderItems: FakeOrderItem[];
  payments: FakePayment[];
  orderStatusHistory: FakeOrderStatusHistory[];
  publicOrders: PublicOrderReadRow[];
  merchantOrders: FakeMerchantOrder[];
  merchantOrderDetails: FakeMerchantOrderDetail[];
};

type FakeOrderDbCalls = {
  transactionCount: number;
  establishmentFindUnique: unknown[];
  establishmentFindFirst: unknown[];
  productFindMany: unknown[];
  orderCreate: unknown[];
  orderItemCreateMany: unknown[];
  paymentCreate: unknown[];
  historyCreate: unknown[];
  orderFindUnique: unknown[];
  orderFindMany: unknown[];
  orderFindFirst: unknown[];
  orderUpdateMany: unknown[];
};

type FakeOrderDbFailPoint =
  | "establishmentFindFirst"
  | "orderFindMany"
  | "orderFindFirst"
  | "orderUpdateMany"
  | "orderUpdateManyZero"
  | "orderItemCreateMany"
  | "paymentCreate"
  | "historyCreate"
  | "publicCodeCollision";

type FakeOrderDb = OrderServiceClient & {
  data: FakeOrderDbData;
  calls: FakeOrderDbCalls;
};

function createFakeOrderDb(options: {
  establishments?: FakeEstablishment[];
  products?: FakeProduct[];
  publicOrders?: PublicOrderReadRow[];
  merchantOrders?: FakeMerchantOrder[];
  merchantOrderDetails?: FakeMerchantOrderDetail[];
  failOn?: FakeOrderDbFailPoint;
  publicCodeCollisionsBeforeSuccess?: number;
}): FakeOrderDb {
  const data: FakeOrderDbData = {
    establishments: options.establishments ?? [],
    products: options.products ?? [],
    orders: [],
    orderItems: [],
    payments: [],
    orderStatusHistory: [],
    publicOrders: options.publicOrders ?? [],
    merchantOrders: options.merchantOrders ?? [],
    merchantOrderDetails: options.merchantOrderDetails ?? [],
  };
  const calls: FakeOrderDbCalls = {
    transactionCount: 0,
    establishmentFindUnique: [],
    establishmentFindFirst: [],
    productFindMany: [],
    orderCreate: [],
    orderItemCreateMany: [],
    paymentCreate: [],
    historyCreate: [],
    orderFindUnique: [],
    orderFindMany: [],
    orderFindFirst: [],
    orderUpdateMany: [],
  };
  let publicCodeCollisionsRemaining =
    options.publicCodeCollisionsBeforeSuccess ??
    (options.failOn === "publicCodeCollision" ? Number.POSITIVE_INFINITY : 0);

  return {
    data,
    calls,
    establishment: {
      async findFirst(args) {
        calls.establishmentFindFirst.push(args);

        if (options.failOn === "establishmentFindFirst") {
          throw new Error("raw owner lookup failure DATABASE_URL provider-secret");
        }

        return (
          data.establishments
            .filter((establishment) => establishment.ownerId === args.where.ownerId)
            .sort((left, right) => {
              const dateDiff = left.createdAt.getTime() - right.createdAt.getTime();

              return dateDiff || left.id.localeCompare(right.id);
            })[0] ?? null
        );
      },
    },
    order: {
      async findUnique(args) {
        calls.orderFindUnique.push(args);

        return (
          data.publicOrders.find(
            (order) => order.publicCode === args.where.publicCode,
          ) ?? null
        );
      },
      async findMany(args) {
        calls.orderFindMany.push(args);

        if (options.failOn === "orderFindMany") {
          throw new Error("raw order list failure DATABASE_URL provider-secret");
        }

        const orders = data.merchantOrders
          .filter(
            (order) =>
              order.establishmentId === args.where.establishmentId &&
              (!args.where.status || order.status === args.where.status),
          )
          .sort((left, right) => {
            const dateDiff = right.createdAt.getTime() - left.createdAt.getTime();

            return dateDiff || right.id.localeCompare(left.id);
          });

        return typeof args.take === "number" ? orders.slice(0, args.take) : orders;
      },
      async findFirst(args) {
        calls.orderFindFirst.push(args);

        if (options.failOn === "orderFindFirst") {
          throw new Error(
            "raw order detail failure DATABASE_URL provider-secret provider-payment-id",
          );
        }

        return (
          data.merchantOrderDetails.find(
            (order) =>
              order.id === args.where.id &&
              order.establishmentId === args.where.establishmentId,
          ) ?? null
        );
      },
    },
    async $transaction(callback) {
      calls.transactionCount += 1;
      const transactionData = cloneData(data);
      const tx = createTransactionClient(transactionData, calls, () => {
        if (publicCodeCollisionsRemaining <= 0) {
          return false;
        }

        publicCodeCollisionsRemaining -= 1;
        return true;
      }, options.failOn);

      try {
        const result = await callback(tx);
        commitData(data, transactionData);
        return result;
      } catch (error) {
        throw error;
      }
    },
  };
}

function createTransactionClient(
  data: FakeOrderDbData,
  calls: FakeOrderDbCalls,
  shouldPublicCodeCollide: () => boolean,
  failOn: FakeOrderDbFailPoint | undefined,
): OrderServiceTransactionClient {
  return {
    establishment: {
      async findUnique(args) {
        calls.establishmentFindUnique.push(args);
        return (
          data.establishments.find(
            (establishment) => establishment.id === args.where.id,
          ) ?? null
        );
      },
      async findFirst(args) {
        calls.establishmentFindFirst.push(args);

        if (failOn === "establishmentFindFirst") {
          throw new Error("raw owner lookup failure DATABASE_URL provider-secret");
        }

        return (
          data.establishments
            .filter((establishment) => establishment.ownerId === args.where.ownerId)
            .sort((left, right) => {
              const dateDiff = left.createdAt.getTime() - right.createdAt.getTime();

              return dateDiff || left.id.localeCompare(right.id);
            })[0] ?? null
        );
      },
    },
    product: {
      async findMany(args) {
        calls.productFindMany.push(args);
        const ids = args.where.id.in;
        return data.products.filter((product) => ids.includes(product.id));
      },
    },
    order: {
      async create(args) {
        calls.orderCreate.push(args);

        if (shouldPublicCodeCollide()) {
          throw {
            code: "P2002",
            meta: { target: ["public_code"] },
            message: "Unique constraint failed on raw public_code index",
          };
        }

        const order = {
          id: `order-${data.orders.length + 1}`,
          ...args.data,
        } as FakeOrder;
        data.orders.push(order);
        return { id: order.id, publicCode: order.publicCode };
      },
      async findFirst(args) {
        calls.orderFindFirst.push(args);

        if (failOn === "orderFindFirst") {
          throw new Error(
            "raw order detail failure DATABASE_URL provider-secret provider-payment-id",
          );
        }

        return (
          data.merchantOrderDetails.find(
            (order) =>
              order.id === args.where.id &&
              order.establishmentId === args.where.establishmentId,
          ) ?? null
        );
      },
      async updateMany(args) {
        calls.orderUpdateMany.push(args);

        if (failOn === "orderUpdateManyZero") {
          return { count: 0 };
        }

        const order = data.merchantOrderDetails.find(
          (candidate) =>
            candidate.id === args.where.id &&
            candidate.establishmentId === args.where.establishmentId &&
            candidate.status === args.where.status,
        );

        if (!order) {
          return { count: 0 };
        }

        Object.assign(order, args.data);

        const listOrder = data.merchantOrders.find(
          (candidate) =>
            candidate.id === args.where.id &&
            candidate.establishmentId === args.where.establishmentId &&
            candidate.status === args.where.status,
        );

        if (listOrder) {
          Object.assign(listOrder, args.data);
        }

        if (failOn === "orderUpdateMany") {
          throw new Error("raw order update failure DATABASE_URL provider-secret");
        }

        return { count: 1 };
      },
    },
    orderItem: {
      async createMany(args) {
        calls.orderItemCreateMany.push(args);
        data.orderItems.push(...args.data);

        if (failOn === "orderItemCreateMany") {
          throw new Error("raw order_items write failure");
        }

        return { count: args.data.length };
      },
    },
    payment: {
      async create(args) {
        calls.paymentCreate.push(args);
        data.payments.push(args.data);

        if (failOn === "paymentCreate") {
          throw new Error("raw payments write failure");
        }

        return args.data;
      },
    },
    orderStatusHistory: {
      async create(args) {
        calls.historyCreate.push(args);
        data.orderStatusHistory.push(args.data);

        if (failOn === "historyCreate") {
          throw new Error("raw status history write failure");
        }

        return args.data;
      },
    },
  };
}

function cloneData(data: FakeOrderDbData): FakeOrderDbData {
  return {
    establishments: cloneFakeValue(data.establishments),
    products: cloneFakeValue(data.products),
    orders: cloneFakeValue(data.orders),
    orderItems: cloneFakeValue(data.orderItems),
    payments: cloneFakeValue(data.payments),
    orderStatusHistory: cloneFakeValue(data.orderStatusHistory),
    publicOrders: cloneFakeValue(data.publicOrders),
    merchantOrders: cloneFakeValue(data.merchantOrders),
    merchantOrderDetails: cloneFakeValue(data.merchantOrderDetails),
  };
}

function cloneFakeValue<T>(value: T): T {
  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneFakeValue(item)) as T;
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        cloneFakeValue(nestedValue),
      ]),
    ) as T;
  }

  return value;
}

function commitData(target: FakeOrderDbData, source: FakeOrderDbData) {
  target.establishments = source.establishments;
  target.products = source.products;
  target.orders = source.orders;
  target.orderItems = source.orderItems;
  target.payments = source.payments;
  target.orderStatusHistory = source.orderStatusHistory;
  target.publicOrders = source.publicOrders;
  target.merchantOrders = source.merchantOrders;
  target.merchantOrderDetails = source.merchantOrderDetails;
}

function buildEstablishment(
  overrides: Partial<FakeEstablishment> = {},
): FakeEstablishment {
  return {
    id: "est-a",
    ownerId: "merchant-a",
    status: "ACTIVE",
    deliveryFee: "0.00",
    createdAt: NOW,
    ...overrides,
  };
}

function buildProduct(overrides: Partial<FakeProduct> = {}): FakeProduct {
  return {
    id: "product-a",
    establishmentId: "est-a",
    name: "Batata frita",
    price: "19.90",
    status: "ACTIVE",
    ...overrides,
  };
}

function buildPublicOrderPaymentReadRow(
  overrides: Partial<Record<string, unknown>> = {},
): NonNullable<PublicOrderReadRow["payment"]> {
  return {
    id: "payment-internal",
    orderId: "order-internal",
    method: "CASH",
    status: "MANUAL_CASH_ON_DELIVERY",
    amount: "25.40",
    provider: "provider-secret",
    providerPaymentId: "provider-payment-id",
    providerStatus: "provider-status",
    providerPayload: {
      secret: "provider-secret",
      pan: "4111111111111111",
      cvv: "123",
      expiry: "12/30",
      token: "card-token",
    },
    checkoutUrl: null,
    pixQrCode: null,
    pixCopyPaste: null,
    pixExpiresAt: null,
    cardBrand: "card-brand",
    cardLast4: "card-last4",
    paidAt: null,
    failedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as NonNullable<PublicOrderReadRow["payment"]>;
}

function buildPublicOrderReadRow(
  overrides: Partial<PublicOrderReadRow> = {},
): PublicOrderReadRow {
  return {
    id: "order-internal",
    publicCode: "PED-20260427-SAFE01",
    establishmentId: "est-a",
    customerId: "customer-a",
    customerName: "Maria Cliente",
    customerPhone: "11999999999",
    deliveryAddress: "Rua das Flores, 42A - Centro",
    status: "PENDING",
    paymentMethod: "CASH",
    paymentStatus: "MANUAL_CASH_ON_DELIVERY",
    subtotal: "19.90",
    deliveryFee: "5.50",
    discount: "0.00",
    total: "25.40",
    placedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    establishment: {
      name: "Smoke Lanches",
      slug: "smoke-lanches",
      logoUrl: null,
    },
    items: [
      {
        id: "item-internal",
        orderId: "order-internal",
        productId: "product-a",
        productName: "Batata frita",
        unitPrice: "19.90",
        quantity: 1,
        total: "19.90",
        notes: null,
        createdAt: NOW,
      } as PublicOrderReadRow["items"][number],
    ],
    payment: buildPublicOrderPaymentReadRow(),
    statusHistory: [
      {
        id: "history-internal",
        orderId: "order-internal",
        changedById: "changed-by-user",
        status: "PENDING",
        note: "Pedido criado pelo checkout.",
        createdAt: NOW,
      } as PublicOrderReadRow["statusHistory"][number],
    ],
    ...overrides,
  } as PublicOrderReadRow;
}

function buildMerchantOrderListRow(
  overrides: Partial<FakeMerchantOrder> = {},
): FakeMerchantOrder {
  return {
    id: "order-internal",
    establishmentId: "est-a",
    publicCode: "PED-20260427-SAFE01",
    status: "PENDING",
    paymentMethod: "CASH",
    paymentStatus: "MANUAL_CASH_ON_DELIVERY",
    customerName: "Maria Cliente",
    customerId: "customer-a",
    customerPhone: "11999999999",
    deliveryAddress: "Rua das Flores, 42A - Centro",
    deliveryReference: "delivery-reference",
    subtotal: "19.90",
    deliveryFee: "5.50",
    discount: "0.00",
    total: "25.40",
    placedAt: NOW,
    acceptedAt: null,
    deliveredAt: null,
    canceledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    items: [
      {
        id: "item-internal",
        productId: "product-a",
        productName: "Batata frita",
      },
    ],
    statusHistory: [
      {
        id: "history-internal",
        changedById: "changed-by-user",
        status: "PENDING",
      },
    ],
    payment: {
      method: "CASH",
      status: "MANUAL_CASH_ON_DELIVERY",
      amount: "25.40",
      provider: "provider-secret",
      providerPaymentId: "provider-payment-id",
      providerPayload: { secret: "provider-secret" },
      pixCopyPaste: "pix-copy-paste",
      cardLast4: "card-last4",
      paidAt: null,
      failedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    } as MerchantOrderListRow["payment"],
    ...overrides,
  } as FakeMerchantOrder;
}

function buildMerchantOrderDetailRow(
  overrides: Partial<FakeMerchantOrderDetail> = {},
): FakeMerchantOrderDetail {
  return {
    id: "order-internal",
    establishmentId: "est-a",
    publicCode: "PED-20260427-SAFE01",
    status: "PENDING",
    paymentMethod: "CASH",
    paymentStatus: "MANUAL_CASH_ON_DELIVERY",
    customerId: "customer-a",
    customerName: "Maria Cliente",
    customerPhone: "11999999999",
    deliveryAddress: "Rua das Flores, 42A - Centro",
    deliveryStreet: "Rua das Flores",
    deliveryNumber: "42A",
    deliveryComplement: null,
    deliveryNeighborhood: "Centro",
    deliveryCity: "São Paulo",
    deliveryState: "SP",
    deliveryPostalCode: "01001-000",
    deliveryReference: "Portão azul",
    generalObservation: "Sem cebola, por favor.",
    notes: "Confirmar troco na entrega.",
    subtotal: "19.90",
    deliveryFee: "5.50",
    discount: "0.00",
    total: "25.40",
    placedAt: NOW,
    acceptedAt: null,
    deliveredAt: null,
    canceledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    items: [
      {
        id: "item-internal",
        orderId: "order-internal",
        productId: "product-a",
        productName: "Batata frita",
        unitPrice: "19.90",
        quantity: 1,
        total: "19.90",
        notes: "Bem crocante",
        createdAt: NOW,
      },
    ] as FakeMerchantOrderDetail["items"],
    payment: {
      id: "payment-internal",
      orderId: "order-internal",
      method: "CASH",
      status: "MANUAL_CASH_ON_DELIVERY",
      amount: "25.40",
      provider: "provider-secret",
      providerPaymentId: "provider-payment-id",
      providerStatus: "provider-status",
      providerPayload: { secret: "provider-secret" },
      pixQrCode: "pix-qr-code",
      pixCopyPaste: "pix-copy-paste",
      pixExpiresAt: NOW,
      cardBrand: "card-brand",
      cardLast4: "card-last4",
      paidAt: null,
      failedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    } as FakeMerchantOrderDetail["payment"],
    statusHistory: [
      {
        id: "history-internal",
        orderId: "order-internal",
        changedById: "changed-by-user",
        status: "PENDING",
        note: "Pedido criado pelo checkout.",
        createdAt: NOW,
      },
    ] as FakeMerchantOrderDetail["statusHistory"],
    ...overrides,
  } as FakeMerchantOrderDetail;
}

function checkoutPayload(
  overrides: Partial<CheckoutOrderPayload> = {},
): CheckoutOrderPayload {
  return {
    establishmentId: "est-a",
    items: [{ productId: "product-a", quantity: 1 }],
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
    ...overrides,
  };
}

function pixInitiationSuccess(
  overrides: Partial<{
    providerPaymentId: string;
    expiresAt: Date;
    qrCode: string;
    copyPaste: string;
  }> = {},
): PaymentInitiationResult {
  const providerPaymentId = overrides.providerPaymentId ?? "fake_dev_pix_default";
  const expiresAt = overrides.expiresAt ?? new Date("2026-04-27T13:00:00.000Z");
  const qrCode = overrides.qrCode ?? `fake-dev-pix://${providerPaymentId}`;
  const copyPaste = overrides.copyPaste ?? `FAKEDEVPIX|${providerPaymentId}`;

  return {
    ok: true,
    data: {
      method: "PIX",
      publicInstructions: {
        method: "PIX",
        qrCode,
        copyPaste,
        expiresAtIso: expiresAt.toISOString(),
        checkoutUrl: null,
      },
      persistence: {
        method: "PIX",
        status: "PENDING",
        provider: "fake-dev",
        providerPaymentId,
        providerStatus: "pending",
        providerPayload: null,
        checkoutUrl: null,
        pixQrCode: qrCode,
        pixCopyPaste: copyPaste,
        pixExpiresAt: expiresAt,
        cardBrand: null,
        cardLast4: null,
        paidAt: null,
        failedAt: null,
      },
    } satisfies Extract<PaymentInitiationSuccessData, { method: "PIX" }>,
  };
}

function cardInitiationSuccess(
  overrides: Partial<{
    providerPaymentId: string;
    checkoutUrl: string;
  }> = {},
): PaymentInitiationResult {
  const providerPaymentId = overrides.providerPaymentId ?? "fake_dev_card_default";
  const checkoutUrl =
    overrides.checkoutUrl ?? "https://payments.example.test/checkout/default";

  return {
    ok: true,
    data: {
      method: "CARD",
      publicInstructions: {
        method: "CARD",
        checkoutUrl,
      },
      persistence: {
        method: "CARD",
        status: "PENDING",
        provider: "fake-dev",
        providerPaymentId,
        providerStatus: "pending",
        providerPayload: null,
        checkoutUrl,
        pixQrCode: null,
        pixCopyPaste: null,
        pixExpiresAt: null,
        cardBrand: null,
        cardLast4: null,
        paidAt: null,
        failedAt: null,
      },
    } satisfies Extract<PaymentInitiationSuccessData, { method: "CARD" }>,
  };
}

function expectFailure(
  result: CashOrderResult<CreatedCashOrder>,
  code: CashOrderFailureCode,
) {
  expect(result).toMatchObject({
    ok: false,
    code,
  });

  if (result.ok) {
    throw new Error(`Expected ${code} failure, got success ${JSON.stringify(result.data)}`);
  }

  expect(result.message).toBeTruthy();
  expect(JSON.stringify(result)).not.toContain("raw ");
  expect(JSON.stringify(result)).not.toContain("DATABASE_URL");
  expect(JSON.stringify(result)).not.toContain("provider-secret");

  return result;
}

function expectMerchantListFailure(
  result: Awaited<
    ReturnType<ReturnType<typeof createOrderServiceCore>["listMerchantOrdersForOwner"]>
  >,
  code: MerchantOrderListFailureCode,
) {
  expect(result).toMatchObject({
    ok: false,
    code,
  });

  if (result.ok) {
    throw new Error(`Expected ${code} failure, got success ${JSON.stringify(result.data)}`);
  }

  expect(result.message).toBeTruthy();
  expect(JSON.stringify(result)).not.toContain("raw ");
  expect(JSON.stringify(result)).not.toContain("DATABASE_URL");
  expect(JSON.stringify(result)).not.toContain("provider-secret");
  expect(JSON.stringify(result)).not.toContain("Invalid money");
  expect(JSON.stringify(result)).not.toContain("stack");

  return result;
}

function expectMerchantDetailFailure(
  result: Awaited<
    ReturnType<ReturnType<typeof createOrderServiceCore>["getMerchantOrderDetailForOwner"]>
  >,
  code: MerchantOrderDetailFailureCode,
) {
  expect(result).toMatchObject({
    ok: false,
    code,
  });

  if (result.ok) {
    throw new Error(`Expected ${code} failure, got success ${JSON.stringify(result.data)}`);
  }

  expect(result.message).toBeTruthy();
  expect(JSON.stringify(result)).not.toContain("raw ");
  expect(JSON.stringify(result)).not.toContain("DATABASE_URL");
  expect(JSON.stringify(result)).not.toContain("provider-secret");
  expect(JSON.stringify(result)).not.toContain("provider-payment-id");
  expect(JSON.stringify(result)).not.toContain("Invalid money");
  expect(JSON.stringify(result)).not.toContain("stack");

  return result;
}

function expectTransitionSuccess<TData>(
  result: MerchantOrderTransitionResult<TData>,
) {
  expect(result).toMatchObject({ ok: true });

  if (!result.ok) {
    throw new Error(`Expected transition success, got ${result.code}`);
  }

  return expect(result.data);
}

function expectMerchantTransitionSuccess<TData>(
  result: MerchantOrderTransitionResult<TData>,
): TData {
  expect(result).toMatchObject({ ok: true });

  if (!result.ok) {
    throw new Error(`Expected transition success, got ${result.code}`);
  }

  return result.data;
}

function expectMerchantTransitionFailure<TData>(
  result: MerchantOrderTransitionResult<TData>,
  code: MerchantOrderTransitionFailureCode,
) {
  expect(result).toMatchObject({
    ok: false,
    code,
  });

  if (result.ok) {
    throw new Error(`Expected ${code} failure, got success ${JSON.stringify(result.data)}`);
  }

  expect(result.message).toBeTruthy();
  expect(JSON.stringify(result)).not.toContain("raw ");
  expect(JSON.stringify(result)).not.toContain("DATABASE_URL");
  expect(JSON.stringify(result)).not.toContain("provider-secret");
  expect(JSON.stringify(result)).not.toContain("provider-payment-id");
  expect(JSON.stringify(result)).not.toContain("Invalid money");
  expect(JSON.stringify(result)).not.toContain("stack");

  return result;
}

function expectNoDbReads(db: FakeOrderDb) {
  expect(db.calls.transactionCount).toBe(0);
  expect(db.calls.establishmentFindUnique).toEqual([]);
  expect(db.calls.establishmentFindFirst).toEqual([]);
  expect(db.calls.productFindMany).toEqual([]);
  expect(db.calls.orderFindUnique).toEqual([]);
  expect(db.calls.orderFindMany).toEqual([]);
  expect(db.calls.orderFindFirst).toEqual([]);
  expect(db.calls.orderUpdateMany).toEqual([]);
}

function expectNoWrites(db: FakeOrderDb) {
  expect(db.data.orders).toEqual([]);
  expect(db.data.orderItems).toEqual([]);
  expect(db.data.payments).toEqual([]);
  expect(db.data.orderStatusHistory).toEqual([]);
}
