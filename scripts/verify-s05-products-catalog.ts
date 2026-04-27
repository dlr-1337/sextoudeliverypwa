import "dotenv/config";

import { randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { fileTypeFromBuffer } from "file-type";

import {
  CategoryType,
  EstablishmentStatus,
  ProductStatus,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/client";
import { ADMIN_ACTION_IDLE_STATE } from "../src/modules/admin/action-state";
import type { AdminActionState } from "../src/modules/admin/action-state";
import { createAdminActionCore } from "../src/modules/admin/action-core";
import { createAuthServiceCore, type AuthServiceClient } from "../src/modules/auth/service-core";
import type { AuthSessionContext } from "../src/modules/auth/types";
import { createCatalogServiceCore, type CatalogServiceClient } from "../src/modules/catalog/service-core";
import { createCategoryServiceCore, type CategoryServiceClient } from "../src/modules/categories/service-core";
import {
  createEstablishmentServiceCore,
  type EstablishmentServiceClient,
} from "../src/modules/establishments/service-core";
import { MERCHANT_ACTION_IDLE_STATE } from "../src/modules/merchant/action-state";
import type { MerchantActionState } from "../src/modules/merchant/action-state";
import { createMerchantActionCore } from "../src/modules/merchant/action-core";
import {
  createMerchantServiceCore,
  type MerchantServiceClient,
} from "../src/modules/merchant/service-core";
import { PRODUCT_ACTION_IDLE_STATE } from "../src/modules/products/action-state";
import type { ProductActionState } from "../src/modules/products/action-state";
import { createProductActionCore } from "../src/modules/products/action-core";
import {
  createProductPhotoUploadCore,
  type ProductPhotoUploadResult,
} from "../src/modules/products/photo-upload-core";
import {
  createProductServiceCore,
  type ProductDto,
  type ProductServiceClient,
} from "../src/modules/products/service-core";
import {
  createUploadServiceCore,
  type UploadStorage,
} from "../src/modules/uploads/service-core";
import {
  createPrismaClient,
  formatSafeError,
  SeedStateError,
} from "../prisma/seed";

const SMOKE_AUTH_CONFIG = {
  authSecret: "s05-smoke-session-secret-0123456789",
  sessionCookieName: "s05_smoke_session",
  sessionMaxAgeDays: 1,
  sessionMaxAgeSeconds: 24 * 60 * 60,
  secureCookies: false,
};

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

async function verifyS05ProductsCatalog() {
  const prisma = createPrismaClient();
  const auth = createAuthServiceCore({
    db: prisma as unknown as AuthServiceClient,
    config: SMOKE_AUTH_CONFIG,
    enums: {
      establishmentStatus: EstablishmentStatus,
      userRole: UserRole,
      userStatus: UserStatus,
    },
  });
  const categoryService = createCategoryServiceCore({
    db: prisma as unknown as CategoryServiceClient,
    enums: {
      categoryType: CategoryType,
    },
  });
  const establishmentService = createEstablishmentServiceCore({
    db: prisma as unknown as EstablishmentServiceClient,
    enums: {
      establishmentStatus: EstablishmentStatus,
    },
  });
  const merchantService = createMerchantServiceCore({
    db: prisma as unknown as MerchantServiceClient,
    enums: {
      categoryType: CategoryType,
      establishmentStatus: EstablishmentStatus,
    },
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
  let uploadRoot: string | null = null;

  try {
    const activeAdminCount = await prisma.user.count({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    if (activeAdminCount < 1) {
      throw new SeedStateError(
        `S05 products/catalog smoke failed: expected active admin count >= 1, found ${activeAdminCount}.`,
      );
    }

    const establishmentCategory = await firstActiveCategory(
      categoryService,
      "ESTABLISHMENT",
    );
    const productCategory = await firstActiveCategory(categoryService, "PRODUCT");
    const adminSessionToken = await loginSeedAdmin(auth);
    issuedSessionTokens.push(adminSessionToken);

    const adminActions = createAdminActionCore({
      categoryService,
      establishmentService,
      readSessionCookie: () => adminSessionToken,
      requireAdminSession: (rawToken) => requireRoleSession(auth, rawToken, UserRole.ADMIN),
      revalidatePath: () => undefined,
    });

    const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const smokePassword = `Sextou-${runId}-Senha!42`;
    const pendingMerchant = await registerSmokeMerchant(auth, {
      email: `s05-pending-${runId}@example.invalid`,
      establishmentName: `S05 Smoke Pendente ${runId}`,
      name: "Smoke Comerciante Pendente S05",
      password: smokePassword,
    });
    issuedSessionTokens.push(pendingMerchant.sessionToken);

    const activeMerchant = await registerSmokeMerchant(auth, {
      email: `s05-active-${runId}@example.invalid`,
      establishmentName: `S05 Smoke Catalogo ${runId}`,
      name: "Smoke Comerciante Ativo S05",
      password: smokePassword,
    });
    issuedSessionTokens.push(activeMerchant.sessionToken);

    const otherMerchant = await registerSmokeMerchant(auth, {
      email: `s05-other-${runId}@example.invalid`,
      establishmentName: `S05 Smoke Outro ${runId}`,
      name: "Smoke Comerciante Outro S05",
      password: smokePassword,
    });
    issuedSessionTokens.push(otherMerchant.sessionToken);

    const customer = await auth.registerCustomer({
      email: `s05-customer-${runId}@example.invalid`,
      name: "Smoke Cliente S05",
      password: smokePassword,
      phone: "11988887777",
    });

    if (!customer.ok) {
      throw new SeedStateError(
        `S05 products/catalog smoke failed: customer registration returned ${customer.code}.`,
      );
    }

    issuedSessionTokens.push(customer.data.sessionToken);

    const pendingActions = createProductActions(
      auth,
      productService,
      pendingMerchant.sessionToken,
    );
    const pendingProductRejected = await assertProductActionError(
      await pendingActions.createProductAction(
        PRODUCT_ACTION_IDLE_STATE,
        productForm({
          categoryId: productCategory.id,
          description: "Produto negado para loja pendente.",
          name: `Produto Pendente S05 ${runId}`,
          price: "12.50",
        }),
      ),
      "pending product mutation",
    );

    await assertAdminActionSuccess(
      await adminActions.approveEstablishmentAction(
        ADMIN_ACTION_IDLE_STATE,
        idForm(activeMerchant.establishmentId),
      ),
      "primary establishment approve",
    );
    await assertAdminActionSuccess(
      await adminActions.approveEstablishmentAction(
        ADMIN_ACTION_IDLE_STATE,
        idForm(otherMerchant.establishmentId),
      ),
      "second establishment approve",
    );

    const activeMerchantActions = createMerchantActions(
      auth,
      merchantService,
      activeMerchant.sessionToken,
    );
    await assertMerchantActionSuccess(
      await activeMerchantActions.updateMerchantProfileAction(
        MERCHANT_ACTION_IDLE_STATE,
        profileForm({
          addressLine1: "Rua Smoke S05, 42",
          categoryId: establishmentCategory.id,
          city: "São Paulo",
          deliveryFee: "7.90",
          description: "Loja ativa criada pelo smoke S05.",
          minimumOrder: "20.00",
          name: `000 Smoke Catálogo S05 ${runId}`,
          phone: "1133334444",
          state: "SP",
          whatsapp: "11999999999",
        }),
      ),
      "primary profile update",
    );

    const activeActions = createProductActions(
      auth,
      productService,
      activeMerchant.sessionToken,
    );
    const otherActions = createProductActions(
      auth,
      productService,
      otherMerchant.sessionToken,
    );
    const customerActions = createProductActions(
      auth,
      productService,
      customer.data.sessionToken,
    );

    const createdState = await activeActions.createProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({
        categoryId: productCategory.id,
        description: "Produto ativo criado pelo smoke S05.",
        establishmentId: pendingMerchant.establishmentId,
        imageUrl: "/uploads/products/forged/photos/forged.png",
        name: `Produto Smoke S05 ${runId}`,
        ownerId: pendingMerchant.userId,
        price: "19,90",
        slug: "slug-forjado-s05",
        status: "ARCHIVED",
      }),
    );
    await assertProductActionSuccess(createdState, "active product create");

    if (!createdState.productId) {
      throw new SeedStateError(
        "S05 products/catalog smoke failed: product create did not return product id.",
      );
    }

    const productId = createdState.productId;
    const createdProduct = await assertOwnedProduct(
      productService,
      activeMerchant.userId,
      productId,
      "created product read",
    );
    const initialProductSlug = createdProduct.slug;

    const forgedCreateIgnored =
      createdProduct.establishmentId === activeMerchant.establishmentId &&
      createdProduct.categoryId === productCategory.id &&
      createdProduct.status === "ACTIVE" &&
      createdProduct.imageUrl === null &&
      createdProduct.slug !== "slug-forjado-s05";

    if (!forgedCreateIgnored) {
      throw new SeedStateError(
        "S05 products/catalog smoke failed: forged authority fields affected product create.",
      );
    }

    const updatedState = await activeActions.updateProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({
        categoryId: productCategory.id,
        description: "Produto editado pelo smoke S05.",
        establishmentId: pendingMerchant.establishmentId,
        imageUrl: "/uploads/products/forged/photos/edited.png",
        name: `Produto Smoke Editado S05 ${runId}`,
        ownerId: pendingMerchant.userId,
        price: "21.40",
        productId,
        slug: "slug-editado-forjado-s05",
        status: "ARCHIVED",
      }),
    );
    await assertProductActionSuccess(updatedState, "active product update");

    const updatedProduct = await assertOwnedProduct(
      productService,
      activeMerchant.userId,
      productId,
      "updated product read",
    );
    const forgedUpdateIgnored =
      updatedProduct.establishmentId === activeMerchant.establishmentId &&
      updatedProduct.status === "ACTIVE" &&
      updatedProduct.slug === initialProductSlug &&
      updatedProduct.imageUrl === null &&
      updatedProduct.name === `Produto Smoke Editado S05 ${runId}`;

    if (!forgedUpdateIgnored) {
      throw new SeedStateError(
        "S05 products/catalog smoke failed: forged authority fields affected product update.",
      );
    }

    uploadRoot = await mkdtemp(path.join(os.tmpdir(), "s05-products-upload-"));
    const uploadService = createUploadServiceCore({
      config: {
        driver: "local",
        maxBytes: 1024 * 1024,
        publicBasePath: "/uploads",
        publicBaseUrl: "http://localhost:3000/uploads",
        uploadDir: uploadRoot,
      },
      detectFileType: fileTypeFromBuffer,
      randomUUID,
      storage: createSmokeUploadStorage(uploadRoot),
    });
    const activePhotoCore = createProductPhotoUploadCore({
      productService,
      readSessionCookie: () => activeMerchant.sessionToken,
      requireMerchantSession: (rawToken) => requireRoleSession(auth, rawToken, UserRole.MERCHANT),
      revalidatePath: () => undefined,
      uploadService,
    });
    const pendingPhotoCore = createProductPhotoUploadCore({
      productService,
      readSessionCookie: () => pendingMerchant.sessionToken,
      requireMerchantSession: (rawToken) => requireRoleSession(auth, rawToken, UserRole.MERCHANT),
      revalidatePath: () => undefined,
      uploadService,
    });
    const otherPhotoCore = createProductPhotoUploadCore({
      productService,
      readSessionCookie: () => otherMerchant.sessionToken,
      requireMerchantSession: (rawToken) => requireRoleSession(auth, rawToken, UserRole.MERCHANT),
      revalidatePath: () => undefined,
      uploadService,
    });

    const pendingPhotoRejected = assertPhotoUploadFailure(
      await pendingPhotoCore.uploadProductPhoto(productId, productPhotoForm()),
      "OPERATION_NOT_ALLOWED",
      "pending photo upload",
    );
    const photoStored = await assertPhotoUploadSuccess(
      await activePhotoCore.uploadProductPhoto(productId, productPhotoForm()),
      productId,
      uploadRoot,
    );
    const productWithPhoto = await assertOwnedProduct(
      productService,
      activeMerchant.userId,
      productId,
      "product photo read",
    );

    if (!productWithPhoto.imageUrl?.startsWith(`/uploads/products/${productId}/photos/`)) {
      throw new SeedStateError(
        "S05 products/catalog smoke failed: product image URL did not persist under the product photo scope.",
      );
    }

    const crossOwnerReadRejected = await assertProductServiceFailure(
      await productService.getOwnedProductForOwner(otherMerchant.userId, { productId }),
      "NOT_FOUND",
      "cross-owner product read",
    );
    const crossOwnerMutationRejected = await assertProductActionError(
      await otherActions.updateProductAction(
        PRODUCT_ACTION_IDLE_STATE,
        productForm({
          description: "Tentativa de outro lojista.",
          name: `Produto Invadido S05 ${runId}`,
          price: "22.00",
          productId,
        }),
      ),
      "cross-owner product mutation",
    );
    const crossOwnerPhotoRejected = assertPhotoUploadFailure(
      await otherPhotoCore.uploadProductPhoto(productId, productPhotoForm()),
      "NOT_FOUND",
      "cross-owner photo upload",
    );
    const wrongRoleRejected = await assertProductActionError(
      await customerActions.createProductAction(
        PRODUCT_ACTION_IDLE_STATE,
        productForm({
          categoryId: productCategory.id,
          description: "Cliente não pode cadastrar produto.",
          name: `Produto Cliente S05 ${runId}`,
          price: "10.00",
        }),
      ),
      "customer product mutation",
    );

    const activeCatalog = await assertCatalogVisible(
      catalogService,
      activeMerchant.slug,
      initialProductSlug,
      "active catalog visibility",
    );

    await assertProductActionSuccess(
      await activeActions.pauseProductAction(
        PRODUCT_ACTION_IDLE_STATE,
        idForm(productId),
      ),
      "product pause",
    );
    const pauseHidden = await assertCatalogProductHidden(
      catalogService,
      activeMerchant.slug,
      initialProductSlug,
      "paused product visibility",
    );

    await assertProductActionSuccess(
      await activeActions.archiveProductAction(
        PRODUCT_ACTION_IDLE_STATE,
        idForm(productId),
      ),
      "product archive",
    );
    const archiveHidden = await assertCatalogProductHidden(
      catalogService,
      activeMerchant.slug,
      initialProductSlug,
      "archived product visibility",
    );

    await assertAdminActionSuccess(
      await adminActions.blockEstablishmentAction(
        ADMIN_ACTION_IDLE_STATE,
        idForm(activeMerchant.establishmentId),
      ),
      "establishment block",
    );
    const blockedMutationRejected = await assertProductActionError(
      await activeActions.createProductAction(
        PRODUCT_ACTION_IDLE_STATE,
        productForm({
          categoryId: productCategory.id,
          description: "Produto negado para loja bloqueada.",
          name: `Produto Bloqueado S05 ${runId}`,
          price: "14.00",
        }),
      ),
      "blocked product mutation",
    );
    const blockedHidden = await assertStoreHidden(
      catalogService,
      activeMerchant.slug,
      "blocked store visibility",
    );

    await assertAdminActionSuccess(
      await adminActions.reactivateEstablishmentAction(
        ADMIN_ACTION_IDLE_STATE,
        idForm(activeMerchant.establishmentId),
      ),
      "establishment reactivate",
    );
    await assertAdminActionSuccess(
      await adminActions.inactivateEstablishmentAction(
        ADMIN_ACTION_IDLE_STATE,
        idForm(activeMerchant.establishmentId),
      ),
      "establishment inactivate",
    );
    const inactiveMutationRejected = await assertProductActionError(
      await activeActions.createProductAction(
        PRODUCT_ACTION_IDLE_STATE,
        productForm({
          categoryId: productCategory.id,
          description: "Produto negado para loja inativa.",
          name: `Produto Inativo S05 ${runId}`,
          price: "15.00",
        }),
      ),
      "inactive product mutation",
    );
    const inactiveHidden = await assertStoreHidden(
      catalogService,
      activeMerchant.slug,
      "inactive store visibility",
    );

    console.info(
      `S05 products/catalog smoke ok: activeAdmins=${activeAdminCount}; merchants=3; productCreated=${String(Boolean(createdState.productId))}; productUpdated=${String(updatedProduct.name.includes("Editado"))}; photoStored=${String(photoStored)}; forgedAuthorityIgnored=${String(forgedCreateIgnored && forgedUpdateIgnored)}; pendingRejected=${String(pendingProductRejected && pendingPhotoRejected)}; wrongRoleRejected=${String(wrongRoleRejected)}; crossOwnerRejected=${String(crossOwnerReadRejected && crossOwnerMutationRejected && crossOwnerPhotoRejected)}; publicActiveOnly=${String(activeCatalog)}; pauseHidden=${String(pauseHidden)}; archiveHidden=${String(archiveHidden)}; blockedHidden=${String(blockedHidden && blockedMutationRejected)}; inactiveHidden=${String(inactiveHidden && inactiveMutationRejected)}; safeOutputRedaction=true.`,
    );
  } finally {
    await revokeIssuedSessions(auth, issuedSessionTokens);
    await prisma.$disconnect();

    if (uploadRoot) {
      await rm(uploadRoot, { force: true, recursive: true });
    }
  }
}

async function firstActiveCategory(
  categoryService: ReturnType<typeof createCategoryServiceCore>,
  type: "ESTABLISHMENT" | "PRODUCT",
) {
  const categories = await categoryService.listByType({
    includeInactive: false,
    limit: 1,
    type,
  });

  if (!categories.ok) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${type.toLowerCase()} category lookup returned ${categories.code}.`,
    );
  }

  const [category] = categories.data;

  if (!category) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: expected at least one active ${type.toLowerCase()} category.`,
    );
  }

  return category;
}

async function loginSeedAdmin(auth: ReturnType<typeof createAuthServiceCore>) {
  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL;
  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!seedAdminEmail || !seedAdminPassword) {
    throw new SeedStateError(
      "S05 products/catalog smoke failed: missing seed admin credentials for guarded action proof.",
    );
  }

  const login = await auth.login({
    email: seedAdminEmail,
    next: "/admin",
    password: seedAdminPassword,
  });

  if (!login.ok) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: seeded admin login returned ${login.code}.`,
    );
  }

  if (login.data.user.role !== UserRole.ADMIN) {
    throw new SeedStateError(
      "S05 products/catalog smoke failed: seeded login was not admin.",
    );
  }

  return login.data.sessionToken;
}

async function registerSmokeMerchant(
  auth: ReturnType<typeof createAuthServiceCore>,
  input: {
    email: string;
    establishmentName: string;
    name: string;
    password: string;
  },
) {
  const merchant = await auth.registerMerchant({
    email: input.email,
    establishmentName: input.establishmentName,
    establishmentPhone: "1133334444",
    name: input.name,
    password: input.password,
    phone: "11999999999",
  });

  if (!merchant.ok) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: merchant registration returned ${merchant.code}.`,
    );
  }

  return {
    establishmentId: merchant.data.establishment.id,
    sessionToken: merchant.data.sessionToken,
    slug: merchant.data.establishment.slug,
    userId: merchant.data.user.id,
  };
}

