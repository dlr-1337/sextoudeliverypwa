import "dotenv/config";

import { randomUUID } from "node:crypto";

import {
  CategoryType,
  EstablishmentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/client";
import {
  createAuthServiceCore,
  type AuthServiceClient,
} from "../src/modules/auth/service-core";
import {
  createEstablishmentServiceCore,
  type EstablishmentServiceClient,
} from "../src/modules/establishments/service-core";
import {
  generatePublicOrderCode,
} from "../src/modules/orders/service";
import {
  createOrderServiceCore,
  type OrderServiceClient,
} from "../src/modules/orders/service-core";
import type { CheckoutOrderPayload } from "../src/modules/orders/schemas";
import {
  getFakeDevPaymentConfig,
  type FakeDevPaymentConfig,
} from "../src/modules/payments/config";
import { getPaymentGatewayProvider } from "../src/modules/payments/service";
import { PAYMENT_GATEWAY_PROVIDER_FAKE_DEV } from "../src/modules/payments/types";
import {
  createFakeDevPaymentWebhookSignature,
  FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_HEADER,
  FAKE_DEV_PAYMENT_WEBHOOK_TIMESTAMP_HEADER,
  type FakeDevPaymentWebhookEventStatus,
} from "../src/modules/payments/webhook";
import {
  getPublicOrderTrackingPath,
  handleFakeDevPaymentWebhookRoute,
  type PaymentWebhookRouteCode,
  type PaymentWebhookRouteResult,
  type PaymentWebhookRouteService,
} from "../src/modules/payments/webhook-route-core";
import {
  createPaymentWebhookServiceCore,
  type PaymentWebhookServiceClient,
} from "../src/modules/payments/webhook-service-core";
import {
  createProductServiceCore,
  type ProductServiceClient,
} from "../src/modules/products/service-core";
import {
  createPrismaClient,
  formatSafeError,
  SeedStateError,
} from "../prisma/seed";

const SMOKE_AUTH_CONFIG = {
  authSecret: "m004-payment-webhooks-smoke-session-secret-0123456789",
  sessionCookieName: "m004_payment_webhooks_smoke_session",
  sessionMaxAgeDays: 1,
  sessionMaxAgeSeconds: 24 * 60 * 60,
  secureCookies: false,
};

const CHECKOUT_APP_BASE_URL = "https://app.example.test";
const SMOKE_BASE_NOW = Date.UTC(2026, 3, 28, 16, 30, 0, 0);
const SAFE_UNKNOWN_PROVIDER_PAYMENT_ID = "fake_dev_unknown_m004_safe_missing";

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

const GENERIC_FORBIDDEN_OUTPUT_FRAGMENTS = [
  "DATABASE_URL",
  "FAKE_PAYMENT_WEBHOOK_SECRET",
  "PrismaClientKnownRequestError",
  "P2002",
  "raw SQL",
  "stack",
  "sha256=",
  "providerPayload",
  "cardNumber",
  "4111111111111111",
  "cardBrand",
  "cardLast4",
  "cvv",
  "expiry",
  "tok_secret_should_not_leak",
  "provider-payload-secret-do-not-print",
] as const;

const WEBHOOK_SCENARIOS = [
  {
    label: "pix-approved",
    method: "PIX",
    eventStatus: "approved",
    expectedPaymentStatus: PaymentStatus.PAID,
    expectedProviderStatus: "paid",
    paidAt: "event",
    failedAt: null,
  },
  {
    label: "pix-failed",
    method: "PIX",
    eventStatus: "failed",
    expectedPaymentStatus: PaymentStatus.FAILED,
    expectedProviderStatus: "failed",
    paidAt: null,
    failedAt: "event",
  },
  {
    label: "pix-canceled",
    method: "PIX",
    eventStatus: "canceled",
    expectedPaymentStatus: PaymentStatus.CANCELED,
    expectedProviderStatus: "canceled",
    paidAt: null,
    failedAt: null,
  },
  {
    label: "card-approved",
    method: "CARD",
    eventStatus: "approved",
    expectedPaymentStatus: PaymentStatus.PAID,
    expectedProviderStatus: "paid",
    paidAt: "event",
    failedAt: null,
  },
  {
    label: "card-failed",
    method: "CARD",
    eventStatus: "failed",
    expectedPaymentStatus: PaymentStatus.FAILED,
    expectedProviderStatus: "failed",
    paidAt: null,
    failedAt: "event",
  },
  {
    label: "card-canceled",
    method: "CARD",
    eventStatus: "canceled",
    expectedPaymentStatus: PaymentStatus.CANCELED,
    expectedProviderStatus: "canceled",
    paidAt: null,
    failedAt: null,
  },
] as const;

type PrismaSmokeClient = ReturnType<typeof createPrismaClient>;
type AuthSmokeService = ReturnType<typeof createAuthServiceCore>;
type OrderSmokeService = ReturnType<typeof createOrderServiceCore>;
type OnlinePaymentMethod = "PIX" | "CARD";
type SmokePaymentMethod = "CASH" | OnlinePaymentMethod;
type PaymentOrderSnapshot = Awaited<ReturnType<typeof readPaymentOrderSnapshot>>;
type OnlinePaymentOrderSnapshot = PaymentOrderSnapshot & {
  payment: NonNullable<PaymentOrderSnapshot["payment"]> & {
    providerPaymentId: string;
  };
};
type WebhookScenario = (typeof WEBHOOK_SCENARIOS)[number];

type RouteCallResult = {
  result: PaymentWebhookRouteResult;
  revalidatedPaths: string[];
};

type RouteCaller = (input: {
  label: string;
  rawBody: string;
  now: Date;
  signature?: string;
  sensitiveFragments?: readonly string[];
}) => Promise<RouteCallResult>;

async function verifyM004PaymentWebhooks() {
  const prisma = createPrismaClient();
  const paymentConfig = getFakeDevPaymentConfig();
  const provider = getPaymentGatewayProvider();

  if (provider.provider !== PAYMENT_GATEWAY_PROVIDER_FAKE_DEV) {
    throw new SeedStateError(
      "M004 payment webhook smoke failed: fake/dev provider preflight returned unsupported provider.",
    );
  }

  const auth = createAuthServiceCore({
    db: prisma as unknown as AuthServiceClient,
    config: SMOKE_AUTH_CONFIG,
    enums: {
      userRole: UserRole,
      userStatus: UserStatus,
      establishmentStatus: EstablishmentStatus,
    },
  });
  const establishmentService = createEstablishmentServiceCore({
    db: prisma as unknown as EstablishmentServiceClient,
    enums: { establishmentStatus: EstablishmentStatus },
  });
  const productService = createProductServiceCore({
    db: prisma as unknown as ProductServiceClient,
    enums: {
      categoryType: CategoryType,
      establishmentStatus: EstablishmentStatus,
      productStatus: ProductStatus,
    },
  });
  const orderService = createOrderServiceCore({
    db: prisma as unknown as OrderServiceClient,
    enums: {
      establishmentStatus: EstablishmentStatus,
      productStatus: ProductStatus,
      orderStatus: OrderStatus,
      paymentMethod: PaymentMethod,
      paymentStatus: PaymentStatus,
    },
    generatePublicCode: generatePublicOrderCode,
    getPaymentGatewayProvider: () => getPaymentGatewayProvider(),
    getAppBaseUrl: () => CHECKOUT_APP_BASE_URL,
  });
  let verifierNow = new Date(SMOKE_BASE_NOW);
  const paymentWebhookService = createPaymentWebhookServiceCore({
    db: prisma as unknown as PaymentWebhookServiceClient,
    now: () => verifierNow,
  });
  const revalidatedPaths: string[] = [];
  const routeResults: PaymentWebhookRouteResult[] = [];
  const publicCodes = new Set<string>();
  const issuedSessionTokens: string[] = [];

  const callWebhook: RouteCaller = async ({
    label,
    rawBody,
    now,
    signature,
    sensitiveFragments = [],
  }) => {
    verifierNow = now;
    const timestamp = now.getTime().toString();
    const headers = buildWebhookHeaders({
      rawBody,
      timestamp,
      signature:
        signature ??
        createFakeDevPaymentWebhookSignature({
          rawBody,
          timestamp,
          secret: paymentConfig.webhookSecret,
        }),
    });
    const beforeRevalidationCount = revalidatedPaths.length;
    const result = await handleFakeDevPaymentWebhookRoute({
      rawBody,
      headers,
      getConfig: () => paymentConfig,
      service: paymentWebhookService as PaymentWebhookRouteService,
      now: () => now,
      revalidatePath: (path) => {
        revalidatedPaths.push(path);
      },
    });
    const pathsForCall = revalidatedPaths.slice(beforeRevalidationCount);

    assertRouteResultRedacted(label, result, paymentConfig, sensitiveFragments);
    routeResults.push(result);

    return { result, revalidatedPaths: pathsForCall };
  };

  try {
    const runEntropy = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
    const runId = `${Date.now().toString(36)}-${runEntropy.toLowerCase()}`;
    const smokePassword = `Sextou-${runId}-Senha!42`;
    const customer = await auth.registerCustomer({
      name: "Smoke Cliente M004",
      email: `m004-customer-${runId}@example.invalid`,
      password: smokePassword,
      phone: "11999999999",
    });

    if (!customer.ok) {
      throw new SeedStateError(
        `M004 payment webhook smoke failed: customer registration returned ${formatResultCode(customer)}.`,
      );
    }

    issuedSessionTokens.push(customer.data.sessionToken);

    const merchant = await auth.registerMerchant({
      name: "Smoke Comerciante M004",
      email: `m004-merchant-${runId}@example.invalid`,
      password: smokePassword,
      establishmentName: `M004 Smoke Loja ${runId}`,
      establishmentPhone: "1133334444",
    });

    if (!merchant.ok) {
      throw new SeedStateError(
        `M004 payment webhook smoke failed: merchant registration returned ${formatResultCode(merchant)}.`,
      );
    }

    issuedSessionTokens.push(merchant.data.sessionToken);

    await assertApprovedEstablishment(
      establishmentService,
      merchant.data.establishment.id,
    );

    const product = await productService.createForOwner(merchant.data.user.id, {
      name: `Produto Smoke M004 ${runId}`,
      description: "Produto ativo criado pelo smoke M004.",
      price: "31.90",
    });

    if (!product.ok || product.data.status !== ProductStatus.ACTIVE) {
      throw new SeedStateError(
        `M004 payment webhook smoke failed: product creation returned ${product.ok ? product.data.status : formatResultCode(product)}.`,
      );
    }

    await assertCheckoutProviderConfigFailure({
      prisma,
      customerId: customer.data.user.id,
      establishmentId: merchant.data.establishment.id,
      productId: product.data.id,
      publicCode: buildSafePublicCode(runEntropy, "CFG"),
    });

    const cashUntouched = await createCheckoutFixtureOrder({
      orderService,
      prisma,
      publicCodes,
      customerId: customer.data.user.id,
      establishmentId: merchant.data.establishment.id,
      productId: product.data.id,
      method: "CASH",
      label: "cash-untouched",
    });

    assertCashManualSnapshot("cash-untouched", cashUntouched, {
      expectProviderPaymentId: false,
    });

    const onlineSnapshots: Partial<Record<WebhookScenario["label"], OnlinePaymentOrderSnapshot>> = {};

    for (const [index, scenario] of WEBHOOK_SCENARIOS.entries()) {
      const initial = await createCheckoutFixtureOrder({
        orderService,
        prisma,
        publicCodes,
        customerId: customer.data.user.id,
        establishmentId: merchant.data.establishment.id,
        productId: product.data.id,
        method: scenario.method,
        label: scenario.label,
      });
      const onlineInitial = assertOnlineInitialSnapshot(scenario.label, initial, scenario.method);
      const eventClock = buildEventClock(index);
      const occurredAt = new Date(eventClock.getTime() - 1_000);
      const rawBody = buildWebhookRawBody({
        eventId: `evt_m004_${scenario.label.replace(/-/g, "_")}_${runEntropy}`,
        providerPaymentId: onlineInitial.payment.providerPaymentId,
        status: scenario.eventStatus,
        occurredAt,
      });
      const route = await callWebhook({
        label: scenario.label,
        rawBody,
        now: eventClock,
        sensitiveFragments: [onlineInitial.payment.providerPaymentId],
      });

      assertRouteSuccess({
        label: scenario.label,
        route,
        code: "PAYMENT_WEBHOOK_APPLIED",
        changed: true,
        paymentStatus: scenario.expectedPaymentStatus,
        publicCode: onlineInitial.publicCode,
        revalidated: true,
      });

      const after = await readPaymentOrderSnapshot(prisma, onlineInitial.publicCode);
      assertAppliedSnapshot({
        label: scenario.label,
        scenario,
        before: onlineInitial,
        after,
        routeNow: eventClock,
        occurredAt,
      });
      await assertPublicOrderTracking({
        orderService,
        label: scenario.label,
        snapshot: after,
        method: scenario.method,
        expectedPaymentStatus: scenario.expectedPaymentStatus,
      });
      onlineSnapshots[scenario.label] = after as OnlinePaymentOrderSnapshot;
    }

    const approvedSnapshot = onlineSnapshots["pix-approved"];

    if (!approvedSnapshot) {
      throw new SeedStateError(
        "M004 payment webhook smoke failed: pix-approved snapshot missing before duplicate checks.",
      );
    }

    const duplicateClock = buildEventClock(20);
    const duplicateOccurredAt = new Date(duplicateClock.getTime() - 1_000);
    const duplicateRawBody = buildWebhookRawBody({
      eventId: `evt_m004_pix_approved_duplicate_${runEntropy}`,
      providerPaymentId: approvedSnapshot.payment.providerPaymentId,
      status: "approved",
      occurredAt: duplicateOccurredAt,
    });
    const duplicate = await callWebhook({
      label: "duplicate-approved",
      rawBody: duplicateRawBody,
      now: duplicateClock,
      sensitiveFragments: [approvedSnapshot.payment.providerPaymentId],
    });

    assertRouteSuccess({
      label: "duplicate-approved",
      route: duplicate,
      code: "PAYMENT_WEBHOOK_IDEMPOTENT_DUPLICATE",
      changed: false,
      paymentStatus: PaymentStatus.PAID,
      publicCode: approvedSnapshot.publicCode,
      revalidated: false,
    });
    assertSnapshotUnchanged(
      "duplicate-approved",
      approvedSnapshot,
      await readPaymentOrderSnapshot(prisma, approvedSnapshot.publicCode),
    );

    const conflictClock = buildEventClock(21);
    const conflictRawBody = buildWebhookRawBody({
      eventId: `evt_m004_pix_approved_conflict_${runEntropy}`,
      providerPaymentId: approvedSnapshot.payment.providerPaymentId,
      status: "failed",
      occurredAt: new Date(conflictClock.getTime() - 1_000),
    });
    const conflict = await callWebhook({
      label: "terminal-conflict",
      rawBody: conflictRawBody,
      now: conflictClock,
      sensitiveFragments: [approvedSnapshot.payment.providerPaymentId],
    });

    assertRouteFailure({
      label: "terminal-conflict",
      route: conflict,
      status: 409,
      code: "PAYMENT_WEBHOOK_TERMINAL_CONFLICT",
    });
    assertSnapshotUnchanged(
      "terminal-conflict",
      approvedSnapshot,
      await readPaymentOrderSnapshot(prisma, approvedSnapshot.publicCode),
    );

    const safety = await createCheckoutFixtureOrder({
      orderService,
      prisma,
      publicCodes,
      customerId: customer.data.user.id,
      establishmentId: merchant.data.establishment.id,
      productId: product.data.id,
      method: "PIX",
      label: "safety-pending",
    });
    const safetyOnline = assertOnlineInitialSnapshot("safety-pending", safety, "PIX");

    await assertInvalidSignatureScenario({
      prisma,
      callWebhook,
      snapshot: safetyOnline,
      runEntropy,
    });
    await assertMalformedJsonScenario({ prisma, callWebhook, snapshot: safetyOnline });
    await assertUnknownFieldScenario({
      prisma,
      callWebhook,
      snapshot: safetyOnline,
      runEntropy,
    });
    await assertUnknownProviderScenario({ prisma, callWebhook, snapshot: safetyOnline });

    const cashUnsupported = await createCheckoutFixtureOrder({
      orderService,
      prisma,
      publicCodes,
      customerId: customer.data.user.id,
      establishmentId: merchant.data.establishment.id,
      productId: product.data.id,
      method: "CASH",
      label: "cash-unsupported-row",
    });
    const unsupportedProviderPaymentId = `fake_dev_cash_${runEntropy.toLowerCase()}`;

    await prisma.payment.update({
      where: { orderId: cashUnsupported.id },
      data: { providerPaymentId: unsupportedProviderPaymentId },
      select: { id: true },
    });

    const cashUnsupportedReady = await readPaymentOrderSnapshot(
      prisma,
      cashUnsupported.publicCode,
    );

    assertCashManualSnapshot("cash-unsupported-row", cashUnsupportedReady, {
      expectProviderPaymentId: true,
    });
    await assertUnsupportedCashScenario({
      prisma,
      callWebhook,
      snapshot: cashUnsupportedReady,
      providerPaymentId: unsupportedProviderPaymentId,
      runEntropy,
    });

    assertSnapshotUnchanged(
      "cash-untouched-final",
      cashUntouched,
      await readPaymentOrderSnapshot(prisma, cashUntouched.publicCode),
    );
    await assertPublicOrderTracking({
      orderService,
      label: "cash-untouched-final",
      snapshot: cashUntouched,
      method: "CASH",
      expectedPaymentStatus: PaymentStatus.MANUAL_CASH_ON_DELIVERY,
    });

    console.info(
      `M004 payment webhook smoke ok: onlineScenarios=${WEBHOOK_SCENARIOS.length}; methods=PIX,CARD; statuses=approved,failed,canceled; publicCodes=${publicCodes.size}; routeResults=${routeResults.length}; routeRedactionSafe=true; publicDtoRedactionSafe=true; duplicateIdempotent=true; terminalConflictSafe=true; cashManual=true; unsupportedCashSafe=true.`,
    );
  } finally {
    await revokeIssuedSessions(auth, issuedSessionTokens);
    await prisma.$disconnect();
  }
}

async function assertApprovedEstablishment(
  establishmentService: ReturnType<typeof createEstablishmentServiceCore>,
  establishmentId: string,
) {
  const approved = await establishmentService.approve({ id: establishmentId });

  if (!approved.ok || approved.data.status !== EstablishmentStatus.ACTIVE) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: establishment approval returned ${approved.ok ? approved.data.status : formatResultCode(approved)}.`,
    );
  }
}

async function assertCheckoutProviderConfigFailure({
  prisma,
  customerId,
  establishmentId,
  productId,
  publicCode,
}: {
  prisma: PrismaSmokeClient;
  customerId: string;
  establishmentId: string;
  productId: string;
  publicCode: string;
}) {
  const configFailureService = createOrderServiceCore({
    db: prisma as unknown as OrderServiceClient,
    enums: {
      establishmentStatus: EstablishmentStatus,
      productStatus: ProductStatus,
      orderStatus: OrderStatus,
      paymentMethod: PaymentMethod,
      paymentStatus: PaymentStatus,
    },
    generatePublicCode: () => publicCode,
    getPaymentGatewayProvider: () => {
      throw new Error("fake/dev payment provider intentionally unavailable");
    },
    getAppBaseUrl: () => CHECKOUT_APP_BASE_URL,
  });
  const result = await configFailureService.createCheckoutOrder(
    customerId,
    checkoutPayload({ establishmentId, productId, method: "PIX", label: "config" }),
  );

  const returnedCode = formatResultCode(result);

  if (result.ok || returnedCode !== "PAYMENT_PROVIDER_CONFIG_INVALID") {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: checkout provider config failure returned ${result.ok ? "ok" : returnedCode}; publicCode=${publicCode}.`,
    );
  }

  assertNoForbiddenFragments("checkout-provider-config", result, [
    ...GENERIC_FORBIDDEN_OUTPUT_FRAGMENTS,
    "fake/dev payment provider intentionally unavailable",
  ]);

  const persisted = await prisma.order.findUnique({
    where: { publicCode },
    select: { id: true },
  });

  if (persisted) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: checkout provider config failure persisted an order; publicCode=${publicCode}.`,
    );
  }
}

async function createCheckoutFixtureOrder({
  orderService,
  prisma,
  publicCodes,
  customerId,
  establishmentId,
  productId,
  method,
  label,
}: {
  orderService: OrderSmokeService;
  prisma: PrismaSmokeClient;
  publicCodes: Set<string>;
  customerId: string;
  establishmentId: string;
  productId: string;
  method: SmokePaymentMethod;
  label: string;
}) {
  const result = await orderService.createCheckoutOrder(
    customerId,
    checkoutPayload({ establishmentId, productId, method, label }),
  );

  if (!result.ok) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: ${label} checkout returned ${formatResultCode(result)}.`,
    );
  }

  publicCodes.add(result.data.publicCode);

  return readPaymentOrderSnapshot(prisma, result.data.publicCode);
}

