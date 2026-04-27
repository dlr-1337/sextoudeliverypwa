import "dotenv/config";

import { randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { fileTypeFromBuffer } from "file-type";

import {
  CategoryType,
  EstablishmentStatus,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/client";
import { ADMIN_ACTION_IDLE_STATE } from "../src/modules/admin/action-state";
import type { AdminActionState } from "../src/modules/admin/action-state";
import { createAdminActionCore } from "../src/modules/admin/action-core";
import { createAuthServiceCore, type AuthServiceClient } from "../src/modules/auth/service-core";
import type { AuthSessionContext } from "../src/modules/auth/types";
import { createCategoryServiceCore, type CategoryServiceClient } from "../src/modules/categories/service-core";
import {
  createEstablishmentServiceCore,
  type EstablishmentServiceClient,
  type EstablishmentStatusValue,
} from "../src/modules/establishments/service-core";
import { MERCHANT_ACTION_IDLE_STATE } from "../src/modules/merchant/action-state";
import type { MerchantActionState } from "../src/modules/merchant/action-state";
import { createMerchantActionCore } from "../src/modules/merchant/action-core";
import {
  createMerchantLogoUploadCore,
  type MerchantLogoUploadResult,
} from "../src/modules/merchant/logo-upload-core";
import {
  createMerchantServiceCore,
  type MerchantDashboardDto,
  type MerchantServiceClient,
} from "../src/modules/merchant/service-core";
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
  authSecret: "s04-smoke-session-secret-0123456789",
  sessionCookieName: "s04_smoke_session",
  sessionMaxAgeDays: 1,
  sessionMaxAgeSeconds: 24 * 60 * 60,
  secureCookies: false,
};

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

async function verifyS04Merchant() {
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
        `S04 merchant smoke failed: expected active admin count >= 1, found ${activeAdminCount}.`,
      );
    }

    const category = await firstActiveEstablishmentCategory(categoryService);
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
      email: `s04-pending-${runId}@example.invalid`,
      establishmentName: `Smoke Pendente S04 ${runId}`,
      name: "Smoke Comerciante Pendente S04",
      password: smokePassword,
    });
    issuedSessionTokens.push(pendingMerchant.sessionToken);

    const activeMerchant = await registerSmokeMerchant(auth, {
      email: `s04-active-${runId}@example.invalid`,
      establishmentName: `Smoke Ativo S04 ${runId}`,
      name: "Smoke Comerciante Ativo S04",
      password: smokePassword,
    });
    issuedSessionTokens.push(activeMerchant.sessionToken);

    const pendingDashboard = await assertDashboardStatus(
      merchantService,
      pendingMerchant.userId,
      "PENDING",
      "pending dashboard read",
    );
    const pendingActions = createMerchantActions(
      auth,
      merchantService,
      pendingMerchant.sessionToken,
    );
    const pendingMutationRejected = await assertMerchantActionError(
      await pendingActions.updateMerchantProfileAction(
        MERCHANT_ACTION_IDLE_STATE,
        profileForm({ name: "Tentativa Pendente S04" }),
      ),
      "pending profile mutation",
    );

    await assertActionSuccess(
      await adminActions.approveEstablishmentAction(
        ADMIN_ACTION_IDLE_STATE,
        idForm(activeMerchant.establishmentId),
      ),
      "establishment approve",
    );
    await assertDashboardStatus(
      merchantService,
      activeMerchant.userId,
      "ACTIVE",
      "approved dashboard read",
    );

    const activeActions = createMerchantActions(
      auth,
      merchantService,
      activeMerchant.sessionToken,
    );
    const updatedName = `Smoke Loja Atualizada S04 ${runId}`;
    await assertMerchantActionSuccess(
      await activeActions.updateMerchantProfileAction(
        MERCHANT_ACTION_IDLE_STATE,
        profileForm({
          addressLine1: "Rua Smoke S04, 42",
          categoryId: category.id,
          city: "São Paulo",
          deliveryFee: "8,90",
          description: "Loja atualizada pelo smoke S04.",
          id: pendingMerchant.establishmentId,
          logoUrl: "/uploads/forged-owner-logo.png",
          minimumOrder: "25.00",
          name: updatedName,
          ownerId: pendingMerchant.userId,
          phone: "1133334444",
          slug: "slug-forjado-s04",
          state: "SP",
          status: "BLOCKED",
          whatsapp: "11999999999",
        }),
      ),
      "active profile update",
    );

    const afterProfile = await assertDashboardStatus(
      merchantService,
      activeMerchant.userId,
      "ACTIVE",
      "profile dashboard read",
    );
    const pendingAfterForge = await assertDashboardStatus(
      merchantService,
      pendingMerchant.userId,
      "PENDING",
      "forged owner dashboard read",
    );
    const forgedFieldsIgnored =
      afterProfile.establishment.id === activeMerchant.establishmentId &&
      afterProfile.establishment.name === updatedName &&
      afterProfile.establishment.categoryId === category.id &&
      afterProfile.establishment.slug === activeMerchant.slug &&
      pendingAfterForge.establishment.name === pendingDashboard.establishment.name;

    if (!forgedFieldsIgnored) {
      throw new SeedStateError(
        "S04 merchant smoke failed: forged owner/status fields affected protected data.",
      );
    }

    uploadRoot = await mkdtemp(path.join(os.tmpdir(), "s04-merchant-upload-"));
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
    const activeLogoCore = createMerchantLogoUploadCore({
      merchantService,
      readSessionCookie: () => activeMerchant.sessionToken,
      requireMerchantSession: (rawToken) => requireRoleSession(auth, rawToken, UserRole.MERCHANT),
      uploadService,
    });
    const pendingLogoCore = createMerchantLogoUploadCore({
      merchantService,
      readSessionCookie: () => pendingMerchant.sessionToken,
      requireMerchantSession: (rawToken) => requireRoleSession(auth, rawToken, UserRole.MERCHANT),
      uploadService,
    });

    const pendingLogoRejected = assertLogoUploadFailure(
      await pendingLogoCore.uploadMerchantLogo(logoForm()),
      "INACTIVE_STATUS",
      "pending logo mutation",
    );

    const logoResult = await activeLogoCore.uploadMerchantLogo(
      logoForm({
        establishmentId: pendingMerchant.establishmentId,
        ownerId: pendingMerchant.userId,
        status: "PENDING",
      }),
    );
    const logoStored = await assertLogoUploadSuccess(
      logoResult,
      activeMerchant.establishmentId,
      uploadRoot,
    );

    await assertActionSuccess(
      await adminActions.blockEstablishmentAction(
        ADMIN_ACTION_IDLE_STATE,
        idForm(activeMerchant.establishmentId),
      ),
      "establishment block",
    );
    await assertDashboardStatus(
      merchantService,
      activeMerchant.userId,
      "BLOCKED",
      "blocked dashboard read",
    );
    const blockedMutationRejected = await assertMerchantActionError(
      await activeActions.updateMerchantProfileAction(
        MERCHANT_ACTION_IDLE_STATE,
        profileForm({ name: "Tentativa Bloqueada S04" }),
      ),
      "blocked profile mutation",
    );

    await assertActionSuccess(
      await adminActions.reactivateEstablishmentAction(
        ADMIN_ACTION_IDLE_STATE,
        idForm(activeMerchant.establishmentId),
      ),
      "establishment reactivate",
    );
    await assertActionSuccess(
      await adminActions.inactivateEstablishmentAction(
        ADMIN_ACTION_IDLE_STATE,
        idForm(activeMerchant.establishmentId),
      ),
      "establishment inactivate",
    );
    await assertDashboardStatus(
      merchantService,
      activeMerchant.userId,
      "INACTIVE",
      "inactive dashboard read",
    );
    const inactiveLogoRejected = assertLogoUploadFailure(
      await activeLogoCore.uploadMerchantLogo(logoForm()),
      "INACTIVE_STATUS",
      "inactive logo mutation",
    );

    console.info(
      `S04 merchant smoke ok: merchants=2; pendingRead=${String(pendingDashboard.establishment.status === "PENDING")}; pendingMutationRejected=${String(pendingMutationRejected && pendingLogoRejected)}; approvedProfileUpdated=${String(afterProfile.establishment.name === updatedName)}; logoStored=${String(logoStored)}; forgedOwnerStatusIgnored=${String(forgedFieldsIgnored)}; blockedMutationRejected=${String(blockedMutationRejected)}; inactiveMutationRejected=${String(inactiveLogoRejected)}; activeAdmins=${activeAdminCount}.`,
    );
  } finally {
    await revokeIssuedSessions(auth, issuedSessionTokens);
    await prisma.$disconnect();

    if (uploadRoot) {
      await rm(uploadRoot, { force: true, recursive: true });
    }
  }
}

