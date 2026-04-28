import "dotenv/config";

import { randomUUID } from "node:crypto";

import {
  CategoryType,
  EstablishmentStatus,
  ProductStatus,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/client";
import { getAuthConfig } from "../src/modules/auth/config";
import {
  createAuthServiceCore,
  type AuthServiceClient,
} from "../src/modules/auth/service-core";
import {
  createCatalogServiceCore,
  type CatalogServiceClient,
} from "../src/modules/catalog/service-core";
import {
  createEstablishmentServiceCore,
  type EstablishmentServiceClient,
} from "../src/modules/establishments/service-core";
import {
  createProductServiceCore,
  type ProductServiceClient,
} from "../src/modules/products/service-core";
import {
  createPrismaClient,
  formatSafeError,
  SeedStateError,
} from "../prisma/seed";

export const M003_FIXTURE_REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "SESSION_COOKIE_NAME",
  "SESSION_MAX_AGE_DAYS",
] as const;

export const M003_ORDER_OPERATIONS_FIXTURE_FIELD_NAMES = [
  "storeSlug",
  "storeName",
  "productName",
  "productPrice",
  "customerName",
  "customerPhone",
  "customerEmail",
  "ownerMerchantEmail",
  "internalIds",
] as const;

export const M003_ORDER_OPERATIONS_INTERNAL_ID_FIELD_NAMES = [
  "customerId",
  "ownerMerchantUserId",
  "establishmentId",
  "productId",
] as const;

export type M003FixturePrismaClient = ReturnType<typeof createPrismaClient>;

export type M003OrderOperationsFixture = {
  storeSlug: string;
  storeName: string;
  productName: string;
  productPrice: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  ownerMerchantEmail: string;
  internalIds: {
    customerId: string;
    ownerMerchantUserId: string;
    establishmentId: string;
    productId: string;
  };
};

export type M003OrderOperationsFixtureOptions = {
  prisma?: M003FixturePrismaClient;
  env?: NodeJS.ProcessEnv;
  customerPassword: string;
  ownerMerchantPassword: string;
  runId?: string;
};

type ServiceResult<TData> =
  | { ok: true; data: TData }
  | { ok: false; code: string };

const PRODUCT_PRICE = "27.90";

export function createM003FixturePrismaClient(
  env: NodeJS.ProcessEnv = process.env,
) {
  return createPrismaClient(env);
}

export function formatM003FixtureSafeError(
  error: unknown,
  env: NodeJS.ProcessEnv = process.env,
) {
  return formatSafeError(error, env);
}