function createMerchantActions(
  auth: ReturnType<typeof createAuthServiceCore>,
  merchantService: ReturnType<typeof createMerchantServiceCore>,
  sessionToken: string,
) {
  return createMerchantActionCore({
    merchantService,
    readSessionCookie: () => sessionToken,
    requireMerchantSession: (rawToken) => requireRoleSession(auth, rawToken, UserRole.MERCHANT),
    revalidatePath: () => undefined,
  });
}

function createProductActions(
  auth: ReturnType<typeof createAuthServiceCore>,
  productService: ReturnType<typeof createProductServiceCore>,
  sessionToken: string,
) {
  return createProductActionCore({
    productService,
    readSessionCookie: () => sessionToken,
    requireMerchantSession: (rawToken) => requireRoleSession(auth, rawToken, UserRole.MERCHANT),
    revalidatePath: () => undefined,
  });
}

async function requireRoleSession(
  auth: ReturnType<typeof createAuthServiceCore>,
  rawToken: unknown,
  role: UserRole,
): Promise<AuthSessionContext> {
  const session = await auth.getSessionByToken(rawToken, {
    touchLastUsedAt: false,
  });

  if (!session.ok || session.data.user.role !== role) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${role.toLowerCase()} session rejected.`,
    );
  }

  return session.data;
}

async function assertAdminActionSuccess(state: AdminActionState, label: string) {
  assertNoSensitiveText(JSON.stringify(state));

  if (state.status !== "success") {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} returned action state ${state.status}.`,
    );
  }
}

