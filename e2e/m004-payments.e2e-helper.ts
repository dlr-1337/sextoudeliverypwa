import "dotenv/config";

import { z } from "zod";

import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "../src/generated/prisma/client";
import {
  createOrderServiceCore,
  type OrderServiceClient,
} from "../src/modules/orders/service-core";
import { PAYMENT_GATEWAY_PROVIDER_FAKE_DEV } from "../src/modules/payments/types";

import {
  createM004FixturePrismaClient,
  formatM004FixtureSafeError,
  setupM004PaymentsFixture,
  type M004FixturePrismaClient,
  type M004PaymentsFixture,
} from "./m004-payments.fixture";

type OnlinePaymentMethod = "PIX" | "CARD";
type TerminalPaymentStatus = "PAID" | "FAILED" | "CANCELED";
type PaymentOrderSnapshot = Awaited<ReturnType<typeof readPaymentOrderByPublicCode>>;
type ExistingPaymentOrderSnapshot = NonNullable<PaymentOrderSnapshot>;
type ExistingPaymentSnapshot = NonNullable<ExistingPaymentOrderSnapshot["payment"]>;

type ReadOnlinePaymentInput = {
  fixture: M004PaymentsFixture;
  publicCode: string;
  expectedMethod: OnlinePaymentMethod;
  scenario?: string;
};

type AssertTerminalPaymentInput = ReadOnlinePaymentInput & {
  expectedPaymentStatus: TerminalPaymentStatus;
};

type OnlinePaymentInstructionSummary =
  | {
      method: "PIX";
      qrCodePresent: boolean;
      copyPastePresent: boolean;
      expiresAtSet: boolean;
      checkoutUrlPresent: false;
    }
  | {
      method: "CARD";
      checkoutUrlPresent: boolean;
      pixFieldsNull: boolean;
    };

type ReadOnlinePaymentResult = {
  scenario: string;
  publicCode: string;
  method: OnlinePaymentMethod;
  orderStatus: string;
  orderPaymentStatus: string;
  paymentStatus: string;
  provider: typeof PAYMENT_GATEWAY_PROVIDER_FAKE_DEV;
  providerStatus: string;
  providerCorrelation: {
    providerPaymentId: string;
  };
  storeMatchesFixture: boolean;
  customerMatchesFixture: boolean;
  itemProductMatchesFixture: boolean;
  itemProductNameMatchesFixture: boolean;
  itemQuantity: number | null;
  orderTotalCents: number | null;
  paymentAmountCents: number | null;
  providerPayloadNull: boolean;
  instructions: OnlinePaymentInstructionSummary;
  publicTrackingMatches: boolean;
  publicTrackingInstructionsPresent: boolean;
  publicDtoRedactionSafe: boolean;
};

type TerminalPaymentAssertionSummary = {
  scenario: string;
  publicCode: string;
  method: OnlinePaymentMethod;
  expectedPaymentStatus: TerminalPaymentStatus;
  orderStatus: string;
  orderPaymentStatus: string;
  paymentStatus: string;
  providerStatus: string | null;
  providerPaymentIdPresent: boolean;
  storeMatchesFixture: boolean;
  customerMatchesFixture: boolean;
  itemProductMatchesFixture: boolean;
  itemProductNameMatchesFixture: boolean;
  itemQuantity: number | null;
  orderTotalCents: number | null;
  paymentAmountCents: number | null;
  providerPayloadNull: boolean;
  paidAtSet: boolean;
  failedAtSet: boolean;
  terminalTimestampsMatchStatus: boolean;
  publicTrackingMatches: boolean;
  publicTrackingInstructionsPresent: boolean;
  publicDtoRedactionSafe: boolean;
};

const nonEmptyStringSchema = z.string().trim().min(1).max(256);
const publicCodeSchema = z.string().trim().min(1).max(64);
const onlinePaymentMethodSchema = z.enum(["PIX", "CARD"]);
const terminalPaymentStatusSchema = z.enum(["PAID", "FAILED", "CANCELED"]);

const fixtureSchema = z
  .object({
    storeSlug: nonEmptyStringSchema,
    storeName: nonEmptyStringSchema,
    productName: nonEmptyStringSchema,
    productPrice: nonEmptyStringSchema,
    customerName: nonEmptyStringSchema,
    customerPhone: nonEmptyStringSchema,
    customerEmail: nonEmptyStringSchema,
    internalIds: z
      .object({
        customerId: nonEmptyStringSchema,
        merchantUserId: nonEmptyStringSchema,
        establishmentId: nonEmptyStringSchema,
        productId: nonEmptyStringSchema,
      })
      .strict(),
  })
  .strict();