async function readPaymentOrderSnapshot(prisma: PrismaSmokeClient, publicCode: string) {
  const order = await prisma.order.findUnique({
    where: { publicCode },
    select: {
      id: true,
      publicCode: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      updatedAt: true,
      payment: {
        select: {
          id: true,
          method: true,
          status: true,
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
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!order) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: order snapshot missing for publicCode=${publicCode}.`,
    );
  }

  return order;
}

function assertOnlineInitialSnapshot(
  label: string,
  snapshot: PaymentOrderSnapshot,
  method: OnlinePaymentMethod,
): OnlinePaymentOrderSnapshot {
  const payment = snapshot.payment;

  if (
    snapshot.status !== OrderStatus.PENDING ||
    snapshot.paymentMethod !== method ||
    snapshot.paymentStatus !== PaymentStatus.PENDING ||
    !payment ||
    payment.method !== method ||
    payment.status !== PaymentStatus.PENDING ||
    payment.provider !== PAYMENT_GATEWAY_PROVIDER_FAKE_DEV ||
    typeof payment.providerPaymentId !== "string" ||
    payment.providerPaymentId.length === 0 ||
    payment.providerStatus !== "pending" ||
    payment.providerPayload !== null ||
    payment.cardBrand !== null ||
    payment.cardLast4 !== null ||
    payment.paidAt !== null ||
    payment.failedAt !== null
  ) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: ${label} initial online payment mismatch; publicCode=${snapshot.publicCode}; method=${snapshot.paymentMethod}; orderPayment=${snapshot.paymentStatus}; payment=${payment?.status ?? "missing"}.`,
    );
  }

  if (method === "PIX") {
    if (
      payment.checkoutUrl !== null ||
      !isNonEmptyString(payment.pixQrCode) ||
      !isNonEmptyString(payment.pixCopyPaste) ||
      !isValidDate(payment.pixExpiresAt)
    ) {
      throw new SeedStateError(
        `M004 payment webhook smoke failed: ${label} initial PIX instructions mismatch; publicCode=${snapshot.publicCode}; payment=${payment.status}.`,
      );
    }
  } else if (
    !isAbsoluteHttpUrl(payment.checkoutUrl) ||
    payment.pixQrCode !== null ||
    payment.pixCopyPaste !== null ||
    payment.pixExpiresAt !== null
  ) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: ${label} initial CARD instructions mismatch; publicCode=${snapshot.publicCode}; payment=${payment.status}.`,
    );
  }

  return snapshot as OnlinePaymentOrderSnapshot;
}

function assertCashManualSnapshot(
  label: string,
  snapshot: PaymentOrderSnapshot,
  options: { expectProviderPaymentId: boolean },
) {
  const payment = snapshot.payment;
  const providerPaymentIdMatches = options.expectProviderPaymentId
    ? isNonEmptyString(payment?.providerPaymentId)
    : payment?.providerPaymentId === null;

  if (
    snapshot.status !== OrderStatus.PENDING ||
    snapshot.paymentMethod !== PaymentMethod.CASH ||
    snapshot.paymentStatus !== PaymentStatus.MANUAL_CASH_ON_DELIVERY ||
    !payment ||
    payment.method !== PaymentMethod.CASH ||
    payment.status !== PaymentStatus.MANUAL_CASH_ON_DELIVERY ||
    payment.provider !== null ||
    !providerPaymentIdMatches ||
    payment.providerStatus !== null ||
    payment.providerPayload !== null ||
    payment.checkoutUrl !== null ||
    payment.pixQrCode !== null ||
    payment.pixCopyPaste !== null ||
    payment.pixExpiresAt !== null ||
    payment.cardBrand !== null ||
    payment.cardLast4 !== null ||
    payment.paidAt !== null ||
    payment.failedAt !== null
  ) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: ${label} CASH manual mismatch; publicCode=${snapshot.publicCode}; orderPayment=${snapshot.paymentStatus}; payment=${payment?.status ?? "missing"}.`,
    );
  }
}