async function assertMerchantActionSuccess(
  state: MerchantActionState,
  label: string,
) {
  assertNoSensitiveText(JSON.stringify(state));

  if (state.status !== "success") {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} returned action state ${state.status}.`,
    );
  }
}

async function assertProductActionSuccess(
  state: ProductActionState,
  label: string,
) {
  assertNoSensitiveText(JSON.stringify(state));

  if (state.status !== "success") {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} returned action state ${state.status}.`,
    );
  }
}

async function assertProductActionError(
  state: ProductActionState,
  label: string,
) {
  assertNoSensitiveText(JSON.stringify(state));

  if (state.status !== "error") {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} did not return an error state.`,
    );
  }

  return true;
}

async function assertOwnedProduct(
  productService: ReturnType<typeof createProductServiceCore>,
  ownerId: string,
  productId: string,
  label: string,
): Promise<ProductDto> {
  const product = await productService.getOwnedProductForOwner(ownerId, { productId });

  if (!product.ok) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} returned ${product.code}.`,
    );
  }

  assertNoSensitiveText(JSON.stringify(product.data));

  return product.data;
}

async function assertProductServiceFailure<TData>(
  result: { ok: true; data: TData } | { ok: false; code: string; message: string },
  expectedCode: string,
  label: string,
) {
  assertNoSensitiveText(JSON.stringify(result));

  if (result.ok || result.code !== expectedCode) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} did not return ${expectedCode}.`,
    );
  }

  return true;
}

async function assertCatalogVisible(
  catalogService: ReturnType<typeof createCatalogServiceCore>,
  establishmentSlug: string,
  productSlug: string,
  label: string,
) {
  const list = await catalogService.listActiveStores({ limit: 100 });

  if (!list.ok) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} list returned ${list.code}.`,
    );
  }

  assertNoSensitiveText(JSON.stringify(list.data));

  if (!list.data.some((store) => store.slug === establishmentSlug)) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} did not include the active store list entry.`,
    );
  }

  const detail = await catalogService.getActiveStoreCatalog({ slug: establishmentSlug });

  if (!detail.ok) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} detail returned ${detail.code}.`,
    );
  }

  assertNoSensitiveText(JSON.stringify(detail.data));

  if (!detail.data.products.some((product) => product.slug === productSlug)) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} did not include the active product.`,
    );
  }

  return true;
}

async function assertCatalogProductHidden(
  catalogService: ReturnType<typeof createCatalogServiceCore>,
  establishmentSlug: string,
  productSlug: string,
  label: string,
) {
  const detail = await catalogService.getActiveStoreCatalog({ slug: establishmentSlug });

  if (!detail.ok) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} detail returned ${detail.code}.`,
    );
  }

  assertNoSensitiveText(JSON.stringify(detail.data));

  if (detail.data.products.some((product) => product.slug === productSlug)) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} still exposed a non-active product.`,
    );
  }

  return true;
}

async function assertStoreHidden(
  catalogService: ReturnType<typeof createCatalogServiceCore>,
  establishmentSlug: string,
  label: string,
) {
  const list = await catalogService.listActiveStores({ limit: 100 });

  if (!list.ok) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} list returned ${list.code}.`,
    );
  }

  assertNoSensitiveText(JSON.stringify(list.data));

  if (list.data.some((store) => store.slug === establishmentSlug)) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} still exposed the inactive store in public list.`,
    );
  }

  const detail = await catalogService.getActiveStoreCatalog({ slug: establishmentSlug });
  assertNoSensitiveText(JSON.stringify(detail));

  if (detail.ok || detail.code !== "NOT_FOUND") {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} detail did not return NOT_FOUND.`,
    );
  }

  return true;
}