const setupInputSchema = z
  .object({
    customerPassword: nonEmptyStringSchema,
    merchantPassword: nonEmptyStringSchema.optional(),
    runId: nonEmptyStringSchema.optional(),
  })
  .strict();

const readOnlinePaymentInputSchema = z
  .object({
    fixture: fixtureSchema,
    publicCode: publicCodeSchema,
    expectedMethod: onlinePaymentMethodSchema,
    scenario: nonEmptyStringSchema.optional(),
  })
  .strict();

const assertTerminalPaymentInputSchema = readOnlinePaymentInputSchema
  .extend({
    expectedPaymentStatus: terminalPaymentStatusSchema,
  })
  .strict();

const PUBLIC_DTO_FORBIDDEN_KEYS = [
  "id",
  "orderId",
  "customerId",
  "customerPhone",
  "deliveryAddress",
  "deliveryStreet",
  "deliveryNumber",
  "deliveryComplement",
  "deliveryNeighborhood",
  "deliveryCity",
  "deliveryState",
  "deliveryPostalCode",
  "deliveryReference",
  "changedById",
  "provider",
  "providerPaymentId",
  "providerStatus",
  "providerPayload",
  "pixQrCode",
  "pixCopyPaste",
  "pixExpiresAt",
  "cardBrand",
  "cardLast4",
  "cardNumber",
  "cvv",
  "expiry",
  "passwordHash",
  "sessionToken",
  "tokenHash",
] as const;

async function main() {
  const command = process.argv[2];

  if (command === "setup") {
    const input = parseCommandInput(
      await readStdinJson(),
      setupInputSchema,
      "setup",
    );
    const prisma = createM004FixturePrismaClient();

    try {
      const fixture = await setupM004PaymentsFixture({
        customerPassword: input.customerPassword,
        merchantPassword: input.merchantPassword,
        runId: input.runId,
        prisma,
      });

      writeJson({ fixture });
      return;
    } finally {
      await prisma.$disconnect();
    }
  }

  if (command === "read-online-payment") {
    const input = parseCommandInput(
      await readStdinJson(),
      readOnlinePaymentInputSchema,
      "read-online-payment",
    );
    const prisma = createM004FixturePrismaClient();

    try {
      const result = await readOnlinePayment(prisma, input);

      writeJson({ result });
      return;
    } finally {
      await prisma.$disconnect();
    }
  }

  if (command === "assert-terminal-payment") {
    const input = parseCommandInput(
      await readStdinJson(),
      assertTerminalPaymentInputSchema,
      "assert-terminal-payment",
    );
    const prisma = createM004FixturePrismaClient();

    try {
      const summary = await assertTerminalPayment(prisma, input);

      writeJson({ summary });
      return;
    } finally {
      await prisma.$disconnect();
    }
  }

  throw new Error("Unsupported M004 E2E helper command.");
}

async function readOnlinePayment(
  prisma: M004FixturePrismaClient,
  input: ReadOnlinePaymentInput,
): Promise<ReadOnlinePaymentResult> {
  const scenario = normalizeScenario(input.scenario);
  const snapshot = await readRequiredOrderSnapshot(prisma, {
    publicCode: input.publicCode,
    scenario,
    method: input.expectedMethod,
    command: "read-online-payment",
  });
  const payment = assertPendingOnlinePayment(snapshot, input.fixture, {
    publicCode: input.publicCode,
    scenario,
    method: input.expectedMethod,
    command: "read-online-payment",
  });
  const publicTracking = await assertPublicTracking(prisma, {
    publicCode: input.publicCode,
    scenario,
    method: input.expectedMethod,
    expectedPaymentStatus: PaymentStatus.PENDING,
    command: "read-online-payment",
  });

  return {
    scenario,
    publicCode: snapshot.publicCode,
    method: input.expectedMethod,
    orderStatus: snapshot.status,
    orderPaymentStatus: snapshot.paymentStatus,
    paymentStatus: payment.status,
    provider: PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
    providerStatus: readRequiredString(payment.providerStatus),
    providerCorrelation: {
      providerPaymentId: readRequiredString(payment.providerPaymentId),
    },
    storeMatchesFixture: snapshot.establishmentId === input.fixture.internalIds.establishmentId,
    customerMatchesFixture: snapshot.customerId === input.fixture.internalIds.customerId,
    itemProductMatchesFixture:
      snapshot.items[0]?.productId === input.fixture.internalIds.productId,
    itemProductNameMatchesFixture:
      snapshot.items[0]?.productName === input.fixture.productName,
    itemQuantity: snapshot.items[0]?.quantity ?? null,
    orderTotalCents: moneyToCents(snapshot.total),
    paymentAmountCents: moneyToCents(payment.amount),
    providerPayloadNull: payment.providerPayload === null,
    instructions: summarizeInstructionShape(payment, input.expectedMethod),
    publicTrackingMatches: publicTracking.matches,
    publicTrackingInstructionsPresent: publicTracking.instructionsPresent,
    publicDtoRedactionSafe: publicTracking.redactionSafe,
  };
}

