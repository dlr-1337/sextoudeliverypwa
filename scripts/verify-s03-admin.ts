import "dotenv/config";

import { randomUUID } from "node:crypto";

import {
  CategoryType,
  EstablishmentStatus,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/client";
import { ADMIN_ACTION_IDLE_STATE } from "../src/modules/admin/action-state";
import type { AdminActionState } from "../src/modules/admin/action-state";
import { createAdminActionCore } from "../src/modules/admin/action-core";
import {
  createAdminServiceCore,
  type AdminServiceClient,
} from "../src/modules/admin/service-core";
import {
  createAuthServiceCore,
  type AuthServiceClient,
} from "../src/modules/auth/service-core";
import {
  createCategoryServiceCore,
  type CategoryServiceClient,
} from "../src/modules/categories/service-core";
import {
  createEstablishmentServiceCore,
  type EstablishmentServiceClient,
  type EstablishmentStatusValue,
} from "../src/modules/establishments/service-core";
import {
  createPrismaClient,
  formatSafeError,
  SeedStateError,
} from "../prisma/seed";

const SMOKE_AUTH_CONFIG = {
  authSecret: "s03-smoke-session-secret-0123456789",
  sessionCookieName: "s03_smoke_session",
  sessionMaxAgeDays: 1,
  sessionMaxAgeSeconds: 24 * 60 * 60,
  secureCookies: false,
};

async function verifyS03Admin() {
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
  const adminService = createAdminServiceCore({
    db: prisma as unknown as AdminServiceClient,
    enums: {
      categoryType: CategoryType,
      establishmentStatus: EstablishmentStatus,
      userRole: UserRole,
      userStatus: UserStatus,
    },
  });
  const issuedSessionTokens: string[] = [];

  try {
    const activeAdminCount = await prisma.user.count({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    if (activeAdminCount < 1) {
      throw new SeedStateError(
        `S03 admin smoke failed: expected active admin count >= 1, found ${activeAdminCount}.`,
      );
    }

    const adminSessionToken = await loginSeedAdmin(auth);
    issuedSessionTokens.push(adminSessionToken);

    const actions = createAdminActionCore({
      readSessionCookie: () => adminSessionToken,
      requireAdminSession: async (rawToken) => {
        const session = await auth.getSessionByToken(rawToken, {
          touchLastUsedAt: false,
        });

        if (!session.ok || session.data.user.role !== UserRole.ADMIN) {
          throw new Error("Smoke admin session rejected.");
        }

        return session.data;
      },
      categoryService,
      establishmentService,
      revalidatePath: () => undefined,
    });

    const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const smokePassword = `Sextou-${runId}-Senha!42`;

    const customer = await auth.registerCustomer({
      name: "Smoke Cliente S03",
      email: `s03-customer-${runId}@example.invalid`,
      password: smokePassword,
      phone: "11988887777",
    });

    if (!customer.ok) {
      throw new SeedStateError(
        `S03 admin smoke failed: customer registration returned ${customer.code}.`,
      );
    }

    issuedSessionTokens.push(customer.data.sessionToken);

    await assertCustomerLookup(adminService, customer.data.user.id);

    const establishmentCategory = await runCategoryCreate(
      actions.createCategoryAction,
      {
        description: "Categoria de lojas criada pelo smoke S03.",
        displayOrder: "7",
        name: `Smoke Estabelecimento S03 ${runId}`,
        type: "ESTABLISHMENT",
      },
      "establishment category create",
    );

    const duplicateCategory = await actions.createCategoryAction(
      ADMIN_ACTION_IDLE_STATE,
      categoryForm({
        description: "Duplicada propositalmente pelo smoke S03.",
        displayOrder: "8",
        name: `Smoke Estabelecimento S03 ${runId}`,
        type: "ESTABLISHMENT",
      }),
    );

    if (duplicateCategory.status !== "error") {
      throw new SeedStateError(
        "S03 admin smoke failed: duplicate category did not return an error state.",
      );
    }

    assertNoSensitiveText(JSON.stringify(duplicateCategory));

    await runCategoryCreate(
      actions.createCategoryAction,
      {
        description: "Categoria de produtos criada pelo smoke S03.",
        displayOrder: "9",
        name: `Smoke Produto S03 ${runId}`,
        type: "PRODUCT",
      },
      "product category create",
    );

    await assertActionSuccess(
      await actions.updateCategoryAction(
        ADMIN_ACTION_IDLE_STATE,
        categoryForm({
          description: "Categoria de lojas editada pelo smoke S03.",
          displayOrder: "10",
          id: establishmentCategory.id,
          name: `Smoke Estabelecimento S03 Editado ${runId}`,
        }),
      ),
      "category update",
    );
    await assertActionSuccess(
      await actions.inactivateCategoryAction(
        ADMIN_ACTION_IDLE_STATE,
        idForm(establishmentCategory.id),
      ),
      "category inactivate",
    );
    await assertCategoryActivity(categoryService, establishmentCategory.id, false);
    await assertActionSuccess(
      await actions.activateCategoryAction(
        ADMIN_ACTION_IDLE_STATE,
        idForm(establishmentCategory.id),
      ),
      "category reactivate",
    );
    await assertCategoryActivity(categoryService, establishmentCategory.id, true);

    const merchant = await auth.registerMerchant({
      name: "Smoke Comerciante S03",
      email: `s03-merchant-${runId}@example.invalid`,
      password: smokePassword,
      phone: "11999999999",
      establishmentName: `Smoke Sextou S03 ${runId}`,
      establishmentPhone: "1133334444",
    });

    if (!merchant.ok) {
      throw new SeedStateError(
        `S03 admin smoke failed: merchant registration returned ${merchant.code}.`,
      );
    }

    issuedSessionTokens.push(merchant.data.sessionToken);

    await prisma.establishment.update({
      where: { id: merchant.data.establishment.id },
      data: {
        addressLine1: "Rua Smoke S03, 42",
        categoryId: establishmentCategory.id,
        city: "São Paulo",
        deliveryFee: "6.50",
        description: "Loja de prova criada pelo smoke S03.",
        minimumOrder: "35.00",
        postalCode: "01000-000",
        state: "SP",
        whatsapp: "11999999999",
      },
      select: { id: true },
    });

    await assertDetailStatus(
      establishmentService,
      merchant.data.establishment.id,
      "PENDING",
    );
    await assertListContainsStatus(
      establishmentService,
      merchant.data.establishment.id,
      "PENDING",
    );

    await assertActionSuccess(
      await actions.approveEstablishmentAction(
        ADMIN_ACTION_IDLE_STATE,
        idForm(merchant.data.establishment.id),
      ),
      "establishment approve",
    );
    await assertDetailStatus(
      establishmentService,
      merchant.data.establishment.id,
      "ACTIVE",
    );
    await assertListContainsStatus(
      establishmentService,
      merchant.data.establishment.id,
      "ACTIVE",
    );
    await assertListExcludesStatus(
      establishmentService,
      merchant.data.establishment.id,
      "PENDING",
    );

    await assertActionSuccess(
      await actions.blockEstablishmentAction(
        ADMIN_ACTION_IDLE_STATE,
        idForm(merchant.data.establishment.id),
      ),
      "establishment block",
    );
    await assertDetailStatus(
      establishmentService,
      merchant.data.establishment.id,
      "BLOCKED",
    );
    await assertListContainsStatus(
      establishmentService,
      merchant.data.establishment.id,
      "BLOCKED",
    );
    await assertListExcludesStatus(
      establishmentService,
      merchant.data.establishment.id,
      "ACTIVE",
    );

    await assertActionSuccess(
      await actions.reactivateEstablishmentAction(
        ADMIN_ACTION_IDLE_STATE,
        idForm(merchant.data.establishment.id),
      ),
      "establishment reactivate",
    );
    await assertDetailStatus(
      establishmentService,
      merchant.data.establishment.id,
      "ACTIVE",
    );
    await assertListContainsStatus(
      establishmentService,
      merchant.data.establishment.id,
      "ACTIVE",
    );
    await assertListExcludesStatus(
      establishmentService,
      merchant.data.establishment.id,
      "BLOCKED",
    );

    await assertActionSuccess(
      await actions.inactivateEstablishmentAction(
        ADMIN_ACTION_IDLE_STATE,
        idForm(merchant.data.establishment.id),
      ),
      "establishment inactivate",
    );
    await assertDetailStatus(
      establishmentService,
      merchant.data.establishment.id,
      "INACTIVE",
    );
    await assertListContainsStatus(
      establishmentService,
      merchant.data.establishment.id,
      "INACTIVE",
    );
    await assertListExcludesStatus(
      establishmentService,
      merchant.data.establishment.id,
      "ACTIVE",
    );

    const dashboard = await adminService.getDashboard();

    if (!dashboard.ok) {
      throw new SeedStateError(
        `S03 admin smoke failed: dashboard returned ${dashboard.code}.`,
      );
    }

    console.info(
      `S03 admin smoke ok: activeAdmins=${activeAdminCount}; categoryTypes=ESTABLISHMENT,PRODUCT; duplicateCategory=handled; customerLookup=present; transitions=PENDING>ACTIVE>BLOCKED>ACTIVE>INACTIVE; counts=PENDING:${dashboard.data.establishmentCounts.PENDING},ACTIVE:${dashboard.data.establishmentCounts.ACTIVE},BLOCKED:${dashboard.data.establishmentCounts.BLOCKED},INACTIVE:${dashboard.data.establishmentCounts.INACTIVE}.`,
    );
  } finally {
    await revokeIssuedSessions(auth, issuedSessionTokens);
    await prisma.$disconnect();
  }
}

async function loginSeedAdmin(auth: ReturnType<typeof createAuthServiceCore>) {
  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL;
  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!seedAdminEmail || !seedAdminPassword) {
    throw new SeedStateError(
      "S03 admin smoke failed: missing seed admin credentials for guarded action proof.",
    );
  }

  const login = await auth.login({
    email: seedAdminEmail,
    password: seedAdminPassword,
    next: "/admin",
  });

  if (!login.ok) {
    throw new SeedStateError(
      `S03 admin smoke failed: seeded admin login returned ${login.code}.`,
    );
  }

  if (login.data.user.role !== UserRole.ADMIN) {
    throw new SeedStateError("S03 admin smoke failed: seeded login was not admin.");
  }

  return login.data.sessionToken;
}

async function assertCustomerLookup(
  adminService: ReturnType<typeof createAdminServiceCore>,
  customerId: string,
) {
  const customers = await adminService.listCustomers();

  if (!customers.ok) {
    throw new SeedStateError(
      `S03 admin smoke failed: customer lookup returned ${customers.code}.`,
    );
  }

  if (!customers.data.customers.some((customer) => customer.id === customerId)) {
    throw new SeedStateError(
      "S03 admin smoke failed: created customer was absent from admin lookup.",
    );
  }
}

async function runCategoryCreate(
  action: (previousState: AdminActionState, formData: FormData) => Promise<AdminActionState>,
  values: Record<string, string>,
  label: string,
) {
  const state = await action(ADMIN_ACTION_IDLE_STATE, categoryForm(values));
  await assertActionSuccess(state, label);

  if (!state.categoryId) {
    throw new SeedStateError(
      `S03 admin smoke failed: ${label} did not return category id.`,
    );
  }

  return { id: state.categoryId };
}

async function assertCategoryActivity(
  categoryService: ReturnType<typeof createCategoryServiceCore>,
  categoryId: string,
  isActive: boolean,
) {
  const categories = await categoryService.listByType({
    includeInactive: true,
    limit: 100,
    type: "ESTABLISHMENT",
  });

  if (!categories.ok) {
    throw new SeedStateError(
      `S03 admin smoke failed: category lookup returned ${categories.code}.`,
    );
  }

  const category = categories.data.find((item) => item.id === categoryId);

  if (!category || category.isActive !== isActive) {
    throw new SeedStateError(
      `S03 admin smoke failed: category active flag was not ${String(isActive)}.`,
    );
  }
}

async function assertActionSuccess(state: AdminActionState, label: string) {
  assertNoSensitiveText(JSON.stringify(state));

  if (state.status !== "success") {
    throw new SeedStateError(
      `S03 admin smoke failed: ${label} returned action state ${state.status}.`,
    );
  }
}

async function assertDetailStatus(
  establishmentService: ReturnType<typeof createEstablishmentServiceCore>,
  establishmentId: string,
  status: EstablishmentStatusValue,
) {
  const detail = await establishmentService.getById({ id: establishmentId });

  if (!detail.ok) {
    throw new SeedStateError(
      `S03 admin smoke failed: detail read returned ${detail.code}.`,
    );
  }

  assertNoSensitiveText(JSON.stringify(detail.data));

  if (detail.data.status !== status) {
    throw new SeedStateError(
      `S03 admin smoke failed: detail status was ${detail.data.status}, expected ${status}.`,
    );
  }
}

async function assertListContainsStatus(
  establishmentService: ReturnType<typeof createEstablishmentServiceCore>,
  establishmentId: string,
  status: EstablishmentStatusValue,
) {
  const list = await establishmentService.list({ limit: 50, status });

  if (!list.ok) {
    throw new SeedStateError(
      `S03 admin smoke failed: ${status} list returned ${list.code}.`,
    );
  }

  assertNoSensitiveText(JSON.stringify(list.data));

  if (!list.data.some((item) => item.id === establishmentId)) {
    throw new SeedStateError(
      `S03 admin smoke failed: ${status} list did not include expected establishment.`,
    );
  }
}

async function assertListExcludesStatus(
  establishmentService: ReturnType<typeof createEstablishmentServiceCore>,
  establishmentId: string,
  status: EstablishmentStatusValue,
) {
  const list = await establishmentService.list({ limit: 50, status });

  if (!list.ok) {
    throw new SeedStateError(
      `S03 admin smoke failed: ${status} exclusion list returned ${list.code}.`,
    );
  }

  if (list.data.some((item) => item.id === establishmentId)) {
    throw new SeedStateError(
      `S03 admin smoke failed: ${status} list still included transitioned establishment.`,
    );
  }
}

async function revokeIssuedSessions(
  auth: ReturnType<typeof createAuthServiceCore>,
  sessionTokens: string[],
) {
  for (const sessionToken of sessionTokens) {
    await auth.revokeSessionByToken(sessionToken);
  }
}

function categoryForm(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  if (!formData.has("description")) {
    formData.set("description", "");
  }

  if (!formData.has("displayOrder")) {
    formData.set("displayOrder", "");
  }

  return formData;
}

function idForm(id: string) {
  const formData = new FormData();
  formData.set("id", id);

  return formData;
}

function assertNoSensitiveText(value: string) {
  if (
    /(AUTH_SECRET|DATABASE_URL|passwordHash|tokenHash|sessionToken|Prisma|argon2)/i.test(
      value,
    )
  ) {
    throw new SeedStateError(
      "S03 admin smoke failed: a sensitive token appeared in a public payload.",
    );
  }
}

verifyS03Admin().catch((error: unknown) => {
  console.error(`S03 admin smoke failed: ${formatSafeError(error)}`);
  process.exitCode = 1;
});
