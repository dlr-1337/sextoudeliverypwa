import "dotenv/config";

import {
  EstablishmentStatus,
  ProductStatus,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/client";
import { SeedStateError } from "../prisma/seed";
import {
  createM002FixturePrismaClient,
  formatM002FixtureSafeError,
  setupM002MoneyFlowFixture,
  type M002FixturePrismaClient,
  type M002MoneyFlowFixture,
} from "../e2e/m002-money-flow.fixture";

async function verifyM002E2EFixture() {
  const prisma = createM002FixturePrismaClient();

  try {
    const fixture = await setupM002MoneyFlowFixture({ prisma });
    const evidence = await assertFixtureQueryable(prisma, fixture);

    console.info(
      `M002 fixture smoke ok: storeSlug=${fixture.storeSlug}; storeName="${fixture.storeName}"; productName="${fixture.productName}"; activeStores=${evidence.activeStoreCount}; activeProducts=${evidence.activeProductCount}; activeCustomers=${evidence.activeCustomerCount}; setupSessionsRevoked=${String(evidence.activeSetupSessionCount === 0)}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function assertFixtureQueryable(
  prisma: M002FixturePrismaClient,
  fixture: M002MoneyFlowFixture,
) {
  const [customer, merchant, store, activeStoreCount, activeProductCount, activeSetupSessionCount] =
    await Promise.all([
      prisma.user.findUnique({
        where: { email: fixture.customerEmail },
        select: { id: true, role: true, status: true },
      }),
      prisma.user.findUnique({
        where: { id: fixture.internalIds.merchantUserId },
        select: { id: true, role: true, status: true },
      }),
      prisma.establishment.findUnique({
        where: { slug: fixture.storeSlug },
        select: {
          id: true,
          name: true,
          status: true,
          products: {
            where: { id: fixture.internalIds.productId },
            select: { id: true, name: true, status: true },
          },
        },
      }),
      prisma.establishment.count({
        where: {
          slug: fixture.storeSlug,
          status: EstablishmentStatus.ACTIVE,
        },
      }),
      prisma.product.count({
        where: {
          id: fixture.internalIds.productId,
          name: fixture.productName,
          status: ProductStatus.ACTIVE,
          establishment: {
            slug: fixture.storeSlug,
            status: EstablishmentStatus.ACTIVE,
          },
        },
      }),
      prisma.session.count({
        where: {
          revokedAt: null,
          userId: {
            in: [fixture.internalIds.customerId, fixture.internalIds.merchantUserId],
          },
        },
      }),
    ]);

  if (
    !customer ||
    customer.id !== fixture.internalIds.customerId ||
    customer.role !== UserRole.CUSTOMER ||
    customer.status !== UserStatus.ACTIVE
  ) {
    throw new SeedStateError(
      "M002 fixture smoke failed: customer row was not queryable as an active CUSTOMER.",
    );
  }

  if (
    !merchant ||
    merchant.role !== UserRole.MERCHANT ||
    merchant.status !== UserStatus.ACTIVE
  ) {
    throw new SeedStateError(
      "M002 fixture smoke failed: merchant row was not queryable as an active MERCHANT.",
    );
  }

  if (
    !store ||
    store.id !== fixture.internalIds.establishmentId ||
    store.name !== fixture.storeName ||
    store.status !== EstablishmentStatus.ACTIVE ||
    store.products.length !== 1 ||
    store.products[0]?.name !== fixture.productName ||
    store.products[0]?.status !== ProductStatus.ACTIVE
  ) {
    throw new SeedStateError(
      "M002 fixture smoke failed: active store/product rows were not queryable by fixture slug.",
    );
  }

  if (activeStoreCount !== 1 || activeProductCount !== 1) {
    throw new SeedStateError(
      `M002 fixture smoke failed: expected one active store/product match; stores=${activeStoreCount}; products=${activeProductCount}.`,
    );
  }

  if (activeSetupSessionCount !== 0) {
    throw new SeedStateError(
      `M002 fixture smoke failed: expected setup sessions revoked; activeSetupSessions=${activeSetupSessionCount}.`,
    );
  }

  return {
    activeCustomerCount: 1,
    activeProductCount,
    activeSetupSessionCount,
    activeStoreCount,
  };
}

verifyM002E2EFixture().catch((error: unknown) => {
  console.error(`M002 fixture smoke failed: ${formatM002FixtureSafeError(error)}`);
  process.exitCode = 1;
});
