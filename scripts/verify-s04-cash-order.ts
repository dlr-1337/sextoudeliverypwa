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
  authSecret: "s04-cash-order-smoke-session-secret-0123456789",
  sessionCookieName: "s04_cash_order_smoke_session",
  sessionMaxAgeDays: 1,
  sessionMaxAgeSeconds: 24 * 60 * 60,
  secureCookies: false,
};

async function verifyS04CashOrder() {
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

  try {
    const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const smokePassword = `Sextou-${runId}-Senha!42`;
    const customer = await auth.registerCustomer({
      name: "Smoke Cliente S04",
      email: `s04-customer-${runId}@example.invalid`,
      password: smokePassword,
      phone: "11999999999",
    });

    if (!customer.ok) {
      throw new SeedStateError(
        `S04 cash order smoke failed: customer registration returned ${customer.code}.`,
      );
    }

    issuedSessionTokens.push(customer.data.sessionToken);

    const merchant = await auth.registerMerchant({
      name: "Smoke Comerciante S04",
      email: `s04-merchant-${runId}@example.invalid`,
      password: smokePassword,
      establishmentName: `S04 Smoke Pedido ${runId}`,
      establishmentPhone: "1133334444",
    });

    if (!merchant.ok) {
      throw new SeedStateError(
        `S04 cash order smoke failed: merchant registration returned ${merchant.code}.`,
      );
    }

    issuedSessionTokens.push(merchant.data.sessionToken);

    const approved = await establishmentService.approve({
      id: merchant.data.establishment.id,
    });

    if (!approved.ok || approved.data.status !== EstablishmentStatus.ACTIVE) {
      throw new SeedStateError(
        `S04 cash order smoke failed: establishment approval returned ${approved.ok ? approved.data.status : approved.code}.`,
      );
    }

    const product = await productService.createForOwner(merchant.data.user.id, {
      name: `Produto Smoke S04 ${runId}`,
      description: "Produto ativo criado pelo smoke S04.",
      price: "19.90",
    });

    if (!product.ok || product.data.status !== ProductStatus.ACTIVE) {
      throw new SeedStateError(
        `S04 cash order smoke failed: product creation returned ${product.ok ? product.data.status : product.code}.`,
      );
    }

    const created = await orderService.createCashOrder(
      customer.data.user.id,
      cashOrderPayload({
        establishmentId: merchant.data.establishment.id,
        productId: product.data.id,
      }),
    );

    if (!created.ok) {
      throw new SeedStateError(
        `S04 cash order smoke failed: order service returned ${created.code}.`,
      );
    }

    const publicOrder = await orderService.getPublicOrderByCode(
      created.data.publicCode,
    );

    if (!publicOrder) {
      throw new SeedStateError(
        "S04 cash order smoke failed: public order read returned no DTO.",
      );
    }

    const persisted = await prisma.order.findUnique({
      where: { publicCode: created.data.publicCode },
      select: {
        publicCode: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        total: true,
        items: {
          select: {
            quantity: true,
            total: true,
          },
        },
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
          select: { status: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!persisted) {
      throw new SeedStateError(
        "S04 cash order smoke failed: created public code was not persisted.",
      );
    }

    const itemCount = persisted.items.length;
    const historyCount = persisted.statusHistory.length;
    const payment = persisted.payment;
    const providerFieldsAreEmpty =
      payment?.provider === null &&
      payment.providerPaymentId === null &&
      payment.providerPayload === null;

    if (
      persisted.status !== OrderStatus.PENDING ||
      persisted.paymentMethod !== PaymentMethod.CASH ||
      persisted.paymentStatus !== PaymentStatus.MANUAL_CASH_ON_DELIVERY ||
      payment?.method !== PaymentMethod.CASH ||
      payment.status !== PaymentStatus.MANUAL_CASH_ON_DELIVERY ||
      itemCount !== 1 ||
      historyCount < 1 ||
      persisted.statusHistory[0]?.status !== OrderStatus.PENDING ||
      publicOrder.payment?.status !== PaymentStatus.MANUAL_CASH_ON_DELIVERY ||
      publicOrder.statusHistory[0]?.status !== OrderStatus.PENDING ||
      !providerFieldsAreEmpty
    ) {
      throw new SeedStateError(
        `S04 cash order smoke failed: unexpected persisted order shape for publicCode=${created.data.publicCode}; status=${persisted.status}; payment=${payment?.status ?? "missing"}; items=${itemCount}; history=${historyCount}.`,
      );
    }

    console.info(
      `S04 cash order smoke ok: publicCode=${created.data.publicCode}; status=${persisted.status}; payment=${payment.status}; items=${itemCount}; history=${historyCount}; total=${persisted.total.toString()}; publicDtoItems=${publicOrder.items.length}; publicDtoHistory=${publicOrder.statusHistory.length}.`,
    );
  } finally {
    await revokeIssuedSessions(auth, issuedSessionTokens);
    await prisma.$disconnect();
  }
}

function cashOrderPayload(input: {
  establishmentId: string;
  productId: string;
}): CheckoutOrderPayload {
  return {
    establishmentId: input.establishmentId,
    items: [{ productId: input.productId, quantity: 2 }],
    customerName: "Smoke Cliente S04",
    customerPhone: "11999999999",
    deliveryStreet: "Rua Smoke S04",
    deliveryNumber: "42",
    deliveryComplement: null,
    deliveryNeighborhood: "Centro",
    deliveryCity: "São Paulo",
    deliveryState: "SP",
    deliveryPostalCode: "01001-000",
    deliveryReference: null,
    generalObservation: "Pedido descartável criado pelo smoke S04.",
    paymentMethod: "CASH",
  };
}

async function revokeIssuedSessions(
  auth: ReturnType<typeof createAuthServiceCore>,
  sessionTokens: string[],
) {
  for (const sessionToken of sessionTokens) {
    await auth.revokeSessionByToken(sessionToken);
  }
}

verifyS04CashOrder().catch((error: unknown) => {
  console.error(`S04 cash order smoke failed: ${formatSafeError(error)}`);
  process.exitCode = 1;
});
