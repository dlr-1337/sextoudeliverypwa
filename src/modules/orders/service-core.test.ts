import { describe, expect, it, vi } from "vitest";

import {
  createCashOrderCore,
  createOrderServiceCore,
  type CashOrderFailureCode,
  type CashOrderTransactionClient,
  type OrderServiceClient,
  type PublicOrderReadRow,
} from "./service-core";
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
      "changed-by-user",
    ]) {
      expect(serialized).not.toContain(forbiddenFragment);
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
});

type FakeEstablishment = {
  id: string;
  status: "PENDING" | "ACTIVE" | "BLOCKED" | "INACTIVE";
  deliveryFee: string;
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

type FakeOrderDbData = {
  establishments: FakeEstablishment[];
  products: FakeProduct[];
  orders: FakeOrder[];
  orderItems: FakeOrderItem[];
  payments: FakePayment[];
  orderStatusHistory: FakeOrderStatusHistory[];
  publicOrders: PublicOrderReadRow[];
};

type FakeOrderDbCalls = {
  transactionCount: number;
  establishmentFindUnique: unknown[];
  productFindMany: unknown[];
  orderCreate: unknown[];
  orderItemCreateMany: unknown[];
  paymentCreate: unknown[];
  historyCreate: unknown[];
  orderFindUnique: unknown[];
};

type FakeOrderDbFailPoint =
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
  };
  const calls: FakeOrderDbCalls = {
    transactionCount: 0,
    establishmentFindUnique: [],
    productFindMany: [],
    orderCreate: [],
    orderItemCreateMany: [],
    paymentCreate: [],
    historyCreate: [],
    orderFindUnique: [],
  };
  let publicCodeCollisionsRemaining =
    options.publicCodeCollisionsBeforeSuccess ??
    (options.failOn === "publicCodeCollision" ? Number.POSITIVE_INFINITY : 0);

  return {
    data,
    calls,
    order: {
      async findUnique(args) {
        calls.orderFindUnique.push(args);

        return (
          data.publicOrders.find(
            (order) => order.publicCode === args.where.publicCode,
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
): CashOrderTransactionClient {
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
    establishments: data.establishments.map((establishment) => ({ ...establishment })),
    products: data.products.map((product) => ({ ...product })),
    orders: data.orders.map((order) => ({ ...order })),
    orderItems: data.orderItems.map((item) => ({ ...item })),
    payments: data.payments.map((payment) => ({ ...payment })),
    orderStatusHistory: data.orderStatusHistory.map((history) => ({ ...history })),
    publicOrders: data.publicOrders,
  };
}

function commitData(target: FakeOrderDbData, source: FakeOrderDbData) {
  target.establishments = source.establishments;
  target.products = source.products;
  target.orders = source.orders;
  target.orderItems = source.orderItems;
  target.payments = source.payments;
  target.orderStatusHistory = source.orderStatusHistory;
  target.publicOrders = source.publicOrders;
}

function buildEstablishment(
  overrides: Partial<FakeEstablishment> = {},
): FakeEstablishment {
  return {
    id: "est-a",
    status: "ACTIVE",
    deliveryFee: "0.00",
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
      paidAt: null,
      failedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    } as PublicOrderReadRow["payment"],
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

function expectFailure(
  result: Awaited<ReturnType<ReturnType<typeof createCashOrderCore>["createCashOrder"]>>,
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

function expectNoWrites(db: FakeOrderDb) {
  expect(db.data.orders).toEqual([]);
  expect(db.data.orderItems).toEqual([]);
  expect(db.data.payments).toEqual([]);
  expect(db.data.orderStatusHistory).toEqual([]);
}