function assertAppliedSnapshot({
  label,
  scenario,
  before,
  after,
  routeNow,
  occurredAt,
}: {
  label: string;
  scenario: WebhookScenario;
  before: OnlinePaymentOrderSnapshot;
  after: PaymentOrderSnapshot;
  routeNow: Date;
  occurredAt: Date;
}) {
  const payment = after.payment;

  if (!payment) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: ${label} payment disappeared; publicCode=${after.publicCode}.`,
    );
  }

  if (
    after.id !== before.id ||
    after.status !== OrderStatus.PENDING ||
    after.paymentMethod !== scenario.method ||
    after.paymentStatus !== scenario.expectedPaymentStatus ||
    payment.id !== before.payment.id ||
    payment.method !== scenario.method ||
    payment.provider !== PAYMENT_GATEWAY_PROVIDER_FAKE_DEV ||
    payment.providerPaymentId !== before.payment.providerPaymentId ||
    payment.providerPayload !== null ||
    payment.status !== scenario.expectedPaymentStatus ||
    payment.providerStatus !== scenario.expectedProviderStatus ||
    !sameDate(after.updatedAt, routeNow) ||
    !sameDate(payment.updatedAt, routeNow) ||
    !expectedDateMatches(payment.paidAt, scenario.paidAt, occurredAt) ||
    !expectedDateMatches(payment.failedAt, scenario.failedAt, occurredAt)
  ) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: ${label} persisted transition mismatch; publicCode=${after.publicCode}; orderPayment=${after.paymentStatus}; payment=${payment.status}.`,
    );
  }
}

