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
import { generatePublicOrderCode } from "../src/modules/orders/service";
import {
  createOrderServiceCore,
  type MerchantOrderTransitionFailureCode,
  type OrderServiceClient,
} from "../src/modules/orders/service-core";
import type { CheckoutOrderPayload } from "../src/modules/orders/schemas";
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
  authSecret: "m003-order-operations-smoke-session-secret-0123456789",
  sessionCookieName: "m003_order_operations_smoke_session",
  sessionMaxAgeDays: 1,
  sessionMaxAgeSeconds: 24 * 60 * 60,
  secureCookies: false,
};

const OWNER_ACCEPTED_NOTE = "Pedido aceito pelo smoke M003.";

const PRIVATE_PUBLIC_DTO_KEYS = [
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
  "cardBrand",
  "cardLast4",
] as const;

type PrismaSmokeClient = ReturnType<typeof createPrismaClient>;
type AuthSmokeService = ReturnType<typeof createAuthServiceCore>;
type OrderSnapshot = NonNullable<Awaited<ReturnType<typeof readOrderSnapshot>>>;
type TransitionExpectation = {
  label: string;
  ownerId: string;
  orderId: string;
  expectedStatus: OrderStatus;
  targetStatus: OrderStatus;
  expectedCode: MerchantOrderTransitionFailureCode;
};