async function assertTerminalPayment(
  prisma: M004FixturePrismaClient,
  input: AssertTerminalPaymentInput,
): Promise<TerminalPaymentAssertionSummary> {
  const scenario = normalizeScenario(input.scenario);
  const snapshot = await readRequiredOrderSnapshot(prisma, {
    publicCode: input.publicCode,
    scenario,
    method: input.expectedMethod,
    status: input.expectedPaymentStatus,
    command: "assert-terminal-payment",
  });
  const payment = assertTerminalOnlinePayment(snapshot, input.fixture, {
    publicCode: input.publicCode,
    scenario,
    method: input.expectedMethod,
    status: input.expectedPaymentStatus,
    command: "assert-terminal-payment",
  });
  const publicTracking = await assertPublicTracking(prisma, {
    publicCode: input.publicCode,
    scenario,
    method: input.expectedMethod,
    expectedPaymentStatus: input.expectedPaymentStatus,
    command: "assert-terminal-payment",
  });
  const terminalTimestampsMatchStatus = matchTerminalTimestampExpectation(
    payment,
    input.expectedPaymentStatus,
  );

  return {
    scenario,
    publicCode: snapshot.publicCode,
    method: input.expectedMethod,
    expectedPaymentStatus: input.expectedPaymentStatus,
    orderStatus: snapshot.status,
    orderPaymentStatus: snapshot.paymentStatus,
    paymentStatus: payment.status,
    providerStatus: payment.providerStatus,
    providerPaymentIdPresent: isNonEmptyString(payment.providerPaymentId),
    storeMatchesFixture: snapshot.establishmentId === input.fixture.internalIds.establishmentId,
    customerMatchesFixture: snapshot.customerId === input.fixture.internalIds.customerId,
    itemProductMatchesFixture:
      snapshot.items[0]?.productId === input.fixture.internalIds.productId,
    itemProductNameMatchesFixture:
      snapshot.items[0]?.productName === input.fixture.productName,
    itemQuantity: snapshot.items[0]?.quantity ?? null,
    orderTotalCents: moneyToCents(snapshot.total),
    paymentAmountCents: moneyToCents(payment.amount),
    providerPayloadNull: payment.providerPayload === null,
    paidAtSet: isValidDate(payment.paidAt),
    failedAtSet: isValidDate(payment.failedAt),
    terminalTimestampsMatchStatus,
    publicTrackingMatches: publicTracking.matches,
    publicTrackingInstructionsPresent: publicTracking.instructionsPresent,
    publicDtoRedactionSafe: publicTracking.redactionSafe,
  };
}

function assertPendingOnlinePayment(
  snapshot: ExistingPaymentOrderSnapshot,
  fixture: M004PaymentsFixture,
  context: HelperContext & { method: OnlinePaymentMethod },
) {
  const payment = snapshot.payment;

  assertFixtureOrderShape(snapshot, fixture, context);

  if (
    snapshot.status !== OrderStatus.PENDING ||
    snapshot.paymentMethod !== context.method ||
    snapshot.paymentStatus !== PaymentStatus.PENDING ||
    !payment ||
    payment.method !== context.method ||
    payment.status !== PaymentStatus.PENDING ||
    payment.provider !== PAYMENT_GATEWAY_PROVIDER_FAKE_DEV ||
    !isNonEmptyString(payment.providerPaymentId) ||
    payment.providerStatus !== "pending" ||
    payment.providerPayload !== null ||
    payment.cardBrand !== null ||
    payment.cardLast4 !== null ||
    payment.paidAt !== null ||
    payment.failedAt !== null
  ) {
    failSafe(context, "pending online payment state mismatch");
  }

  assertInstructionShape(payment, context);
  assertPaymentAmountMatchesOrder(snapshot, payment, context);

  return payment;
}