async function assertPublicOrderTracking({
  orderService,
  label,
  snapshot,
  method,
  expectedPaymentStatus,
}: {
  orderService: OrderSmokeService;
  label: string;
  snapshot: PaymentOrderSnapshot;
  method: SmokePaymentMethod;
  expectedPaymentStatus: PaymentStatus;
}) {
  const publicOrder = await orderService.getPublicOrderByCode(snapshot.publicCode);

  if (!publicOrder) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: public tracking DTO missing for ${label}; publicCode=${snapshot.publicCode}; payment=${snapshot.paymentStatus}.`,
    );
  }

  assertPublicDtoRedacted(label, publicOrder);

  if (
    publicOrder.publicCode !== snapshot.publicCode ||
    publicOrder.status !== snapshot.status ||
    publicOrder.paymentMethod !== method ||
    publicOrder.paymentStatus !== expectedPaymentStatus ||
    publicOrder.payment?.method !== method ||
    publicOrder.payment.status !== expectedPaymentStatus
  ) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: public tracking status mismatch for ${label}; publicCode=${snapshot.publicCode}; dtoPayment=${publicOrder.paymentStatus}; dbPayment=${snapshot.paymentStatus}.`,
    );
  }

  if (method === "PIX") {
    const instructions = publicOrder.payment.instructions;

    if (
      !instructions ||
      instructions.method !== "PIX" ||
      !isNonEmptyString(instructions.qrCode) ||
      !isNonEmptyString(instructions.copyPaste) ||
      !isValidDate(instructions.expiresAt)
    ) {
      throw new SeedStateError(
        `M004 payment webhook smoke failed: public PIX instructions mismatch for ${label}; publicCode=${snapshot.publicCode}; payment=${publicOrder.paymentStatus}.`,
      );
    }
  } else if (method === "CARD") {
    const instructions = publicOrder.payment.instructions;

    if (
      !instructions ||
      instructions.method !== "CARD" ||
      !isAbsoluteHttpUrl(instructions.checkoutUrl)
    ) {
      throw new SeedStateError(
        `M004 payment webhook smoke failed: public CARD instructions mismatch for ${label}; publicCode=${snapshot.publicCode}; payment=${publicOrder.paymentStatus}.`,
      );
    }
  } else if (publicOrder.payment.instructions !== null) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: public CASH instructions mismatch for ${label}; publicCode=${snapshot.publicCode}; payment=${publicOrder.paymentStatus}.`,
    );
  }
}

async function assertInvalidSignatureScenario({
  prisma,
  callWebhook,
  snapshot,
  runEntropy,
}: {
  prisma: PrismaSmokeClient;
  callWebhook: RouteCaller;
  snapshot: OnlinePaymentOrderSnapshot;
  runEntropy: string;
}) {
  const rawBody = buildWebhookRawBody({
    eventId: `evt_m004_invalid_signature_${runEntropy}`,
    providerPaymentId: snapshot.payment.providerPaymentId,
    status: "approved",
    occurredAt: new Date(buildEventClock(30).getTime() - 1_000),
  });
  const route = await callWebhook({
    label: "invalid-signature",
    rawBody,
    now: buildEventClock(30),
    signature: `sha256=${"0".repeat(64)}`,
    sensitiveFragments: [snapshot.payment.providerPaymentId],
  });

  assertRouteFailure({
    label: "invalid-signature",
    route,
    status: 401,
    code: "PAYMENT_WEBHOOK_INVALID_SIGNATURE",
  });
  assertSnapshotUnchanged(
    "invalid-signature",
    snapshot,
    await readPaymentOrderSnapshot(prisma, snapshot.publicCode),
  );
}

async function assertMalformedJsonScenario({
  prisma,
  callWebhook,
  snapshot,
}: {
  prisma: PrismaSmokeClient;
  callWebhook: RouteCaller;
  snapshot: OnlinePaymentOrderSnapshot;
}) {
  const rawBody = "{not-json";
  const route = await callWebhook({
    label: "malformed-json",
    rawBody,
    now: buildEventClock(31),
    sensitiveFragments: [rawBody],
  });

  assertRouteFailure({
    label: "malformed-json",
    route,
    status: 400,
    code: "PAYMENT_WEBHOOK_MALFORMED_JSON",
  });
  assertSnapshotUnchanged(
    "malformed-json",
    snapshot,
    await readPaymentOrderSnapshot(prisma, snapshot.publicCode),
  );
}

async function assertUnknownFieldScenario({
  prisma,
  callWebhook,
  snapshot,
  runEntropy,
}: {
  prisma: PrismaSmokeClient;
  callWebhook: RouteCaller;
  snapshot: OnlinePaymentOrderSnapshot;
  runEntropy: string;
}) {
  const rawBody = buildWebhookRawBody(
    {
      eventId: `evt_m004_unknown_field_${runEntropy}`,
      providerPaymentId: snapshot.payment.providerPaymentId,
      status: "approved",
      occurredAt: new Date(buildEventClock(32).getTime() - 1_000),
    },
    {
      providerPayload: { token: "provider-payload-secret-do-not-print" },
      cardNumber: "4111111111111111",
      cvv: "123",
      expiry: "12/30",
      token: "tok_secret_should_not_leak",
    },
  );
  const route = await callWebhook({
    label: "unknown-field-payload",
    rawBody,
    now: buildEventClock(32),
    sensitiveFragments: [
      snapshot.payment.providerPaymentId,
      "provider-payload-secret-do-not-print",
      "4111111111111111",
      "tok_secret_should_not_leak",
    ],
  });

  assertRouteFailure({
    label: "unknown-field-payload",
    route,
    status: 400,
    code: "PAYMENT_WEBHOOK_UNKNOWN_FIELD",
  });
  assertSnapshotUnchanged(
    "unknown-field-payload",
    snapshot,
    await readPaymentOrderSnapshot(prisma, snapshot.publicCode),
  );
}

async function assertUnknownProviderScenario({
  prisma,
  callWebhook,
  snapshot,
}: {
  prisma: PrismaSmokeClient;
  callWebhook: RouteCaller;
  snapshot: OnlinePaymentOrderSnapshot;
}) {
  const rawBody = buildWebhookRawBody({
    eventId: "evt_m004_unknown_provider_safe",
    providerPaymentId: SAFE_UNKNOWN_PROVIDER_PAYMENT_ID,
    status: "approved",
    occurredAt: new Date(buildEventClock(33).getTime() - 1_000),
  });
  const route = await callWebhook({
    label: "unknown-provider-payment",
    rawBody,
    now: buildEventClock(33),
    sensitiveFragments: [SAFE_UNKNOWN_PROVIDER_PAYMENT_ID],
  });

  assertRouteFailure({
    label: "unknown-provider-payment",
    route,
    status: 404,
    code: "PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND",
  });
  assertSnapshotUnchanged(
    "unknown-provider-payment",
    snapshot,
    await readPaymentOrderSnapshot(prisma, snapshot.publicCode),
  );
}

async function assertUnsupportedCashScenario({
  prisma,
  callWebhook,
  snapshot,
  providerPaymentId,
  runEntropy,
}: {
  prisma: PrismaSmokeClient;
  callWebhook: RouteCaller;
  snapshot: PaymentOrderSnapshot;
  providerPaymentId: string;
  runEntropy: string;
}) {
  const rawBody = buildWebhookRawBody({
    eventId: `evt_m004_cash_unsupported_${runEntropy}`,
    providerPaymentId,
    status: "approved",
    occurredAt: new Date(buildEventClock(34).getTime() - 1_000),
  });
  const route = await callWebhook({
    label: "unsupported-cash-row",
    rawBody,
    now: buildEventClock(34),
    sensitiveFragments: [providerPaymentId],
  });

  assertRouteFailure({
    label: "unsupported-cash-row",
    route,
    status: 404,
    code: "PAYMENT_WEBHOOK_PAYMENT_UNSUPPORTED",
  });
  const after = await readPaymentOrderSnapshot(prisma, snapshot.publicCode);

  assertSnapshotUnchanged("unsupported-cash-row", snapshot, after);
  assertCashManualSnapshot("unsupported-cash-row", after, {
    expectProviderPaymentId: true,
  });
}

function assertRouteSuccess({
  label,
  route,
  code,
  changed,
  paymentStatus,
  publicCode,
  revalidated,
}: {
  label: string;
  route: RouteCallResult;
  code: PaymentWebhookRouteCode;
  changed: boolean;
  paymentStatus: PaymentStatus;
  publicCode: string;
  revalidated: boolean;
}) {
  const body = route.result.body;

  if (
    route.result.status !== 200 ||
    !body.ok ||
    body.code !== code ||
    body.data.changed !== changed ||
    body.data.paymentStatus !== paymentStatus ||
    body.data.publicCode !== publicCode ||
    body.data.revalidated !== revalidated
  ) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: ${label} route success mismatch; publicCode=${publicCode}; http=${route.result.status}; code=${body.code}.`,
    );
  }

  const expectedPaths = revalidated ? [getPublicOrderTrackingPath(publicCode)] : [];

  if (!sameStringArray(route.revalidatedPaths, expectedPaths)) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: ${label} revalidation mismatch; publicCode=${publicCode}; changed=${changed}; revalidated=${revalidated}.`,
    );
  }
}

function assertRouteFailure({
  label,
  route,
  status,
  code,
}: {
  label: string;
  route: RouteCallResult;
  status: number;
  code: PaymentWebhookRouteCode;
}) {
  const body = route.result.body;

  if (route.result.status !== status || body.ok || body.code !== code) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: ${label} route failure mismatch; http=${route.result.status}; code=${body.code}.`,
    );
  }

  if ("data" in body || route.revalidatedPaths.length > 0) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: ${label} failure returned mutable data or revalidated unexpectedly; http=${route.result.status}; code=${body.code}.`,
    );
  }
}

function assertRouteResultRedacted(
  label: string,
  result: PaymentWebhookRouteResult,
  config: FakeDevPaymentConfig,
  sensitiveFragments: readonly string[],
) {
  assertNoForbiddenFragments(label, result, [
    ...GENERIC_FORBIDDEN_OUTPUT_FRAGMENTS,
    config.webhookSecret,
    ...sensitiveFragments,
  ]);
}

function assertPublicDtoRedacted(label: string, value: unknown) {
  const leakedKey = findForbiddenPublicDtoKey(value);

  if (leakedKey) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: public DTO redaction mismatch for ${label}; leakedCategory=${leakedKey}.`,
    );
  }

  assertNoForbiddenFragments(`public-dto-${label}`, value, [
    "DATABASE_URL",
    "FAKE_PAYMENT_WEBHOOK_SECRET",
    "passwordHash",
    "sessionToken",
    "tokenHash",
    "providerPayload",
    "providerStatus",
    "cardBrand",
    "cardLast4",
    "cardNumber",
    "4111111111111111",
    "cvv",
    "expiry",
    "PrismaClientKnownRequestError",
    "raw SQL",
    "stack",
  ]);
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