async function verifyM003OrderOperations() {
  const prisma = createPrismaClient();
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
  });
  const issuedSessionTokens: string[] = [];
  let publicCode = "uncreated";

  try {
    const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const smokePassword = `Sextou-${runId}-Senha!42`;
    const customer = await auth.registerCustomer({
      name: "Smoke Cliente M003",
      email: `m003-customer-${runId}@example.invalid`,
      password: smokePassword,
      phone: "11999999999",
    });

    if (!customer.ok) {
      throw new SeedStateError(
        `M003 order operations smoke failed: customer registration returned ${customer.code}.`,
      );
    }

    issuedSessionTokens.push(customer.data.sessionToken);

    const ownerMerchant = await auth.registerMerchant({
      name: "Smoke Comerciante M003 Dono",
      email: `m003-owner-${runId}@example.invalid`,
      password: smokePassword,
      establishmentName: `M003 Smoke Loja Dono ${runId}`,
      establishmentPhone: "1133334444",
    });

    if (!ownerMerchant.ok) {
      throw new SeedStateError(
        `M003 order operations smoke failed: owner merchant registration returned ${ownerMerchant.code}.`,
      );
    }

    issuedSessionTokens.push(ownerMerchant.data.sessionToken);

    const otherMerchant = await auth.registerMerchant({
      name: "Smoke Comerciante M003 Outro",
      email: `m003-other-${runId}@example.invalid`,
      password: smokePassword,
      establishmentName: `M003 Smoke Loja Outro ${runId}`,
      establishmentPhone: "1144445555",
    });

    if (!otherMerchant.ok) {
      throw new SeedStateError(
        `M003 order operations smoke failed: other merchant registration returned ${otherMerchant.code}.`,
      );
    }

    issuedSessionTokens.push(otherMerchant.data.sessionToken);

    await assertApprovedEstablishment(
      establishmentService,
      ownerMerchant.data.establishment.id,
      "owner",
    );
    await assertApprovedEstablishment(
      establishmentService,
      otherMerchant.data.establishment.id,
      "other",
    );

    const product = await productService.createForOwner(ownerMerchant.data.user.id, {
      name: `Produto Smoke M003 ${runId}`,
      description: "Produto ativo criado pelo smoke M003.",
      price: "23.90",
    });

    if (!product.ok || product.data.status !== ProductStatus.ACTIVE) {
      throw new SeedStateError(
        `M003 order operations smoke failed: product creation returned ${product.ok ? product.data.status : product.code}.`,
      );
    }

    const created = await orderService.createCashOrder(
      customer.data.user.id,
      cashOrderPayload({
        establishmentId: ownerMerchant.data.establishment.id,
        productId: product.data.id,
      }),
    );

    if (!created.ok) {
      throw new SeedStateError(
        `M003 order operations smoke failed: order service returned ${created.code}.`,
      );
    }

    publicCode = created.data.publicCode;

    const initial = await readOrderSnapshot(prisma, publicCode);

    if (
      initial.status !== OrderStatus.PENDING ||
      initial.paymentMethod !== PaymentMethod.CASH ||
      initial.paymentStatus !== PaymentStatus.MANUAL_CASH_ON_DELIVERY ||
      initial.statusHistory.length !== 1 ||
      initial.statusHistory[0]?.status !== OrderStatus.PENDING
    ) {
      throw new SeedStateError(
        `M003 order operations smoke failed: initial order shape mismatch for publicCode=${publicCode}; status=${initial.status}; payment=${initial.paymentStatus}; history=${initial.statusHistory.length}.`,
      );
    }

    const wrongOwnerUnchanged = await assertTransitionFailureWithoutMutation({
      prisma,
      orderService,
      before: initial,
      expectation: {
        label: "wrong-owner",
        ownerId: otherMerchant.data.user.id,
        orderId: initial.id,
        expectedStatus: OrderStatus.PENDING,
        targetStatus: OrderStatus.ACCEPTED,
        expectedCode: "ORDER_NOT_FOUND",
      },
    });
    const afterWrongOwner = await readOrderSnapshot(prisma, publicCode);
    const staleUnchanged = await assertTransitionFailureWithoutMutation({
      prisma,
      orderService,
      before: afterWrongOwner,
      expectation: {
        label: "stale-status",
        ownerId: ownerMerchant.data.user.id,
        orderId: initial.id,
        expectedStatus: OrderStatus.ACCEPTED,
        targetStatus: OrderStatus.PREPARING,
        expectedCode: "STALE_STATUS",
      },
    });
    const afterStale = await readOrderSnapshot(prisma, publicCode);
    const invalidUnchanged = await assertTransitionFailureWithoutMutation({
      prisma,
      orderService,
      before: afterStale,
      expectation: {
        label: "invalid-transition",
        ownerId: ownerMerchant.data.user.id,
        orderId: initial.id,
        expectedStatus: OrderStatus.PENDING,
        targetStatus: OrderStatus.DELIVERED,
        expectedCode: "INVALID_TRANSITION",
      },
    });

    const accepted = await orderService.transitionMerchantOrderStatusForOwner(
      ownerMerchant.data.user.id,
      {
        orderId: initial.id,
        expectedStatus: OrderStatus.PENDING,
        targetStatus: OrderStatus.ACCEPTED,
        note: OWNER_ACCEPTED_NOTE,
      },
    );

    if (!accepted.ok) {
      throw new SeedStateError(
        `M003 order operations smoke failed: owner accepted transition returned ${accepted.code}; publicCode=${publicCode}.`,
      );
    }

    const persisted = await readOrderSnapshot(prisma, publicCode);
    const publicOrder = await orderService.getPublicOrderByCode(publicCode);

    if (!publicOrder) {
      throw new SeedStateError(
        `M003 order operations smoke failed: public DTO missing for publicCode=${publicCode}; status=${persisted.status}; history=${persisted.statusHistory.length}.`,
      );
    }

    const acceptedHistory = persisted.statusHistory[1];
    const acceptedAtSet = persisted.acceptedAt instanceof Date;
    const updatedAtSet =
      persisted.acceptedAt instanceof Date &&
      persisted.updatedAt.getTime() === persisted.acceptedAt.getTime();
    const terminalTimestampsClear =
      persisted.deliveredAt === null && persisted.canceledAt === null;
    const paymentCashManual =
      persisted.paymentMethod === PaymentMethod.CASH &&
      persisted.paymentStatus === PaymentStatus.MANUAL_CASH_ON_DELIVERY &&
      persisted.payment?.method === PaymentMethod.CASH &&
      persisted.payment.status === PaymentStatus.MANUAL_CASH_ON_DELIVERY &&
      persisted.payment.provider === null &&
      persisted.payment.providerPaymentId === null &&
      persisted.payment.providerPayload === null;
    const publicDtoHasAcceptedNote = publicOrder.statusHistory.some(
      (history) =>
        history.status === OrderStatus.ACCEPTED &&
        history.note === OWNER_ACCEPTED_NOTE,
    );
    const publicDtoPrivateFieldsSafe = publicDtoHasNoPrivateFields(publicOrder);

    if (
      persisted.status !== OrderStatus.ACCEPTED ||
      !acceptedAtSet ||
      !updatedAtSet ||
      !terminalTimestampsClear ||
      !paymentCashManual ||
      persisted.statusHistory.length !== 2 ||
      persisted.statusHistory[0]?.status !== OrderStatus.PENDING ||
      acceptedHistory?.status !== OrderStatus.ACCEPTED ||
      acceptedHistory.changedById !== ownerMerchant.data.user.id ||
      acceptedHistory.note !== OWNER_ACCEPTED_NOTE ||
      publicOrder.status !== OrderStatus.ACCEPTED ||
      publicOrder.paymentMethod !== PaymentMethod.CASH ||
      publicOrder.payment?.status !== PaymentStatus.MANUAL_CASH_ON_DELIVERY ||
      !publicDtoHasAcceptedNote ||
      !publicDtoPrivateFieldsSafe
    ) {
      throw new SeedStateError(
        `M003 order operations smoke failed: accepted order mismatch for publicCode=${publicCode}; status=${persisted.status}; acceptedAtSet=${acceptedAtSet}; updatedAtSet=${updatedAtSet}; terminalTimestampsClear=${terminalTimestampsClear}; paymentCashManual=${paymentCashManual}; history=${persisted.statusHistory.length}; publicStatus=${publicOrder.status}; publicHistory=${publicOrder.statusHistory.length}; publicDtoPrivateFieldsSafe=${publicDtoPrivateFieldsSafe}.`,
      );
    }

    console.info(
      `M003 order operations smoke ok: publicCode=${publicCode}; finalStatus=${persisted.status}; wrongOwnerUnchanged=${wrongOwnerUnchanged}; staleUnchanged=${staleUnchanged}; invalidUnchanged=${invalidUnchanged}; acceptedAtSet=${acceptedAtSet}; updatedAtSet=${updatedAtSet}; terminalTimestampsClear=${terminalTimestampsClear}; paymentCashManual=${paymentCashManual}; history=${persisted.statusHistory.length}; publicDtoStatus=${publicOrder.status}; publicDtoHistory=${publicOrder.statusHistory.length}; publicDtoNote=${publicDtoHasAcceptedNote}; publicDtoPrivateFieldsSafe=${publicDtoPrivateFieldsSafe}.`,
    );
  } finally {
    await revokeIssuedSessions(auth, issuedSessionTokens);
    await prisma.$disconnect();
  }
}