async function firstActiveEstablishmentCategory(
  categoryService: ReturnType<typeof createCategoryServiceCore>,
) {
  const categories = await categoryService.listByType({
    includeInactive: false,
    limit: 1,
    type: "ESTABLISHMENT",
  });

  if (!categories.ok) {
    throw new SeedStateError(
      `S04 merchant smoke failed: category lookup returned ${categories.code}.`,
    );
  }

  const [category] = categories.data;

  if (!category) {
    throw new SeedStateError(
      "S04 merchant smoke failed: expected at least one active establishment category.",
    );
  }

  return category;
}

async function loginSeedAdmin(auth: ReturnType<typeof createAuthServiceCore>) {
  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL;
  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!seedAdminEmail || !seedAdminPassword) {
    throw new SeedStateError(
      "S04 merchant smoke failed: missing seed admin credentials for guarded action proof.",
    );
  }

  const login = await auth.login({
    email: seedAdminEmail,
    next: "/admin",
    password: seedAdminPassword,
  });

  if (!login.ok) {
    throw new SeedStateError(
      `S04 merchant smoke failed: seeded admin login returned ${login.code}.`,
    );
  }

  if (login.data.user.role !== UserRole.ADMIN) {
    throw new SeedStateError("S04 merchant smoke failed: seeded login was not admin.");
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
      `S04 merchant smoke failed: merchant registration returned ${merchant.code}.`,
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
      `S04 merchant smoke failed: ${role.toLowerCase()} session rejected.`,
    );
  }

  return session.data;
}