function formatResultCode(result: unknown) {
  if (isRecord(result) && typeof result.code === "string") {
    return result.code;
  }

  return "ok";
}

function assertNoForbiddenFragments(
  label: string,
  value: unknown,
  forbiddenFragments: readonly string[],
) {
  const serialized = JSON.stringify(value);

  for (const fragment of forbiddenFragments) {
    if (fragment.length > 0 && serialized.includes(fragment)) {
      throw new SeedStateError(
        `M004 payment webhook smoke failed: ${label} redaction mismatch; leakedCategory=${categorizeForbiddenFragment(fragment)}.`,
      );
    }
  }
}

function categorizeForbiddenFragment(fragment: string) {
  if (fragment.includes("DATABASE_URL") || fragment.includes("Prisma")) {
    return "database";
  }

  if (fragment.includes("SECRET") || fragment.includes("sha256=")) {
    return "secret";
  }

  if (fragment.includes("provider") || fragment.includes("fake_dev_")) {
    return "provider";
  }

  if (
    fragment.includes("card") ||
    fragment.includes("411111") ||
    fragment.includes("cvv") ||
    fragment.includes("expiry")
  ) {
    return "card";
  }

  if (fragment.includes("token")) {
    return "token";
  }

  if (fragment.includes("raw SQL") || fragment.includes("stack")) {
    return "internal";
  }

  return "sensitive";
}