async function assertApprovedEstablishment(
  establishmentService: ReturnType<typeof createEstablishmentServiceCore>,
  establishmentId: string,
  label: "owner" | "other",
) {
  const approved = await establishmentService.approve({ id: establishmentId });

  if (!approved.ok || approved.data.status !== EstablishmentStatus.ACTIVE) {
    throw new SeedStateError(
      `M003 order operations smoke failed: ${label} establishment approval returned ${approved.ok ? approved.data.status : approved.code}.`,
    );
  }
}

async function assertTransitionFailureWithoutMutation(input: {
  prisma: PrismaSmokeClient;
  orderService: ReturnType<typeof createOrderServiceCore>;
  before: OrderSnapshot;
  expectation: TransitionExpectation;
}) {
  const result = await input.orderService.transitionMerchantOrderStatusForOwner(
    input.expectation.ownerId,
    {
      orderId: input.expectation.orderId,
      expectedStatus: input.expectation.expectedStatus,
      targetStatus: input.expectation.targetStatus,
    },
  );

  if (result.ok || result.code !== input.expectation.expectedCode) {
    throw new SeedStateError(
      `M003 order operations smoke failed: ${input.expectation.label} transition returned ${result.ok ? "ok" : result.code}; expected=${input.expectation.expectedCode}; publicCode=${input.before.publicCode}; status=${input.before.status}; history=${input.before.statusHistory.length}.`,
    );
  }

  const after = await readOrderSnapshot(input.prisma, input.before.publicCode);
  const unchanged = orderSnapshotUnchanged(input.before, after);

  if (!unchanged) {
    throw new SeedStateError(
      `M003 order operations smoke failed: ${input.expectation.label} transition mutated order for publicCode=${input.before.publicCode}; beforeStatus=${input.before.status}; afterStatus=${after.status}; beforeHistory=${input.before.statusHistory.length}; afterHistory=${after.statusHistory.length}.`,
    );
  }

  return unchanged;
}

