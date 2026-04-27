import "dotenv/config";

import {
  createM002FixturePrismaClient,
  formatM002FixtureSafeError,
  setupM002MoneyFlowFixture,
  type M002FixturePrismaClient,
  type M002MoneyFlowFixture,
} from "./m002-money-flow.fixture";

type BrowserFixture = Omit<M002MoneyFlowFixture, "customerPassword">;

type SetupInput = {
  customerPassword: string;
};

type AssertOrderInput = {
  fixture: BrowserFixture;
  publicCode: string;
};

type DbAssertionSummary = {
  orderExists: boolean;
  status: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  storeMatchesFixture: boolean;
  customerMatchesFixture: boolean;
  itemCount: number;
  itemProductMatchesFixture: boolean;
  itemProductName: string | null;
  itemQuantity: number | null;
  itemUnitPriceCents: number | null;
  itemTotalCents: number | null;
  subtotalCents: number | null;
  deliveryFeeCents: number | null;
  discountCents: number | null;
  totalCents: number | null;
  expectedProductPriceCents: number | null;
  computedTotalCents: number | null;
  paymentExists: boolean;
  paymentMethodPersisted: string | null;
  paymentStatusPersisted: string | null;
  paymentAmountCents: number | null;
  providerFieldsNull: boolean;
  pixFieldsNull: boolean;
  cardFieldsNull: boolean;
  settlementFieldsNull: boolean;
  historyCount: number;
  initialHistoryStatus: string | null;
  initialHistoryNote: string | null;
  initialHistoryActorMatchesCustomer: boolean;
};

async function main() {
  const command = process.argv[2];
  const prisma = createM002FixturePrismaClient();

  try {
    if (command === "setup") {
      const input = await readStdinJson<SetupInput>();
      const customerPassword = readRequiredString(
        input.customerPassword,
        "customer password",
      );
      const fixture = await setupM002MoneyFlowFixture({
        customerPassword,
        prisma,
      });
      const browserFixture: BrowserFixture = {
        storeSlug: fixture.storeSlug,
        storeName: fixture.storeName,
        productName: fixture.productName,
        productPrice: fixture.productPrice,
        customerName: fixture.customerName,
        customerPhone: fixture.customerPhone,
        customerEmail: fixture.customerEmail,
        internalIds: fixture.internalIds,
      };

      writeJson({ fixture: browserFixture });
      return;
    }

    if (command === "assert-order") {
      const input = await readStdinJson<AssertOrderInput>();
      const publicCode = readRequiredString(input.publicCode, "public code");
      const fixture = readFixture(input.fixture);
      const summary = await summarizeOrderAssertions(prisma, publicCode, fixture);

      writeJson({ summary });
      return;
    }

    throw new Error("Unsupported M002 E2E helper command.");
  } finally {
    await prisma.$disconnect();
  }
}

async function summarizeOrderAssertions(
  prisma: M002FixturePrismaClient,
  publicCode: string,
  fixture: BrowserFixture,
): Promise<DbAssertionSummary> {
  const order = await readOrderByPublicCode(prisma, publicCode);

  if (!order) {
    return emptySummary();
  }

  const [item] = order.items;
  const payment = order.payment;
  const [initialHistory] = order.statusHistory;
  const subtotalCents = moneyToCents(order.subtotal);
  const deliveryFeeCents = moneyToCents(order.deliveryFee);
  const discountCents = moneyToCents(order.discount);
  const totalCents = moneyToCents(order.total);
  const expectedProductPriceCents = moneyToCents(fixture.productPrice);

  return {
    orderExists: true,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    storeMatchesFixture: order.establishmentId === fixture.internalIds.establishmentId,
    customerMatchesFixture: order.customerId === fixture.internalIds.customerId,
    itemCount: order.items.length,
    itemProductMatchesFixture: item?.productId === fixture.internalIds.productId,
    itemProductName: item?.productName ?? null,
    itemQuantity: item?.quantity ?? null,
    itemUnitPriceCents: moneyToCents(item?.unitPrice),
    itemTotalCents: moneyToCents(item?.total),
    subtotalCents,
    deliveryFeeCents,
    discountCents,
    totalCents,
    expectedProductPriceCents,
    computedTotalCents:
      subtotalCents === null || deliveryFeeCents === null || discountCents === null
        ? null
        : subtotalCents + deliveryFeeCents - discountCents,
    paymentExists: payment !== null,
    paymentMethodPersisted: payment?.method ?? null,
    paymentStatusPersisted: payment?.status ?? null,
    paymentAmountCents: moneyToCents(payment?.amount),
    providerFieldsNull:
      payment !== null &&
      payment.provider === null &&
      payment.providerPaymentId === null &&
      payment.providerStatus === null &&
      payment.providerPayload === null,
    pixFieldsNull:
      payment !== null &&
      payment.pixQrCode === null &&
      payment.pixCopyPaste === null &&
      payment.pixExpiresAt === null,
    cardFieldsNull:
      payment !== null && payment.cardBrand === null && payment.cardLast4 === null,
    settlementFieldsNull:
      payment !== null && payment.paidAt === null && payment.failedAt === null,
    historyCount: order.statusHistory.length,
    initialHistoryStatus: initialHistory?.status ?? null,
    initialHistoryNote: initialHistory?.note ?? null,
    initialHistoryActorMatchesCustomer:
      initialHistory?.changedById === fixture.internalIds.customerId,
  };
}