export function createM003OrderOperationsRunId() {
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

export async function setupM003OrderOperationsFixture(
  options: M003OrderOperationsFixtureOptions,
): Promise<M003OrderOperationsFixture> {
  const env = options.env ?? process.env;
  const prisma = options.prisma ?? createM003FixturePrismaClient(env);
  const shouldDisconnect = !options.prisma;

  try {
    return await setupM003OrderOperationsFixtureWithClient(prisma, env, options);
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

async function setupM003OrderOperationsFixtureWithClient(
  prisma: M003FixturePrismaClient,
  env: NodeJS.ProcessEnv,
  options: Pick<
    M003OrderOperationsFixtureOptions,
    "customerPassword" | "ownerMerchantPassword" | "runId"
  >,
): Promise<M003OrderOperationsFixture> {
  const authConfig = getAuthConfig(env);
  const auth = createAuthServiceCore({
    db: prisma as unknown as AuthServiceClient,
    config: authConfig,
    enums: {
      establishmentStatus: EstablishmentStatus,
      userRole: UserRole,
      userStatus: UserStatus,
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
  const catalogService = createCatalogServiceCore({
    db: prisma as unknown as CatalogServiceClient,
    enums: {
      establishmentStatus: EstablishmentStatus,
      productStatus: ProductStatus,
    },
  });
  const issuedSessionTokens: string[] = [];
  let setupError: unknown;
  let fixture: M003OrderOperationsFixture | undefined;

  try {
    const customerPassword = readRequiredSecret(
      options.customerPassword,
      "customer password",
    );
    const ownerMerchantPassword = readRequiredSecret(
      options.ownerMerchantPassword,
      "owner merchant password",
    );
    const runId = options.runId ?? createM003OrderOperationsRunId();
    const customerName = `Cliente M003 ${runId}`;
    const customerPhone = "11977776666";
    const customerEmail = `m003-customer-${runId}@example.invalid`;
    const ownerMerchantEmail = `m003-owner-${runId}@example.invalid`;
    const storeName = `M003 E2E Loja ${runId}`;
    const productName = `Produto M003 ${runId}`;

    const customerData = assertServiceSuccess(
      await auth.registerCustomer({
        email: customerEmail,
        name: customerName,
        password: customerPassword,
        phone: customerPhone,
      }),
      "customer registration",
    );
    issuedSessionTokens.push(customerData.sessionToken);

    const ownerMerchantData = assertServiceSuccess(
      await auth.registerMerchant({
        email: ownerMerchantEmail,
        establishmentName: storeName,
        establishmentPhone: "1133334444",
        name: `Comerciante M003 ${runId}`,
        password: ownerMerchantPassword,
        phone: "11999999999",
      }),
      "owner merchant registration",
    );
    issuedSessionTokens.push(ownerMerchantData.sessionToken);

    const approved = assertServiceSuccess(
      await establishmentService.approve({ id: ownerMerchantData.establishment.id }),
      "establishment approval",
    );

    if (approved.status !== EstablishmentStatus.ACTIVE) {
      throw new SeedStateError(
        `M003 fixture setup failed: establishment approval returned ${approved.status}.`,
      );
    }

    const product = assertServiceSuccess(
      await productService.createForOwner(ownerMerchantData.user.id, {
        description: "Produto ativo descartável criado pelo fixture M003.",
        name: productName,
        price: PRODUCT_PRICE,
      }),
      "product creation",
    );

    if (product.status !== ProductStatus.ACTIVE) {
      throw new SeedStateError(
        `M003 fixture setup failed: product creation returned ${product.status}.`,
      );
    }

    const catalog = assertServiceSuccess(
      await catalogService.getActiveStoreCatalog({
        slug: ownerMerchantData.establishment.slug,
      }),
      "active catalog lookup",
    );

    if (!catalog.products.some((catalogProduct) => catalogProduct.id === product.id)) {
      throw new SeedStateError(
        "M003 fixture setup failed: active catalog did not include the fixture product.",
      );
    }

    fixture = {
      storeSlug: ownerMerchantData.establishment.slug,
      storeName,
      productName,
      productPrice: product.price,
      customerName,
      customerPhone,
      customerEmail,
      ownerMerchantEmail,
      internalIds: {
        customerId: customerData.user.id,
        ownerMerchantUserId: ownerMerchantData.user.id,
        establishmentId: ownerMerchantData.establishment.id,
        productId: product.id,
      },
    };
  } catch (error) {
    setupError = error;
    throw error;
  } finally {
    const revocationFailures = await revokeIssuedSessions(auth, issuedSessionTokens);

    if (!setupError && revocationFailures.length > 0) {
      throw new SeedStateError(
        `M003 fixture setup failed: setup session revocation returned ${revocationFailures.join(", ")}.`,
      );
    }
  }

  if (!fixture) {
    throw new SeedStateError(
      "M003 fixture setup failed: fixture data was not assembled.",
    );
  }

  return fixture;
}

function assertServiceSuccess<TData>(
  result: ServiceResult<TData>,
  label: string,
): TData {
  if (result.ok === true) {
    return result.data;
  }

  throw new SeedStateError(
    `M003 fixture setup failed: ${label} returned ${readFailureCode(result)}.`,
  );
}

async function revokeIssuedSessions(
  auth: ReturnType<typeof createAuthServiceCore>,
  sessionTokens: string[],
) {
  const failures: string[] = [];

  for (const sessionToken of sessionTokens) {
    try {
      const revoked = await auth.revokeSessionByToken(sessionToken);

      if (revoked.ok !== true) {
        failures.push(readFailureCode(revoked));
      }
    } catch {
      failures.push("THROWN");
    }
  }

  return failures;
}

function readRequiredSecret(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SeedStateError(`M003 fixture setup failed: missing ${label}.`);
  }

  return value;
}

function readFailureCode(result: { ok: false; code: string }) {
  return result.code;
}