async function assertDashboardStatus(
  merchantService: ReturnType<typeof createMerchantServiceCore>,
  ownerId: string,
  expectedStatus: EstablishmentStatusValue,
  label: string,
): Promise<MerchantDashboardDto> {
  const dashboard = await merchantService.getDashboardForOwner(ownerId);

  if (!dashboard.ok) {
    throw new SeedStateError(
      `S04 merchant smoke failed: ${label} returned ${dashboard.code}.`,
    );
  }

  assertNoSensitiveText(JSON.stringify(dashboard.data));

  if (dashboard.data.establishment.status !== expectedStatus) {
    throw new SeedStateError(
      `S04 merchant smoke failed: ${label} status was ${dashboard.data.establishment.status}, expected ${expectedStatus}.`,
    );
  }

  return dashboard.data;
}

async function assertActionSuccess(state: AdminActionState, label: string) {
  assertNoSensitiveText(JSON.stringify(state));

  if (state.status !== "success") {
    throw new SeedStateError(
      `S04 merchant smoke failed: ${label} returned action state ${state.status}.`,
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
      `S04 merchant smoke failed: ${label} returned action state ${state.status}.`,
    );
  }
}

async function assertMerchantActionError(
  state: MerchantActionState,
  label: string,
) {
  assertNoSensitiveText(JSON.stringify(state));

  if (state.status !== "error") {
    throw new SeedStateError(
      `S04 merchant smoke failed: ${label} did not return an error state.`,
    );
  }

  return true;
}

async function assertLogoUploadSuccess(
  result: MerchantLogoUploadResult,
  expectedEstablishmentId: string,
  uploadRoot: string,
) {
  assertNoSensitiveText(JSON.stringify(result));

  if (!result.ok) {
    throw new SeedStateError(
      `S04 merchant smoke failed: active logo upload returned ${result.code}.`,
    );
  }

  if (result.data.establishmentId !== expectedEstablishmentId) {
    throw new SeedStateError(
      "S04 merchant smoke failed: logo upload persisted against the wrong establishment.",
    );
  }

  if (
    !result.data.logoUrl.startsWith(
      `/uploads/establishments/${expectedEstablishmentId}/logos/`,
    ) ||
    result.data.logoUrl.includes("logo-original") ||
    result.data.logoUrl.includes("..")
  ) {
    throw new SeedStateError(
      "S04 merchant smoke failed: logo upload returned an unsafe public path.",
    );
  }

  const relativePath = result.data.logoUrl.replace(/^\/uploads\//u, "");

  if (!(await fileExists(resolveUploadPath(uploadRoot, relativePath)))) {
    throw new SeedStateError(
      "S04 merchant smoke failed: logo upload did not persist a readable file.",
    );
  }

  return true;
}

function assertLogoUploadFailure(
  result: MerchantLogoUploadResult,
  expectedCode: string,
  label: string,
) {
  assertNoSensitiveText(JSON.stringify(result));

  if (result.ok || result.code !== expectedCode) {
    throw new SeedStateError(
      `S04 merchant smoke failed: ${label} did not return ${expectedCode}.`,
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

function profileForm(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

function logoForm(values: Record<string, string> = {}) {
  const formData = new FormData();
  const file = new Blob([PNG_BYTES], { type: "image/png" });

  formData.set("logo", file, "logo-original.png");

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

function idForm(id: string) {
  const formData = new FormData();
  formData.set("id", id);

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
      "S04 merchant smoke failed: upload storage path escaped the temporary root.",
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
    /(AUTH_SECRET|DATABASE_URL|passwordHash|tokenHash|sessionToken|Prisma|argon2|raw upload|logo-original)/i.test(
      value,
    )
  ) {
    throw new SeedStateError(
      "S04 merchant smoke failed: a sensitive token appeared in a public payload.",
    );
  }
}

verifyS04Merchant().catch((error: unknown) => {
  console.error(`S04 merchant smoke failed: ${formatSafeError(error)}`);
  process.exitCode = 1;
});