function orderSnapshotUnchanged(before: OrderSnapshot, after: OrderSnapshot) {
  return (
    after.id === before.id &&
    after.status === before.status &&
    sameDateOrNull(after.acceptedAt, before.acceptedAt) &&
    sameDateOrNull(after.deliveredAt, before.deliveredAt) &&
    sameDateOrNull(after.canceledAt, before.canceledAt) &&
    after.statusHistory.length === before.statusHistory.length &&
    after.statusHistory.every((history, index) => {
      const beforeHistory = before.statusHistory[index];

      return (
        beforeHistory !== undefined &&
        history.status === beforeHistory.status &&
        history.changedById === beforeHistory.changedById &&
        history.note === beforeHistory.note &&
        history.createdAt.getTime() === beforeHistory.createdAt.getTime()
      );
    })
  );
}

function sameDateOrNull(left: Date | null, right: Date | null) {
  if (left === null || right === null) {
    return left === right;
  }

  return left.getTime() === right.getTime();
}

async function readOrderSnapshot(prisma: PrismaSmokeClient, publicCode: string) {
  const order = await prisma.order.findUnique({
    where: { publicCode },
    select: {
      id: true,
      publicCode: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      acceptedAt: true,
      deliveredAt: true,
      canceledAt: true,
      updatedAt: true,
      payment: {
        select: {
          method: true,
          status: true,
          amount: true,
          provider: true,
          providerPaymentId: true,
          providerPayload: true,
        },
      },
      statusHistory: {
        select: {
          status: true,
          changedById: true,
          note: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!order) {
    throw new SeedStateError(
      `M003 order operations smoke failed: order snapshot missing for publicCode=${publicCode}.`,
    );
  }

  return order;
}

function publicDtoHasNoPrivateFields(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.every(publicDtoHasNoPrivateFields);
  }

  if (!value || typeof value !== "object") {
    return true;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (PRIVATE_PUBLIC_DTO_KEYS.includes(key as (typeof PRIVATE_PUBLIC_DTO_KEYS)[number])) {
      return false;
    }

    if (!publicDtoHasNoPrivateFields(nestedValue)) {
      return false;
    }
  }

  return true;
}

function cashOrderPayload(input: {
  establishmentId: string;
  productId: string;
}): CheckoutOrderPayload {
  return {
    establishmentId: input.establishmentId,
    items: [{ productId: input.productId, quantity: 2 }],
    customerName: "Smoke Cliente M003",
    customerPhone: "11999999999",
    deliveryStreet: "Rua Smoke M003",
    deliveryNumber: "42",
    deliveryComplement: null,
    deliveryNeighborhood: "Centro",
    deliveryCity: "São Paulo",
    deliveryState: "SP",
    deliveryPostalCode: "01001-000",
    deliveryReference: null,
    generalObservation: "Pedido descartável criado pelo smoke M003.",
    paymentMethod: "CASH",
  };
}

async function revokeIssuedSessions(
  auth: AuthSmokeService,
  sessionTokens: string[],
) {
  for (const sessionToken of sessionTokens) {
    await auth.revokeSessionByToken(sessionToken);
  }
}

verifyM003OrderOperations().catch((error: unknown) => {
  console.error(`M003 order operations smoke failed: ${formatSafeError(error)}`);
  process.exitCode = 1;
});