function emptySummary(): DbAssertionSummary {
  return {
    orderExists: false,
    status: null,
    paymentMethod: null,
    paymentStatus: null,
    storeMatchesFixture: false,
    customerMatchesFixture: false,
    itemCount: 0,
    itemProductMatchesFixture: false,
    itemProductName: null,
    itemQuantity: null,
    itemUnitPriceCents: null,
    itemTotalCents: null,
    subtotalCents: null,
    deliveryFeeCents: null,
    discountCents: null,
    totalCents: null,
    expectedProductPriceCents: null,
    computedTotalCents: null,
    paymentExists: false,
    paymentMethodPersisted: null,
    paymentStatusPersisted: null,
    paymentAmountCents: null,
    providerFieldsNull: false,
    pixFieldsNull: false,
    cardFieldsNull: false,
    settlementFieldsNull: false,
    historyCount: 0,
    initialHistoryStatus: null,
    initialHistoryNote: null,
    initialHistoryActorMatchesCustomer: false,
  };
}

async function readOrderByPublicCode(
  prisma: M002FixturePrismaClient,
  publicCode: string,
) {
  return prisma.order.findUnique({
    where: { publicCode },
    select: {
      establishmentId: true,
      customerId: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      subtotal: true,
      deliveryFee: true,
      discount: true,
      total: true,
      items: {
        select: {
          productId: true,
          productName: true,
          unitPrice: true,
          quantity: true,
          total: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
      payment: {
        select: {
          method: true,
          status: true,
          amount: true,
          provider: true,
          providerPaymentId: true,
          providerStatus: true,
          providerPayload: true,
          pixQrCode: true,
          pixCopyPaste: true,
          pixExpiresAt: true,
          cardBrand: true,
          cardLast4: true,
          paidAt: true,
          failedAt: true,
        },
      },
      statusHistory: {
        select: {
          status: true,
          changedById: true,
          note: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });
}

async function readStdinJson<TInput>() {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawInput = Buffer.concat(chunks).toString("utf8").trim();

  if (!rawInput) {
    return {} as TInput;
  }

  return JSON.parse(rawInput) as TInput;
}

function readFixture(value: BrowserFixture): BrowserFixture {
  if (!value || typeof value !== "object") {
    throw new Error("Fixture payload missing.");
  }

  return value;
}

function readRequiredString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing ${label}.`);
  }

  return value;
}

function writeJson(payload: unknown) {
  process.stdout.write(JSON.stringify(payload));
}

function moneyToCents(value: unknown) {
  const text = decimalLikeToString(value);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/u.exec(text);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
}

function decimalLikeToString(value: unknown) {
  if (typeof value === "number") {
    return value.toFixed(2);
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object" && "toString" in value) {
    return String(value.toString()).trim();
  }

  return "";
}

main().catch((error: unknown) => {
  process.stderr.write(`${formatM002FixtureSafeError(error)}\n`);
  process.exit(1);
});
