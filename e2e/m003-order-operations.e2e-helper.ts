import "dotenv/config";

import { OrderStatus } from "../src/generated/prisma/client";

import {
  createM003FixturePrismaClient,
  formatM003FixtureSafeError,
  setupM003OrderOperationsFixture,
  type M003FixturePrismaClient,
  type M003OrderOperationsFixture,
} from "./m003-order-operations.fixture";

type SetupInput = {
  customerPassword: string;
  ownerMerchantPassword: string;
};

type AssertOrderOperatedInput = {
  fixture: M003OrderOperationsFixture;
  publicCode: string;
  expectedMerchantNote?: string;
};

type DbAssertionSummary = {
  orderExists: boolean;
  status: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  acceptedAtSet: boolean;
  updatedAtMatchesAcceptedAt: boolean;
  terminalTimestampsNull: boolean;
  deliveredAtNull: boolean;
  canceledAtNull: boolean;
  storeMatchesFixture: boolean;
  customerMatchesFixture: boolean;
  itemCount: number;
  itemProductMatchesFixture: boolean;
  itemProductName: string | null;
  itemProductNameMatchesFixture: boolean;
  itemQuantity: number | null;
  itemUnitPriceCents: number | null;
  itemTotalCents: number | null;
  expectedProductPriceCents: number | null;
  paymentExists: boolean;
  paymentMethodPersisted: string | null;
  paymentStatusPersisted: string | null;
  providerFieldsNull: boolean;
  pixFieldsNull: boolean;
  cardFieldsNull: boolean;
  settlementFieldsNull: boolean;
  historyCount: number;
  initialHistoryStatus: string | null;
  initialHistoryNote: string | null;
  initialHistoryActorMatchesCustomer: boolean;
  acceptedHistoryStatus: string | null;
  acceptedHistoryNote: string | null;
  acceptedHistoryActorMatchesMerchant: boolean;
  acceptedHistoryNoteMatchesExpected: boolean | null;
};

async function main() {
  const command = process.argv[2];

  if (command === "setup") {
    const input = await readStdinJson<SetupInput>();
    const customerPassword = readRequiredString(
      input.customerPassword,
      "customer password",
    );
    const ownerMerchantPassword = readRequiredString(
      input.ownerMerchantPassword,
      "owner merchant password",
    );
    const prisma = createM003FixturePrismaClient();

    try {
      const fixture = await setupM003OrderOperationsFixture({
        customerPassword,
        ownerMerchantPassword,
        prisma,
      });

      writeJson({ fixture });
      return;
    } finally {
      await prisma.$disconnect();
    }
  }

  if (command === "assert-order-operated") {
    const input = await readStdinJson<AssertOrderOperatedInput>();
    const publicCode = readRequiredString(input.publicCode, "public code");
    const fixture = readFixture(input.fixture);
    const expectedMerchantNote = readOptionalString(
      input.expectedMerchantNote,
      "expected merchant note",
    );
    const prisma = createM003FixturePrismaClient();

    try {
      const summary = await summarizeOrderOperationAssertions(
        prisma,
        publicCode,
        fixture,
        expectedMerchantNote,
      );

      writeJson({ summary });
      return;
    } finally {
      await prisma.$disconnect();
    }
  }

  throw new Error("Unsupported M003 E2E helper command.");
}