function assertSnapshotUnchanged(
  label: string,
  before: PaymentOrderSnapshot,
  after: PaymentOrderSnapshot,
) {
  if (JSON.stringify(toComparableSnapshot(after)) !== JSON.stringify(toComparableSnapshot(before))) {
    throw new SeedStateError(
      `M004 payment webhook smoke failed: ${label} mutated a protected snapshot; publicCode=${before.publicCode}; beforePayment=${before.paymentStatus}; afterPayment=${after.paymentStatus}.`,
    );
  }
}

function toComparableSnapshot(snapshot: PaymentOrderSnapshot) {
  return {
    id: snapshot.id,
    publicCode: snapshot.publicCode,
    status: snapshot.status,
    paymentMethod: snapshot.paymentMethod,
    paymentStatus: snapshot.paymentStatus,
    updatedAt: snapshot.updatedAt.getTime(),
    payment: snapshot.payment
      ? {
          id: snapshot.payment.id,
          method: snapshot.payment.method,
          status: snapshot.payment.status,
          provider: snapshot.payment.provider,
          providerPaymentId: snapshot.payment.providerPaymentId,
          providerStatus: snapshot.payment.providerStatus,
          providerPayload: snapshot.payment.providerPayload,
          checkoutUrl: snapshot.payment.checkoutUrl,
          pixQrCode: snapshot.payment.pixQrCode,
          pixCopyPaste: snapshot.payment.pixCopyPaste,
          pixExpiresAt: dateOrNull(snapshot.payment.pixExpiresAt),
          cardBrand: snapshot.payment.cardBrand,
          cardLast4: snapshot.payment.cardLast4,
          paidAt: dateOrNull(snapshot.payment.paidAt),
          failedAt: dateOrNull(snapshot.payment.failedAt),
          createdAt: snapshot.payment.createdAt.getTime(),
          updatedAt: snapshot.payment.updatedAt.getTime(),
        }
      : null,
  };
}

