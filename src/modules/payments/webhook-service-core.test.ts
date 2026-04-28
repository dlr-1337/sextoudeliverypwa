import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  PAYMENT_WEBHOOK_PAYMENT_SELECT,
  createPaymentWebhookServiceCore,
  type PaymentWebhookOrderUpdateManyArgs,
  type PaymentWebhookPaymentFindUniqueArgs,
  type PaymentWebhookPaymentRow,
  type PaymentWebhookPaymentStatus,
  type PaymentWebhookPaymentUpdateManyArgs,
  type PaymentWebhookServiceClient,
  type PaymentWebhookTransactionClient,
} from "./webhook-service-core";
import type {
  FakeDevPaymentWebhookEvent,
  FakeDevPaymentWebhookEventStatus,
} from "./webhook";

const NOW = new Date("2026-04-28T16:05:00.000Z");
const OCCURRED_AT = new Date("2026-04-28T16:00:00.000Z");
const PROVIDER_PAYMENT_ID = "fake_dev_pix_sensitive_provider_id";
const PUBLIC_CODE = "PED-20260428-SAFE01";

const RAW_DB_FAILURE =
  "raw SQL failure DATABASE_URL provider-secret fake_dev_pix_sensitive_provider_id 4111111111111111";

describe("payment webhook service core", () => {
  it("applies approved fake/dev PIX webhooks with minimal select and safe response metadata", async () => {
    const db = createFakePaymentWebhookDb();
    const service = createPaymentWebhookServiceCore({ db, now: () => NOW });

    const result = await service.applyFakeDevPaymentWebhookEvent(webhookEvent());

    expect(result).toEqual({
      ok: true,
      code: "PAYMENT_WEBHOOK_APPLIED",
      message: "Evento de pagamento aplicado.",
      retryable: false,
      data: {
        changed: true,
        paymentStatus: "PAID",
        publicCode: PUBLIC_CODE,
      },
    });
    expectNoSensitiveOutput(result, [
      PROVIDER_PAYMENT_ID,
      "provider-secret",
      "providerPayload",
      "cardBrand",
      "cardLast4",
      "payment-internal",
      "order-internal",
      "4111111111111111",
    ]);
    expect(db.calls.paymentFindUnique).toEqual([
      {
        where: { providerPaymentId: PROVIDER_PAYMENT_ID },
        select: PAYMENT_WEBHOOK_PAYMENT_SELECT,
      },
    ]);
    expect(JSON.stringify(db.calls.paymentFindUnique[0]?.select)).not.toMatch(
      /providerPaymentId|providerPayload|cardBrand|cardLast4|customer|items|history/u,
    );
    expect(db.calls.paymentUpdateMany).toEqual([
      {
        where: {
          id: "payment-internal",
          method: "PIX",
          provider: "fake-dev",
          status: "PENDING",
        },
        data: {
          status: "PAID",
          providerStatus: "paid",
          paidAt: OCCURRED_AT,
          failedAt: null,
          updatedAt: NOW,
        },
      },
    ]);
    expect(JSON.stringify(db.calls.paymentUpdateMany[0]?.data)).not.toMatch(
      /providerPaymentId|providerPayload|cardBrand|cardLast4|eventId|occurredAt|cardNumber|cvv|expiry|token/u,
    );
    expect(db.calls.orderUpdateMany).toEqual([
      {
        where: {
          id: "order-internal",
          paymentStatus: "PENDING",
        },
        data: {
          paymentStatus: "PAID",
          updatedAt: NOW,
        },
      },
    ]);
    expect(JSON.stringify(db.calls.orderUpdateMany[0]?.data)).not.toMatch(
      /\bstatus\b|OrderStatusHistory|history|providerPayload|card/u,
    );
    expect(db.data.payments).toEqual([
      expect.objectContaining({
        id: "payment-internal",
        status: "PAID",
        providerStatus: "paid",
        paidAt: OCCURRED_AT,
        failedAt: null,
        updatedAt: NOW,
        providerPayload: { token: "provider-secret" },
        cardBrand: "card-brand-do-not-touch",
        cardLast4: "4242",
      }),
    ]);
    expect(db.data.orders).toEqual([
      expect.objectContaining({
        id: "order-internal",
        publicCode: PUBLIC_CODE,
        status: "PENDING",
        paymentStatus: "PAID",
        updatedAt: NOW,
      }),
    ]);
    expect(db.data.orderStatusHistory).toEqual([]);
  });

  it("maps failed and canceled webhooks to safe provider statuses and timestamp fields", async () => {
    const scenarios = [
      {
        eventStatus: "failed",
        paymentStatus: "FAILED",
        providerStatus: "failed",
        paidAt: null,
        failedAt: OCCURRED_AT,
      },
      {
        eventStatus: "canceled",
        paymentStatus: "CANCELED",
        providerStatus: "canceled",
        paidAt: null,
        failedAt: null,
      },
    ] as const;

    for (const scenario of scenarios) {
      const db = createFakePaymentWebhookDb({
        payments: [
          buildPaymentRecord({
            providerPaymentId: `fake_dev_pix_${scenario.eventStatus}`,
          }),
        ],
      });
      const service = createPaymentWebhookServiceCore({ db, now: () => NOW });

      const result = await service.applyFakeDevPaymentWebhookEvent(
        webhookEvent({
          providerPaymentId: `fake_dev_pix_${scenario.eventStatus}`,
          status: scenario.eventStatus,
        }),
      );

      expect(result).toMatchObject({
        ok: true,
        code: "PAYMENT_WEBHOOK_APPLIED",
        data: {
          changed: true,
          paymentStatus: scenario.paymentStatus,
          publicCode: PUBLIC_CODE,
        },
      });
      expect(db.data.payments[0]).toEqual(
        expect.objectContaining({
          status: scenario.paymentStatus,
          providerStatus: scenario.providerStatus,
          paidAt: scenario.paidAt,
          failedAt: scenario.failedAt,
          updatedAt: NOW,
        }),
      );
      expect(db.data.orders[0]).toEqual(
        expect.objectContaining({
          paymentStatus: scenario.paymentStatus,
          updatedAt: NOW,
        }),
      );
    }
  });

  it("supports AUTHORIZED-to-terminal compare-and-set transitions", async () => {
    const db = createFakePaymentWebhookDb({
      payments: [
        buildPaymentRecord({
          method: "CARD",
          status: "AUTHORIZED",
          providerStatus: "authorized",
        }),
      ],
      orders: [buildOrderRecord({ paymentStatus: "AUTHORIZED" })],
    });
    const service = createPaymentWebhookServiceCore({ db, now: () => NOW });

    const result = await service.applyFakeDevPaymentWebhookEvent(webhookEvent());

    expect(result).toMatchObject({
      ok: true,
      code: "PAYMENT_WEBHOOK_APPLIED",
      data: { paymentStatus: "PAID", changed: true },
    });
    expect(db.calls.paymentUpdateMany[0]?.where).toEqual({
      id: "payment-internal",
      method: "CARD",
      provider: "fake-dev",
      status: "AUTHORIZED",
    });
    expect(db.calls.orderUpdateMany[0]?.where).toEqual({
      id: "order-internal",
      paymentStatus: "AUTHORIZED",
    });
  });

  it("treats duplicate same-target terminal deliveries as read-only success", async () => {
    const db = createFakePaymentWebhookDb({
      payments: [
        buildPaymentRecord({
          status: "PAID",
          providerStatus: "paid",
          paidAt: OCCURRED_AT,
        }),
      ],
      orders: [buildOrderRecord({ paymentStatus: "PAID" })],
    });
    const service = createPaymentWebhookServiceCore({ db, now: () => NOW });

    const result = await service.applyFakeDevPaymentWebhookEvent(webhookEvent());

    expect(result).toEqual({
      ok: true,
      code: "PAYMENT_WEBHOOK_IDEMPOTENT_DUPLICATE",
      message: "Evento de pagamento já estava aplicado.",
      retryable: false,
      data: {
        changed: false,
        paymentStatus: "PAID",
        publicCode: PUBLIC_CODE,
      },
    });
    expect(db.calls.paymentUpdateMany).toEqual([]);
    expect(db.calls.orderUpdateMany).toEqual([]);
    expect(db.data.payments[0]).toEqual(
      expect.objectContaining({ status: "PAID", providerStatus: "paid" }),
    );
  });

  it("rejects terminal different-target and inconsistent terminal states without writes", async () => {
    const scenarios = [
      {
        name: "different payment target",
        paymentStatus: "PAID",
        orderPaymentStatus: "PAID",
        eventStatus: "failed",
      },
      {
        name: "order already terminal",
        paymentStatus: "PENDING",
        orderPaymentStatus: "PAID",
        eventStatus: "approved",
      },
      {
        name: "payment already terminal",
        paymentStatus: "PAID",
        orderPaymentStatus: "PENDING",
        eventStatus: "approved",
      },
    ] as const;

    for (const scenario of scenarios) {
      const db = createFakePaymentWebhookDb({
        payments: [
          buildPaymentRecord({
            status: scenario.paymentStatus,
            providerStatus: scenario.paymentStatus.toLowerCase(),
          }),
        ],
        orders: [buildOrderRecord({ paymentStatus: scenario.orderPaymentStatus })],
      });
      const service = createPaymentWebhookServiceCore({ db, now: () => NOW });

      const result = await service.applyFakeDevPaymentWebhookEvent(
        webhookEvent({ status: scenario.eventStatus }),
      );

      expect(result, scenario.name).toEqual({
        ok: false,
        code: "PAYMENT_WEBHOOK_TERMINAL_CONFLICT",
        message: "Pagamento já está em status terminal diferente.",
        retryable: false,
      });
      expect(db.calls.paymentUpdateMany).toEqual([]);
      expect(db.calls.orderUpdateMany).toEqual([]);
    }
  });

  it("returns not-found or unsupported failures for missing, non-fake, CASH/manual, unsupported method, and missing-order rows", async () => {
    const scenarios = [
      {
        name: "missing row",
        payments: [],
        orders: [buildOrderRecord()],
        code: "PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND",
      },
      {
        name: "non-fake provider",
        payments: [buildPaymentRecord({ provider: "real-provider" })],
        orders: [buildOrderRecord()],
        code: "PAYMENT_WEBHOOK_PAYMENT_UNSUPPORTED",
      },
      {
        name: "cash manual row",
        payments: [
          buildPaymentRecord({
            method: "CASH",
            provider: null,
            providerStatus: null,
            status: "MANUAL_CASH_ON_DELIVERY",
          }),
        ],
        orders: [buildOrderRecord({ paymentStatus: "MANUAL_CASH_ON_DELIVERY" })],
        code: "PAYMENT_WEBHOOK_PAYMENT_UNSUPPORTED",
      },
      {
        name: "legacy fake method row",
        payments: [buildPaymentRecord({ method: "FAKE" })],
        orders: [buildOrderRecord()],
        code: "PAYMENT_WEBHOOK_PAYMENT_UNSUPPORTED",
      },
      {
        name: "missing order relation",
        payments: [buildPaymentRecord()],
        orders: [],
        code: "PAYMENT_WEBHOOK_PAYMENT_UNSUPPORTED",
      },
    ] as const;

    for (const scenario of scenarios) {
      const db = createFakePaymentWebhookDb({
        payments: scenario.payments,
        orders: scenario.orders,
      });
      const service = createPaymentWebhookServiceCore({ db, now: () => NOW });

      const result = await service.applyFakeDevPaymentWebhookEvent(webhookEvent());

      expect(result, scenario.name).toMatchObject({
        ok: false,
        code: scenario.code,
        retryable: false,
      });
      expectNoSensitiveOutput(result, [PROVIDER_PAYMENT_ID, RAW_DB_FAILURE]);
      expect(db.calls.paymentUpdateMany).toEqual([]);
      expect(db.calls.orderUpdateMany).toEqual([]);
    }
  });

  it("returns a retryable stale result when the payment compare-and-set update misses", async () => {
    const db = createFakePaymentWebhookDb({ failOn: "paymentUpdateManyZero" });
    const service = createPaymentWebhookServiceCore({ db, now: () => NOW });

    const result = await service.applyFakeDevPaymentWebhookEvent(webhookEvent());

    expect(result).toEqual({
      ok: false,
      code: "PAYMENT_WEBHOOK_STALE_UPDATE",
      message: "Pagamento foi atualizado por outra operação. Tente novamente.",
      retryable: true,
    });
    expect(db.calls.paymentUpdateMany).toHaveLength(1);
    expect(db.calls.orderUpdateMany).toEqual([]);
    expect(db.data.payments[0]).toEqual(expect.objectContaining({ status: "PENDING" }));
    expect(db.data.orders[0]).toEqual(expect.objectContaining({ paymentStatus: "PENDING" }));
  });

  it("rolls back payment changes when the order compare-and-set update misses", async () => {
    const db = createFakePaymentWebhookDb({ failOn: "orderUpdateManyZero" });
    const service = createPaymentWebhookServiceCore({ db, now: () => NOW });

    const result = await service.applyFakeDevPaymentWebhookEvent(webhookEvent());

    expect(result).toEqual({
      ok: false,
      code: "PAYMENT_WEBHOOK_STALE_UPDATE",
      message: "Pagamento foi atualizado por outra operação. Tente novamente.",
      retryable: true,
    });
    expect(db.calls.paymentUpdateMany).toHaveLength(1);
    expect(db.calls.orderUpdateMany).toHaveLength(1);
    expect(db.data.payments[0]).toEqual(
      expect.objectContaining({ status: "PENDING", providerStatus: "pending" }),
    );
    expect(db.data.orders[0]).toEqual(expect.objectContaining({ paymentStatus: "PENDING" }));
  });

  it("returns redacted retryable DB failures and rolls back transaction state", async () => {
    const scenarios = ["findUnique", "paymentUpdateMany", "orderUpdateMany"] as const;

    for (const failOn of scenarios) {
      const db = createFakePaymentWebhookDb({ failOn });
      const service = createPaymentWebhookServiceCore({ db, now: () => NOW });

      const result = await service.applyFakeDevPaymentWebhookEvent(webhookEvent());

      expect(result, failOn).toEqual({
        ok: false,
        code: "PAYMENT_WEBHOOK_DATABASE_ERROR",
        message:
          "Não foi possível aplicar o webhook de pagamento agora. Tente novamente.",
        retryable: true,
      });
      expectNoSensitiveOutput(result, [
        RAW_DB_FAILURE,
        "DATABASE_URL",
        "provider-secret",
        PROVIDER_PAYMENT_ID,
        "payment-internal",
        "order-internal",
        "4111111111111111",
      ]);
      expect(db.data.payments[0]).toEqual(
        expect.objectContaining({ status: "PENDING", providerStatus: "pending" }),
      );
      expect(db.data.orders[0]).toEqual(expect.objectContaining({ paymentStatus: "PENDING" }));
      expect(db.data.orderStatusHistory).toEqual([]);
    }
  });

  it("does not import runtime-only Next, server DB, process env, cookie, or route-handler APIs", () => {
    const source = readFileSync(new URL("./webhook-service-core.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/next\//u);
    expect(source).not.toContain("@/server/db");
    expect(source).not.toContain("process.env");
    expect(source).not.toMatch(/\bcookies\b|\bheaders\b|NextRequest|NextResponse/u);
  });
});

type FakePaymentRecord = Omit<PaymentWebhookPaymentRow, "order"> & {
  providerPaymentId: string | null;
  providerPayload?: unknown;
  cardBrand?: string | null;
  cardLast4?: string | null;
  paidAt?: Date | null;
  failedAt?: Date | null;
  updatedAt?: Date;
};

type FakeOrderRecord = {
  id: string;
  publicCode: string;
  status: "PENDING" | "ACCEPTED" | "CANCELED";
  paymentStatus: PaymentWebhookPaymentStatus;
  updatedAt: Date;
};

type FakePaymentWebhookDbData = {
  payments: FakePaymentRecord[];
  orders: FakeOrderRecord[];
  orderStatusHistory: unknown[];
};

type FakePaymentWebhookDbCalls = {
  transactionCount: number;
  paymentFindUnique: PaymentWebhookPaymentFindUniqueArgs[];
  paymentUpdateMany: PaymentWebhookPaymentUpdateManyArgs[];
  orderUpdateMany: PaymentWebhookOrderUpdateManyArgs[];
};

type FakePaymentWebhookDbFailPoint =
  | "findUnique"
  | "paymentUpdateMany"
  | "paymentUpdateManyZero"
  | "orderUpdateMany"
  | "orderUpdateManyZero";

type FakePaymentWebhookDb = PaymentWebhookServiceClient & {
  data: FakePaymentWebhookDbData;
  calls: FakePaymentWebhookDbCalls;
};

function createFakePaymentWebhookDb(options: {
  payments?: FakePaymentRecord[];
  orders?: FakeOrderRecord[];
  failOn?: FakePaymentWebhookDbFailPoint;
} = {}): FakePaymentWebhookDb {
  const data: FakePaymentWebhookDbData = {
    payments: cloneFakeValue(options.payments ?? [buildPaymentRecord()]),
    orders: cloneFakeValue(options.orders ?? [buildOrderRecord()]),
    orderStatusHistory: [],
  };
  const calls: FakePaymentWebhookDbCalls = {
    transactionCount: 0,
    paymentFindUnique: [],
    paymentUpdateMany: [],
    orderUpdateMany: [],
  };

  return {
    data,
    calls,
    async $transaction(callback) {
      calls.transactionCount += 1;
      const transactionData = cloneData(data);
      const tx = createTransactionClient(transactionData, calls, options.failOn);

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
  data: FakePaymentWebhookDbData,
  calls: FakePaymentWebhookDbCalls,
  failOn: FakePaymentWebhookDbFailPoint | undefined,
): PaymentWebhookTransactionClient {
  return {
    payment: {
      async findUnique(args) {
        calls.paymentFindUnique.push(cloneFakeValue(args));

        if (failOn === "findUnique") {
          throw new Error(RAW_DB_FAILURE);
        }

        const payment = data.payments.find(
          (candidate) => candidate.providerPaymentId === args.where.providerPaymentId,
        );

        if (!payment) {
          return null;
        }

        const order =
          data.orders.find((candidate) => candidate.id === payment.orderId) ?? null;

        return {
          id: payment.id,
          orderId: payment.orderId,
          method: payment.method,
          status: payment.status,
          provider: payment.provider,
          providerStatus: payment.providerStatus,
          order: order
            ? {
                publicCode: order.publicCode,
                paymentStatus: order.paymentStatus,
              }
            : null,
        };
      },
      async updateMany(args) {
        calls.paymentUpdateMany.push(cloneFakeValue(args));

        if (failOn === "paymentUpdateManyZero") {
          return { count: 0 };
        }

        const payment = data.payments.find(
          (candidate) =>
            candidate.id === args.where.id &&
            candidate.method === args.where.method &&
            candidate.provider === args.where.provider &&
            candidate.status === args.where.status,
        );

        if (!payment) {
          return { count: 0 };
        }

        Object.assign(payment, args.data);

        if (failOn === "paymentUpdateMany") {
          throw new Error(RAW_DB_FAILURE);
        }

        return { count: 1 };
      },
    },
    order: {
      async updateMany(args) {
        calls.orderUpdateMany.push(cloneFakeValue(args));

        if (failOn === "orderUpdateManyZero") {
          return { count: 0 };
        }

        const order = data.orders.find(
          (candidate) =>
            candidate.id === args.where.id &&
            candidate.paymentStatus === args.where.paymentStatus,
        );

        if (!order) {
          return { count: 0 };
        }

        Object.assign(order, args.data);

        if (failOn === "orderUpdateMany") {
          throw new Error(RAW_DB_FAILURE);
        }

        return { count: 1 };
      },
    },
  };
}

function webhookEvent(
  overrides: Partial<{
    providerPaymentId: string;
    status: FakeDevPaymentWebhookEventStatus;
  }> = {},
): FakeDevPaymentWebhookEvent {
  return {
    provider: "fake-dev",
    eventId: "evt_fake_20260428_safe",
    providerPaymentId: overrides.providerPaymentId ?? PROVIDER_PAYMENT_ID,
    status: overrides.status ?? "approved",
    occurredAt: OCCURRED_AT,
  };
}

function buildPaymentRecord(
  overrides: Partial<FakePaymentRecord> = {},
): FakePaymentRecord {
  return {
    id: "payment-internal",
    orderId: "order-internal",
    method: "PIX",
    status: "PENDING",
    provider: "fake-dev",
    providerPaymentId: PROVIDER_PAYMENT_ID,
    providerStatus: "pending",
    providerPayload: { token: "provider-secret" },
    cardBrand: "card-brand-do-not-touch",
    cardLast4: "4242",
    paidAt: null,
    failedAt: null,
    updatedAt: new Date("2026-04-28T15:50:00.000Z"),
    ...overrides,
  };
}

function buildOrderRecord(overrides: Partial<FakeOrderRecord> = {}): FakeOrderRecord {
  return {
    id: "order-internal",
    publicCode: PUBLIC_CODE,
    status: "PENDING",
    paymentStatus: "PENDING",
    updatedAt: new Date("2026-04-28T15:50:00.000Z"),
    ...overrides,
  };
}

function cloneData(data: FakePaymentWebhookDbData): FakePaymentWebhookDbData {
  return {
    payments: cloneFakeValue(data.payments),
    orders: cloneFakeValue(data.orders),
    orderStatusHistory: cloneFakeValue(data.orderStatusHistory),
  };
}

function commitData(
  target: FakePaymentWebhookDbData,
  source: FakePaymentWebhookDbData,
) {
  target.payments = source.payments;
  target.orders = source.orders;
  target.orderStatusHistory = source.orderStatusHistory;
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

function expectNoSensitiveOutput(value: unknown, forbiddenFragments: readonly string[]) {
  const serialized = JSON.stringify(value);

  for (const fragment of forbiddenFragments) {
    expect(serialized).not.toContain(fragment);
  }
}