async function assertPhotoUploadSuccess(
  result: ProductPhotoUploadResult,
  expectedProductId: string,
  uploadRoot: string,
) {
  assertNoSensitiveText(JSON.stringify(result));

  if (!result.ok) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: active photo upload returned ${result.code}.`,
    );
  }

  if (result.data.productId !== expectedProductId) {
    throw new SeedStateError(
      "S05 products/catalog smoke failed: photo upload persisted against the wrong product.",
    );
  }

  if (
    !result.data.imageUrl.startsWith(`/uploads/products/${expectedProductId}/photos/`) ||
    result.data.imageUrl.includes("produto-original") ||
    result.data.imageUrl.includes("..")
  ) {
    throw new SeedStateError(
      "S05 products/catalog smoke failed: photo upload returned an unsafe public path.",
    );
  }

  const relativePath = result.data.imageUrl.replace(/^\/uploads\//u, "");

  if (!(await fileExists(resolveUploadPath(uploadRoot, relativePath)))) {
    throw new SeedStateError(
      "S05 products/catalog smoke failed: photo upload did not persist a readable file.",
    );
  }

  return true;
}

function assertPhotoUploadFailure(
  result: ProductPhotoUploadResult,
  expectedCode: string,
  label: string,
) {
  assertNoSensitiveText(JSON.stringify(result));

  if (result.ok || result.code !== expectedCode) {
    throw new SeedStateError(
      `S05 products/catalog smoke failed: ${label} did not return ${expectedCode}.`,
    );
  }

  return true;
}

async function revokeIssuedSessions(
  auth: ReturnType<typeof createAuthServiceCore>,
  sessionTokens: string[],
) {
  for (const sessionToken of sessionTokens) {
    await auth.revokeSessionByToken(sessionToken);
  }
}

function productForm(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

function profileForm(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

function productPhotoForm(values: Record<string, string> = {}) {
  const formData = new FormData();
  const file = new Blob([PNG_BYTES], { type: "image/png" });

  formData.set("photo", file, "produto-original.png");

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

function idForm(id: string) {
  const formData = new FormData();
  formData.set("id", id);
  formData.set("productId", id);

  return formData;
}

function createSmokeUploadStorage(uploadRoot: string): UploadStorage {
  return {
    async deleteFile(relativePath) {
      await rm(resolveUploadPath(uploadRoot, relativePath));
    },
    async readFile(relativePath) {
      return readFile(resolveUploadPath(uploadRoot, relativePath));
    },
    async writeFile(relativePath, bytes) {
      const targetPath = resolveUploadPath(uploadRoot, relativePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, bytes, { flag: "wx" });
    },
  };
}

function resolveUploadPath(uploadRoot: string, relativePath: string) {
  const targetPath = path.resolve(uploadRoot, relativePath);

  if (!isPathInside(uploadRoot, targetPath)) {
    throw new SeedStateError(
      "S05 products/catalog smoke failed: upload storage path escaped the temporary root.",
    );
  }

  return targetPath;
}

async function fileExists(targetPath: string) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isPathInside(rootPath: string, targetPath: string) {
  const relativePath = path.relative(rootPath, targetPath);

  return (
    relativePath.length === 0 ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function assertNoSensitiveText(value: string) {
  if (
    /(AUTH_SECRET|DATABASE_URL|passwordHash|tokenHash|sessionToken|Prisma|argon2|raw upload|produto-original|file contents|upload root)/i.test(
      value,
    )
  ) {
    throw new SeedStateError(
      "S05 products/catalog smoke failed: a sensitive token appeared in a public payload.",
    );
  }
}

verifyS05ProductsCatalog().catch((error: unknown) => {
  console.error(`S05 products/catalog smoke failed: ${formatSafeError(error)}`);
  process.exitCode = 1;
});
