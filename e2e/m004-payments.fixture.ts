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

export const M004_PAYMENTS_FIXTURE_REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "SESSION_COOKIE_NAME",
  "SESSION_MAX_AGE_DAYS",
  "FAKE_PAYMENT_PROVIDER",
  "FAKE_PAYMENT_WEBHOOK_SECRET",
  "FAKE_PAYMENT_APPROVAL_MODE",
] as const;

export const M004_PAYMENTS_FIXTURE_FIELD_NAMES = [
  "storeSlug",
  "storeName",
  "productName",
  "productPrice",
  "customerName",
  "customerPhone",
  "customerEmail",
  "internalIds",
] as const;

export const M004_PAYMENTS_INTERNAL_ID_FIELD_NAMES = [
  "customerId",
  "merchantUserId",
  "establishmentId",
  "productId",
] as const;

export type M004FixturePrismaClient = ReturnType<typeof createPrismaClient>;

export type M004PaymentsFixture = {
  storeSlug: string;
  storeName: string;
  productName: string;
  productPrice: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  internalIds: {
    customerId: string;
    merchantUserId: string;
    establishmentId: string;
    productId: string;
  };
};

export type M004PaymentsFixtureOptions = {
  prisma?: M004FixturePrismaClient;
  env?: NodeJS.ProcessEnv;
  customerPassword: string;
  merchantPassword?: string;
  runId?: string;
};

type ServiceResult<TData> =
  | { ok: true; data: TData }
  | { ok: false; code: string };

const PRODUCT_PRICE = "33.40";

export function createM004FixturePrismaClient(
  env: NodeJS.ProcessEnv = process.env,
) {
  return createPrismaClient(env);
}

export function formatM004FixtureSafeError(
  error: unknown,
  env: NodeJS.ProcessEnv = process.env,
) {
  return formatSafeError(error, env);
}

export function createM004PaymentsRunId() {
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

export async function setupM004PaymentsFixture(
  options: M004PaymentsFixtureOptions,
): Promise<M004PaymentsFixture> {
  const env = options.env ?? process.env;
  const prisma = options.prisma ?? createM004FixturePrismaClient(env);
  const shouldDisconnect = !options.prisma;

  try {
    return await setupM004PaymentsFixtureWithClient(prisma, env, options);
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

async function setupM004PaymentsFixtureWithClient(
  prisma: M004FixturePrismaClient,
  env: NodeJS.ProcessEnv,
  options: Pick<
    M004PaymentsFixtureOptions,
    "customerPassword" | "merchantPassword" | "runId"
  >,
): Promise<M004PaymentsFixture> {
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
  let fixture: M004PaymentsFixture | undefined;

  try {
    const customerPassword = readRequiredSecret(
      options.customerPassword,
      "customer password",
    );
    const runId = options.runId ?? createM004PaymentsRunId();
    const merchantPassword = readOptionalSecret(options.merchantPassword) ??
      `Sextou-M004-merchant-${runId}-Senha!42`;
    const customerName = `Cliente M004 ${runId}`;
    const customerPhone = "11977776666";
    const customerEmail = `m004-customer-${runId}@example.invalid`;
    const merchantEmail = `m004-merchant-${runId}@example.invalid`;
    const storeName = `M004 E2E Loja ${runId}`;
    const productName = `Produto M004 ${runId}`;

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

    const merchantData = assertServiceSuccess(
      await auth.registerMerchant({
        email: merchantEmail,
        establishmentName: storeName,
        establishmentPhone: "1133334444",
        name: `Comerciante M004 ${runId}`,
        password: merchantPassword,
        phone: "11999999999",
      }),
      "merchant registration",
    );
    issuedSessionTokens.push(merchantData.sessionToken);

    const approved = assertServiceSuccess(
      await establishmentService.approve({ id: merchantData.establishment.id }),
      "establishment approval",
    );

    if (approved.status !== EstablishmentStatus.ACTIVE) {
      throw new SeedStateError(
        `M004 fixture setup failed: establishment approval returned ${approved.status}.`,
      );
    }

    const product = assertServiceSuccess(
      await productService.createForOwner(merchantData.user.id, {
        description: "Produto ativo descartável criado pelo fixture M004.",
        name: productName,
        price: PRODUCT_PRICE,
      }),
      "product creation",
    );

    if (product.status !== ProductStatus.ACTIVE) {
      throw new SeedStateError(
        `M004 fixture setup failed: product creation returned ${product.status}.`,
      );
    }

    const catalog = assertServiceSuccess(
      await catalogService.getActiveStoreCatalog({
        slug: merchantData.establishment.slug,
      }),
      "active catalog lookup",
    );

    if (!catalog.products.some((catalogProduct) => catalogProduct.id === product.id)) {
      throw new SeedStateError(
        "M004 fixture setup failed: active catalog did not include the fixture product.",
      );
    }

    fixture = {
      storeSlug: merchantData.establishment.slug,
      storeName,
      productName,
      productPrice: product.price,
      customerName,
      customerPhone,
      customerEmail,
      internalIds: {
        customerId: customerData.user.id,
        merchantUserId: merchantData.user.id,
        establishmentId: merchantData.establishment.id,
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
        `M004 fixture setup failed: setup session revocation returned ${revocationFailures.join(", ")}.`,
      );
    }
  }

  if (!fixture) {
    throw new SeedStateError(
      "M004 fixture setup failed: fixture data was not assembled.",
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
    `M004 fixture setup failed: ${label} returned ${readFailureCode(result)}.`,
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
    throw new SeedStateError(`M004 fixture setup failed: missing ${label}.`);
  }

  return value;
}

function readOptionalSecret(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SeedStateError("M004 fixture setup failed: invalid optional secret.");
  }

  return value;
}

function readFailureCode(result: { ok: false; code: string }) {
  return result.code;
}