function buildWebhookRawBody(
  input: {
    eventId: string;
    providerPaymentId: string;
    status: FakeDevPaymentWebhookEventStatus;
    occurredAt: Date;
  },
  extras: Record<string, unknown> = {},
) {
  return JSON.stringify({
    provider: PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
    eventId: input.eventId,
    providerPaymentId: input.providerPaymentId,
    status: input.status,
    occurredAt: input.occurredAt.toISOString(),
    ...extras,
  });
}

function buildWebhookHeaders({
  rawBody,
  timestamp,
  signature,
}: {
  rawBody: string;
  timestamp: string;
  signature: string;
}) {
  return new Headers({
    "content-length": Buffer.byteLength(rawBody, "utf8").toString(),
    [FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_HEADER]: signature,
    [FAKE_DEV_PAYMENT_WEBHOOK_TIMESTAMP_HEADER]: timestamp,
  });
}

function checkoutPayload({
  establishmentId,
  productId,
  method,
  label,
}: {
  establishmentId: string;
  productId: string;
  method: SmokePaymentMethod;
  label: string;
}): CheckoutOrderPayload {
  return {
    establishmentId,
    items: [{ productId, quantity: 2 }],
    customerName: "Smoke Cliente M004",
    customerPhone: "11999999999",
    deliveryStreet: "Rua Smoke M004",
    deliveryNumber: "42",
    deliveryComplement: null,
    deliveryNeighborhood: "Centro",
    deliveryCity: "São Paulo",
    deliveryState: "SP",
    deliveryPostalCode: "01001-000",
    deliveryReference: null,
    generalObservation: `Pedido descartável criado pelo smoke M004 (${label}).`,
    paymentMethod: method,
  };
}

function buildEventClock(index: number) {
  return new Date(SMOKE_BASE_NOW + index * 60_000);
}

function buildSafePublicCode(runEntropy: string, label: string) {
  return `PED-20260428-${label}-${runEntropy.slice(0, 8)}`;
}

function expectedDateMatches(
  actual: Date | null,
  expectation: "event" | null,
  eventDate: Date,
) {
  if (expectation === null) {
    return actual === null;
  }

  return sameDate(actual, eventDate);
}

function sameDate(left: Date | null, right: Date | null) {
  if (left === null || right === null) {
    return left === right;
  }

  return left.getTime() === right.getTime();
}

function dateOrNull(value: Date | null) {
  return value ? value.getTime() : null;
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function revokeIssuedSessions(
  auth: AuthSmokeService,
  sessionTokens: string[],
) {
  for (const sessionToken of sessionTokens) {
    await auth.revokeSessionByToken(sessionToken);
  }
}

verifyM004PaymentWebhooks().catch((error: unknown) => {
  console.error(`M004 payment webhook smoke failed: ${formatSafeError(error)}`);
  process.exitCode = 1;
});