function assertTerminalOnlinePayment(
  snapshot: ExistingPaymentOrderSnapshot,
  fixture: M004PaymentsFixture,
  context: HelperContext & {
    method: OnlinePaymentMethod;
    status: TerminalPaymentStatus;
  },
) {
  const payment = snapshot.payment;
  const expectedProviderStatus = providerStatusForPaymentStatus(context.status);

  assertFixtureOrderShape(snapshot, fixture, context);

  if (
    snapshot.status !== OrderStatus.PENDING ||
    snapshot.paymentMethod !== context.method ||
    snapshot.paymentStatus !== context.status ||
    !payment ||
    payment.method !== context.method ||
    payment.status !== context.status ||
    payment.provider !== PAYMENT_GATEWAY_PROVIDER_FAKE_DEV ||
    !isNonEmptyString(payment.providerPaymentId) ||
    payment.providerStatus !== expectedProviderStatus ||
    payment.providerPayload !== null ||
    payment.cardBrand !== null ||
    payment.cardLast4 !== null ||
    !matchTerminalTimestampExpectation(payment, context.status)
  ) {
    failSafe(context, "terminal online payment state mismatch");
  }

  assertInstructionShape(payment, context);
  assertPaymentAmountMatchesOrder(snapshot, payment, context);

  return payment;
}

function assertFixtureOrderShape(
  snapshot: ExistingPaymentOrderSnapshot,
  fixture: M004PaymentsFixture,
  context: HelperContext,
) {
  const item = snapshot.items[0];

  if (
    snapshot.establishmentId !== fixture.internalIds.establishmentId ||
    snapshot.customerId !== fixture.internalIds.customerId ||
    snapshot.items.length !== 1 ||
    item?.productId !== fixture.internalIds.productId ||
    item.productName !== fixture.productName ||
    item.quantity !== 1 ||
    moneyToCents(item.unitPrice) !== moneyToCents(fixture.productPrice) ||
    moneyToCents(item.total) !== moneyToCents(fixture.productPrice)
  ) {
    failSafe(context, "fixture ownership or item snapshot mismatch");
  }
}

function assertInstructionShape(
  payment: ExistingPaymentSnapshot,
  context: HelperContext & { method: OnlinePaymentMethod },
) {
  if (context.method === "PIX") {
    if (
      payment.checkoutUrl !== null ||
      !isNonEmptyString(payment.pixQrCode) ||
      !isNonEmptyString(payment.pixCopyPaste) ||
      !isValidDate(payment.pixExpiresAt)
    ) {
      failSafe(context, "PIX instruction shape mismatch");
    }

    return;
  }

  if (
    !isAbsoluteHttpUrl(payment.checkoutUrl) ||
    payment.pixQrCode !== null ||
    payment.pixCopyPaste !== null ||
    payment.pixExpiresAt !== null
  ) {
    failSafe(context, "CARD instruction shape mismatch");
  }
}

function assertPaymentAmountMatchesOrder(
  snapshot: ExistingPaymentOrderSnapshot,
  payment: ExistingPaymentSnapshot,
  context: HelperContext,
) {
  const orderTotalCents = moneyToCents(snapshot.total);
  const paymentAmountCents = moneyToCents(payment.amount);

  if (
    orderTotalCents === null ||
    paymentAmountCents === null ||
    orderTotalCents !== paymentAmountCents
  ) {
    failSafe(context, "payment amount mismatch");
  }
}

async function assertPublicTracking(
  prisma: M004FixturePrismaClient,
  context: HelperContext & {
    method: OnlinePaymentMethod;
    expectedPaymentStatus: "PENDING" | TerminalPaymentStatus;
  },
) {
  const publicOrderService = createOrderServiceCore({
    db: prisma as unknown as OrderServiceClient,
    enums: {
      establishmentStatus: EstablishmentStatusForOrderService,
      productStatus: ProductStatusForOrderService,
      orderStatus: OrderStatus,
      paymentMethod: PaymentMethod,
      paymentStatus: PaymentStatus,
    },
  });
  const publicOrder = await publicOrderService.getPublicOrderByCode(
    context.publicCode,
  );

  if (!publicOrder) {
    failSafe(context, "public tracking DTO missing");
  }

  const leakedKey = findForbiddenPublicDtoKey(publicOrder);

  if (leakedKey) {
    failSafe(context, `public tracking DTO leaked ${leakedKey}`);
  }

  const instructions = publicOrder.payment?.instructions ?? null;
  const instructionsPresent =
    context.method === "PIX"
      ? instructions?.method === "PIX" &&
        isNonEmptyString(instructions.qrCode) &&
        isNonEmptyString(instructions.copyPaste) &&
        isValidDate(instructions.expiresAt)
      : instructions?.method === "CARD" && isAbsoluteHttpUrl(instructions.checkoutUrl);
  const matches =
    publicOrder.publicCode === context.publicCode &&
    publicOrder.status === OrderStatus.PENDING &&
    publicOrder.paymentMethod === context.method &&
    publicOrder.paymentStatus === context.expectedPaymentStatus &&
    publicOrder.payment?.method === context.method &&
    publicOrder.payment.status === context.expectedPaymentStatus &&
    instructionsPresent;

  if (!matches) {
    failSafe(context, "public tracking payment state mismatch");
  }

  return {
    matches,
    instructionsPresent,
    redactionSafe: leakedKey === null,
  };
}

