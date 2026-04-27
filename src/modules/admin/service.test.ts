import { describe, expect, it } from "vitest";

import {
  ADMIN_LIST_LIMITS,
  createAdminServiceCore,
  type AdminCategoryDbRow,
  type AdminRecentEstablishmentDbRow,
  type AdminServiceClient,
  type AdminServiceFailure,
  type AdminServiceResult,
  type AdminUserRole,
  type AdminCustomerDbRow,
} from "./service-core";

const NOW = new Date("2026-04-26T23:20:00.000Z");
const EARLIER = new Date("2026-04-25T18:00:00.000Z");

describe("admin read service core", () => {
  it("loads dashboard counts and recent pending establishments with safe bounded projections", async () => {
    const fakeDb = createFakeAdminDb({
      categories: [
        buildCategory({ id: "cat-1", type: "ESTABLISHMENT", isActive: true }),
        buildCategory({ id: "cat-2", type: "ESTABLISHMENT", isActive: false }),
        buildCategory({ id: "cat-3", type: "PRODUCT", isActive: true }),
      ],
      establishments: [
        buildEstablishment({ id: "est-1", status: "PENDING", createdAt: NOW }),
        buildEstablishment({ id: "est-2", status: "ACTIVE" }),
        buildEstablishment({ id: "est-3", status: "BLOCKED" }),
      ],
      users: [
        buildCustomer({ id: "customer-1", status: "ACTIVE" }),
        buildCustomer({ id: "customer-2", status: "SUSPENDED" }),
        buildUser({ id: "merchant-1", role: "MERCHANT" }),
      ],
    });
    const service = createAdminServiceCore({
      db: fakeDb,
      now: () => NOW,
    });

    const dashboard = expectOk(await service.getDashboard());

    expect(dashboard.generatedAt).toBe(NOW.toISOString());
    expect(dashboard.establishmentCounts).toEqual({
      PENDING: 1,
      ACTIVE: 1,
      BLOCKED: 1,
      INACTIVE: 0,
    });
    expect(dashboard.categoryCounts).toEqual({
      ESTABLISHMENT: { active: 1, inactive: 1, total: 2 },
      PRODUCT: { active: 1, inactive: 0, total: 1 },
    });
    expect(dashboard.customerCounts).toEqual({
      total: 2,
      byStatus: {
        ACTIVE: 1,
        INVITED: 0,
        SUSPENDED: 1,
      },
    });
    expect(dashboard.recentPendingEstablishments).toEqual([
      expect.objectContaining({
        id: "est-1",
        owner: {
          name: "Maria Comerciante",
          email: "maria@example.com",
          phone: "11999999999",
          status: "ACTIVE",
        },
      }),
    ]);
    expect(JSON.stringify(dashboard)).not.toContain("passwordHash");
    expect(JSON.stringify(dashboard)).not.toContain("tokenHash");
    expect(fakeDb.calls.establishmentFindMany[0]).toMatchObject({
      take: ADMIN_LIST_LIMITS.RECENT_PENDING_ESTABLISHMENTS,
      where: { status: "PENDING" },
    });
    expect(JSON.stringify(fakeDb.calls.establishmentFindMany[0])).not.toContain(
      "passwordHash",
    );
  });

  it("lists both category types deterministically and keeps the client payload serializable", async () => {
    const fakeDb = createFakeAdminDb({
      categories: [
        buildCategory({
          id: "z-product",
          name: "Z Bebidas",
          slug: "z-bebidas",
          type: "PRODUCT",
          displayOrder: 2,
        }),
        buildCategory({
          id: "a-product",
          name: "A Bebidas",
          slug: "a-bebidas",
          type: "PRODUCT",
          displayOrder: 2,
          isActive: false,
        }),
        buildCategory({
          id: "restaurant",
          name: "Restaurantes",
          slug: "restaurantes",
          type: "ESTABLISHMENT",
          displayOrder: 1,
        }),
      ],
    });
    const service = createAdminServiceCore({ db: fakeDb });

    const categories = expectOk(await service.listCategories());

    expect(categories.limitPerType).toBe(ADMIN_LIST_LIMITS.CATEGORIES_PER_TYPE);
    expect(categories.byType.ESTABLISHMENT.map((category) => category.slug)).toEqual([
      "restaurantes",
    ]);
    expect(categories.byType.PRODUCT.map((category) => category.slug)).toEqual([
      "a-bebidas",
      "z-bebidas",
    ]);
    expect(categories.byType.PRODUCT[0]).toMatchObject({
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(fakeDb.calls.categoryFindMany).toEqual([
      expect.objectContaining({
        take: ADMIN_LIST_LIMITS.CATEGORIES_PER_TYPE,
        where: { type: "ESTABLISHMENT" },
      }),
      expect.objectContaining({
        take: ADMIN_LIST_LIMITS.CATEGORIES_PER_TYPE,
        where: { type: "PRODUCT" },
      }),
    ]);
  });

  it("lists customers read-only with bounded CUSTOMER-only safe fields", async () => {
    const fakeDb = createFakeAdminDb({
      users: [
        buildCustomer({ id: "old-customer", createdAt: EARLIER, name: "Bia" }),
        buildCustomer({ id: "new-customer", createdAt: NOW, name: "Ana" }),
        buildUser({ id: "admin-1", role: "ADMIN", name: "Admin" }),
      ],
    });
    const service = createAdminServiceCore({ db: fakeDb });

    const lookup = expectOk(await service.listCustomers());

    expect(lookup.total).toBe(2);
    expect(lookup.limit).toBe(ADMIN_LIST_LIMITS.CUSTOMERS);
    expect(lookup.customers.map((customer) => customer.id)).toEqual([
      "new-customer",
      "old-customer",
    ]);
    expect(JSON.stringify(lookup)).not.toContain("passwordHash");
    expect(fakeDb.calls.userFindMany[0]).toMatchObject({
      take: ADMIN_LIST_LIMITS.CUSTOMERS,
      where: { role: "CUSTOMER" },
    });
  });

  it("returns safe Portuguese read failures without raw database details", async () => {
    const db = createFakeAdminDb({ failCounts: true });
    const service = createAdminServiceCore({ db });

    const failure = expectFailure(await service.getDashboard(), "DASHBOARD_READ_FAILED");

    expect(failure.message).toBe(
      "Não foi possível carregar os indicadores administrativos. Tente novamente.",
    );
    expect(JSON.stringify(failure)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(failure)).not.toContain("Prisma");
    expect(JSON.stringify(failure)).not.toContain("passwordHash");
  });
});

type FakeAdminDb = AdminServiceClient & {
  calls: {
    categoryFindMany: unknown[];
    establishmentFindMany: unknown[];
    userFindMany: unknown[];
  };
};

type FakeUserRow = AdminCustomerDbRow & {
  role: AdminUserRole;
  passwordHash?: string;
  tokenHash?: string;
};

type FakeAdminState = {
  categories: AdminCategoryDbRow[];
  establishments: AdminRecentEstablishmentDbRow[];
  failCounts: boolean;
  users: FakeUserRow[];
};

function createFakeAdminDb(
  initial: Partial<FakeAdminState> = {},
): FakeAdminDb {
  const state: FakeAdminState = {
    categories: initial.categories?.map(cloneCategory) ?? [],
    establishments: initial.establishments?.map(cloneEstablishment) ?? [],
    failCounts: initial.failCounts ?? false,
    users: initial.users?.map(cloneUser) ?? [],
  };
  const calls: FakeAdminDb["calls"] = {
    categoryFindMany: [],
    establishmentFindMany: [],
    userFindMany: [],
  };

  return {
    calls,
    category: {
      async count(args) {
        if (state.failCounts) {
          throw new Error("Prisma failed with DATABASE_URL and passwordHash");
        }

        return state.categories.filter((category) => {
          if (args.where?.type && category.type !== args.where.type) {
            return false;
          }

          if (
            args.where?.isActive !== undefined &&
            category.isActive !== args.where.isActive
          ) {
            return false;
          }

          return true;
        }).length;
      },
      async findMany(args) {
        calls.categoryFindMany.push(args);

        return state.categories
          .filter((category) => !args.where?.type || category.type === args.where.type)
          .sort(compareCategoryRows)
          .slice(0, args.take)
          .map(cloneCategory);
      },
    },
    establishment: {
      async count(args) {
        if (state.failCounts) {
          throw new Error("Prisma failed with DATABASE_URL and passwordHash");
        }

        return state.establishments.filter(
          (establishment) =>
            !args.where?.status || establishment.status === args.where.status,
        ).length;
      },
      async findMany(args) {
        calls.establishmentFindMany.push(args);

        return state.establishments
          .filter(
            (establishment) =>
              !args.where?.status || establishment.status === args.where.status,
          )
          .sort(compareRecentEstablishments)
          .slice(0, args.take)
          .map(cloneEstablishment);
      },
    },
    user: {
      async count(args) {
        if (state.failCounts) {
          throw new Error("Prisma failed with DATABASE_URL and passwordHash");
        }

        return state.users.filter((user) => {
          if (args.where?.role && user.role !== args.where.role) {
            return false;
          }

          if (args.where?.status && user.status !== args.where.status) {
            return false;
          }

          return true;
        }).length;
      },
      async findMany(args) {
        calls.userFindMany.push(args);

        return state.users
          .filter((user) => !args.where?.role || user.role === args.where.role)
          .sort(compareUsers)
          .slice(0, args.take)
          .map(cloneUser);
      },
    },
  };
}

function buildCategory(
  overrides: Partial<AdminCategoryDbRow> = {},
): AdminCategoryDbRow {
  return {
    id: "category-1",
    name: "Bebidas",
    slug: "bebidas",
    type: "PRODUCT",
    description: null,
    displayOrder: 0,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildEstablishment(
  overrides: Partial<AdminRecentEstablishmentDbRow> = {},
): AdminRecentEstablishmentDbRow {
  return {
    id: "establishment-1",
    name: "Sextou Bar",
    slug: "sextou-bar",
    status: "PENDING",
    city: "São Paulo",
    state: "SP",
    createdAt: NOW,
    owner: {
      name: "Maria Comerciante",
      email: "maria@example.com",
      phone: "11999999999",
      status: "ACTIVE",
      passwordHash: "must-not-serialize",
    } as AdminRecentEstablishmentDbRow["owner"],
    category: {
      name: "Restaurantes",
      isActive: true,
    },
    ...overrides,
  };
}

function buildCustomer(overrides: Partial<FakeUserRow> = {}): FakeUserRow {
  return buildUser({ role: "CUSTOMER", ...overrides });
}

function buildUser(overrides: Partial<FakeUserRow> = {}): FakeUserRow {
  return {
    id: "customer-1",
    name: "Maria Cliente",
    email: "cliente@example.com",
    phone: "11988887777",
    role: "CUSTOMER",
    status: "ACTIVE",
    createdAt: NOW,
    updatedAt: NOW,
    passwordHash: "must-not-serialize",
    tokenHash: "must-not-serialize",
    ...overrides,
  };
}

function compareCategoryRows(
  first: AdminCategoryDbRow,
  second: AdminCategoryDbRow,
) {
  return (
    first.displayOrder - second.displayOrder ||
    first.name.localeCompare(second.name, "pt-BR") ||
    first.id.localeCompare(second.id, "pt-BR")
  );
}

function compareRecentEstablishments(
  first: AdminRecentEstablishmentDbRow,
  second: AdminRecentEstablishmentDbRow,
) {
  return (
    second.createdAt.getTime() - first.createdAt.getTime() ||
    first.name.localeCompare(second.name, "pt-BR") ||
    first.id.localeCompare(second.id, "pt-BR")
  );
}

function compareUsers(first: FakeUserRow, second: FakeUserRow) {
  return (
    second.createdAt.getTime() - first.createdAt.getTime() ||
    first.name.localeCompare(second.name, "pt-BR") ||
    first.id.localeCompare(second.id, "pt-BR")
  );
}

function cloneCategory(category: AdminCategoryDbRow): AdminCategoryDbRow {
  return {
    ...category,
    createdAt: new Date(category.createdAt.getTime()),
    updatedAt: new Date(category.updatedAt.getTime()),
  };
}

function cloneEstablishment(
  establishment: AdminRecentEstablishmentDbRow,
): AdminRecentEstablishmentDbRow {
  return {
    ...establishment,
    createdAt: new Date(establishment.createdAt.getTime()),
    owner: { ...establishment.owner },
    category: establishment.category ? { ...establishment.category } : null,
  };
}

function cloneUser(user: FakeUserRow): FakeUserRow {
  return {
    ...user,
    createdAt: new Date(user.createdAt.getTime()),
    updatedAt: new Date(user.updatedAt.getTime()),
  };
}

function expectOk<TData>(result: AdminServiceResult<TData>) {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(`Expected success, got ${result.code}`);
  }

  return result.data;
}

function expectFailure<TData>(
  result: AdminServiceResult<TData>,
  code: AdminServiceFailure["code"],
) {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected failure, got success.");
  }

  expect(result.code).toBe(code);

  return result;
}