async function summarizeOrderOperationAssertions(
  prisma: M003FixturePrismaClient,
  publicCode: string,
  fixture: M003OrderOperationsFixture,
  expectedMerchantNote: string | null,
): Promise<DbAssertionSummary> {
  const order = await readOrderByPublicCode(prisma, publicCode);

  if (!order) {
    return emptySummary();
  }

  const [item] = order.items;
  const payment = order.payment;
  const [initialHistory] = order.statusHistory;
  const acceptedHistory = order.statusHistory.find(
    (history) => history.status === OrderStatus.ACCEPTED,
  );
  const acceptedAtSet = order.acceptedAt instanceof Date;
  const expectedProductPriceCents = moneyToCents(fixture.productPrice);

  return {
    orderExists: true,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    acceptedAtSet,
    updatedAtMatchesAcceptedAt:
      acceptedAtSet && order.updatedAt.getTime() === order.acceptedAt?.getTime(),
    terminalTimestampsNull: order.deliveredAt === null && order.canceledAt === null,
    deliveredAtNull: order.deliveredAt === null,
    canceledAtNull: order.canceledAt === null,
    storeMatchesFixture: order.establishmentId === fixture.internalIds.establishmentId,
    customerMatchesFixture: order.customerId === fixture.internalIds.customerId,
    itemCount: order.items.length,
    itemProductMatchesFixture: item?.productId === fixture.internalIds.productId,
    itemProductName: item?.productName ?? null,
    itemProductNameMatchesFixture: item?.productName === fixture.productName,
    itemQuantity: item?.quantity ?? null,
    itemUnitPriceCents: moneyToCents(item?.unitPrice),
    itemTotalCents: moneyToCents(item?.total),
    expectedProductPriceCents,
    paymentExists: payment !== null,
    paymentMethodPersisted: payment?.method ?? null,
    paymentStatusPersisted: payment?.status ?? null,
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
    acceptedHistoryStatus: acceptedHistory?.status ?? null,
    acceptedHistoryNote: acceptedHistory?.note ?? null,
    acceptedHistoryActorMatchesMerchant:
      acceptedHistory?.changedById === fixture.internalIds.ownerMerchantUserId,
    acceptedHistoryNoteMatchesExpected:
      expectedMerchantNote === null
        ? null
        : acceptedHistory?.note === expectedMerchantNote,
  };
}

function emptySummary(): DbAssertionSummary {
  return {
    orderExists: false,
    status: null,
    paymentMethod: null,
    paymentStatus: null,
    acceptedAtSet: false,
    updatedAtMatchesAcceptedAt: false,
    terminalTimestampsNull: false,
    deliveredAtNull: false,
    canceledAtNull: false,
    storeMatchesFixture: false,
    customerMatchesFixture: false,
    itemCount: 0,
    itemProductMatchesFixture: false,
    itemProductName: null,
    itemProductNameMatchesFixture: false,
    itemQuantity: null,
    itemUnitPriceCents: null,
    itemTotalCents: null,
    expectedProductPriceCents: null,
    paymentExists: false,
    paymentMethodPersisted: null,
    paymentStatusPersisted: null,
    providerFieldsNull: false,
    pixFieldsNull: false,
    cardFieldsNull: false,
    settlementFieldsNull: false,
    historyCount: 0,
    initialHistoryStatus: null,
    initialHistoryNote: null,
    initialHistoryActorMatchesCustomer: false,
    acceptedHistoryStatus: null,
    acceptedHistoryNote: null,
    acceptedHistoryActorMatchesMerchant: false,
    acceptedHistoryNoteMatchesExpected: null,
  };
}

async function readOrderByPublicCode(
  prisma: M003FixturePrismaClient,
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
      acceptedAt: true,
      deliveredAt: true,
      canceledAt: true,
      updatedAt: true,
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

  try {
    return JSON.parse(rawInput) as TInput;
  } catch {
    throw new Error("Malformed M003 helper JSON input.");
  }
}

function readFixture(value: unknown): M003OrderOperationsFixture {
  if (!isRecord(value)) {
    throw new Error("Fixture payload missing.");
  }

  const internalIds = readRecord(value.internalIds, "fixture internal ids");

  return {
    storeSlug: readRequiredString(value.storeSlug, "store slug"),
    storeName: readRequiredString(value.storeName, "store name"),
    productName: readRequiredString(value.productName, "product name"),
    productPrice: readRequiredString(value.productPrice, "product price"),
    customerName: readRequiredString(value.customerName, "customer name"),
    customerPhone: readRequiredString(value.customerPhone, "customer phone"),
    customerEmail: readRequiredString(value.customerEmail, "customer email"),
    ownerMerchantEmail: readRequiredString(
      value.ownerMerchantEmail,
      "owner merchant email",
    ),
    internalIds: {
      customerId: readRequiredString(internalIds.customerId, "fixture customer id"),
      ownerMerchantUserId: readRequiredString(
        internalIds.ownerMerchantUserId,
        "fixture owner merchant user id",
      ),
      establishmentId: readRequiredString(
        internalIds.establishmentId,
        "fixture establishment id",
      ),
      productId: readRequiredString(internalIds.productId, "fixture product id"),
    },
  };
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Missing ${label}.`);
  }

  return value;
}

function readRequiredString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${label}.`);
  }

  return value;
}

function readOptionalString(value: unknown, label: string) {
  if (value === undefined || value === null) {
    return null;
  }

  return readRequiredString(value, label);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

main().catch((error: unknown) => {
  process.stderr.write(`${formatM003FixtureSafeError(error)}\n`);
  process.exit(1);
});