const EstablishmentStatusForOrderService = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  BLOCKED: "BLOCKED",
  INACTIVE: "INACTIVE",
} as const;

const ProductStatusForOrderService = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  ARCHIVED: "ARCHIVED",
} as const;

async function readRequiredOrderSnapshot(
  prisma: M004FixturePrismaClient,
  context: HelperContext,
): Promise<ExistingPaymentOrderSnapshot> {
  const snapshot = await readPaymentOrderByPublicCode(prisma, context.publicCode);

  if (!snapshot) {
    failSafe(context, "order not found");
  }

  return snapshot;
}

async function readPaymentOrderByPublicCode(
  prisma: M004FixturePrismaClient,
  publicCode: string,
) {
  return prisma.order.findUnique({
    where: { publicCode },
    select: {
      publicCode: true,
      establishmentId: true,
      customerId: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
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
          checkoutUrl: true,
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

function summarizeInstructionShape(
  payment: ExistingPaymentSnapshot,
  method: OnlinePaymentMethod,
): OnlinePaymentInstructionSummary {
  if (method === "PIX") {
    return {
      method,
      qrCodePresent: isNonEmptyString(payment.pixQrCode),
      copyPastePresent: isNonEmptyString(payment.pixCopyPaste),
      expiresAtSet: isValidDate(payment.pixExpiresAt),
      checkoutUrlPresent: false,
    };
  }

  return {
    method,
    checkoutUrlPresent: isAbsoluteHttpUrl(payment.checkoutUrl),
    pixFieldsNull:
      payment.pixQrCode === null &&
      payment.pixCopyPaste === null &&
      payment.pixExpiresAt === null,
  };
}

function matchTerminalTimestampExpectation(
  payment: ExistingPaymentSnapshot,
  status: TerminalPaymentStatus,
) {
  if (status === "PAID") {
    return isValidDate(payment.paidAt) && payment.failedAt === null;
  }

  if (status === "FAILED") {
    return payment.paidAt === null && isValidDate(payment.failedAt);
  }

  return payment.paidAt === null && payment.failedAt === null;
}

function providerStatusForPaymentStatus(status: TerminalPaymentStatus) {
  switch (status) {
    case "PAID":
      return "paid";
    case "FAILED":
      return "failed";
    case "CANCELED":
      return "canceled";
  }
}

async function readStdinJson() {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawInput = Buffer.concat(chunks).toString("utf8").trim();

  if (!rawInput) {
    return {};
  }

  try {
    return JSON.parse(rawInput) as unknown;
  } catch {
    throw new Error("Malformed M004 helper JSON input.");
  }
}

function parseCommandInput<TInput>(
  input: unknown,
  schema: z.ZodType<TInput>,
  command: string,
) {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    throw new Error(`Malformed M004 helper input for ${command}.`);
  }

  return parsed.data;
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

function normalizeScenario(value: string | undefined) {
  return value ?? "m004-payment";
}

function readRequiredString(value: unknown) {
  if (!isNonEmptyString(value)) {
    throw new Error("M004 helper read failed: required field missing.");
  }

  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isAbsoluteHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);

    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

type HelperContext = {
  command: string;
  scenario?: string;
  publicCode: string;
  method?: string;
  status?: string;
};

function failSafe(context: HelperContext, reason: string): never {
  const scenario = normalizeScenario(context.scenario);
  const method = context.method ?? "n/a";
  const status = context.status ?? "n/a";

  throw new Error(
    `M004 E2E helper ${context.command} failed: ${reason}; scenario=${scenario}; publicCode=${context.publicCode}; method=${method}; status=${status}.`,
  );
}

function findForbiddenPublicDtoKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findForbiddenPublicDtoKey(item);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (
      PUBLIC_DTO_FORBIDDEN_KEYS.includes(
        key as (typeof PUBLIC_DTO_FORBIDDEN_KEYS)[number],
      )
    ) {
      return key;
    }

    const nested = findForbiddenPublicDtoKey(nestedValue);

    if (nested) {
      return nested;
    }
  }

  return null;
}

main().catch((error: unknown) => {
  process.stderr.write(`${formatM004FixtureSafeError(error)}\n`);
  process.exit(1);
});
