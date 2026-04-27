import { describe, expect, it } from "vitest";

import {
  createMerchantServiceCore,
  type MerchantDbCategory,
  type MerchantDbEstablishment,
  type MerchantFailure,
  type MerchantResult,
  type MerchantServiceClient,
} from "./service-core";

const NOW = new Date("2026-04-26T23:58:00.000Z");
const EARLIER = new Date("2026-04-25T16:00:00.000Z");

describe("merchant profile service core", () => {
  it("loads the dashboard for the authenticated owner with a bounded safe projection", async () => {
    const fakeDb = createFakeMerchantDb({
      establishments: [
        buildEstablishment({ id: "est-a", ownerId: "owner-a", name: "Sextou A" }),
        buildEstablishment({ id: "est-b", ownerId: "owner-b", name: "Sextou B" }),
      ],
      categories: [buildCategory({ id: "cat-est" })],
    });
    const service = createMerchantServiceCore({ db: fakeDb });

    const dashboard = expectOk(await service.getDashboardForOwner(" owner-a "));

    expect(dashboard.establishment).toMatchObject({
      id: "est-a",
      name: "Sextou A",
      status: "ACTIVE",
      category: { id: "cat-est", type: "ESTABLISHMENT", isActive: true },
    });
    expect(dashboard.canEditProfile).toBe(true);
    expect(JSON.stringify(dashboard)).not.toContain("owner-b");
    expect(JSON.stringify(dashboard)).not.toContain("passwordHash");
    expect(JSON.stringify(dashboard)).not.toContain("tokenHash");
    expect(JSON.stringify(dashboard)).not.toContain("sessions");
    expect(fakeDb.calls.establishmentFindFirst[0]).toMatchObject({
      where: { ownerId: "owner-a" },
    });
    expect(JSON.stringify(fakeDb.calls.establishmentFindFirst[0])).not.toContain(
      "passwordHash",
    );
    expect(JSON.stringify(fakeDb.calls.establishmentFindFirst[0])).not.toContain(
      "tokenHash",
    );
  });

  it("updates only the authenticated owner's active establishment and keeps the slug stable", async () => {
    const fakeDb = createFakeMerchantDb({
      establishments: [
        buildEstablishment({ id: "est-a", ownerId: "owner-a", slug: "sextou-a" }),
        buildEstablishment({ id: "est-b", ownerId: "owner-b", slug: "sextou-b" }),
      ],
      categories: [buildCategory({ id: "cat-est" })],
    });
    const service = createMerchantServiceCore({ db: fakeDb });

    const updated = expectOk(
      await service.updateProfileForOwner("owner-a", {
        name: "  Sextou Delivery  ",
        description: " ",
        categoryId: "cat-est",
        phone: " 11999999999 ",
        whatsapp: " ",
        addressLine1: " Rua Um ",
        addressLine2: " Sala 2 ",
        city: " São Paulo ",
        state: " SP ",
        postalCode: " 01000-000 ",
        deliveryFee: "7,50",
        minimumOrder: "20.00",
      }),
    );

    expect(updated).toMatchObject({
      id: "est-a",
      name: "Sextou Delivery",
      slug: "sextou-a",
      description: null,
      categoryId: "cat-est",
      phone: "11999999999",
      whatsapp: null,
      addressLine1: "Rua Um",
      addressLine2: "Sala 2",
      city: "São Paulo",
      state: "SP",
      postalCode: "01000-000",
      deliveryFee: "7.50",
      minimumOrder: "20.00",
    });
    expect(fakeDb.state.establishments.find((row) => row.id === "est-b")?.name).toBe(
      "Sextou Bar",
    );
    expect(fakeDb.state.establishments.find((row) => row.id === "est-a")?.slug).toBe(
      "sextou-a",
    );
    expect(fakeDb.calls.establishmentUpdate).toHaveLength(1);
    expect(fakeDb.calls.establishmentUpdate[0]).toMatchObject({
      where: { id: "est-a" },
      data: {
        name: "Sextou Delivery",
        description: null,
        categoryId: "cat-est",
        deliveryFee: "7.50",
        minimumOrder: "20.00",
      },
    });
  });

  it("rejects forged establishment authority fields before any mutation", async () => {
    const fakeDb = createFakeMerchantDb({
      establishments: [
        buildEstablishment({ id: "est-a", ownerId: "owner-a" }),
        buildEstablishment({ id: "est-b", ownerId: "owner-b" }),
      ],
    });
    const service = createMerchantServiceCore({ db: fakeDb });

    const failure = expectFailure(
      await service.updateProfileForOwner("owner-a", {
        id: "est-b",
        ownerId: "owner-b",
        status: "ACTIVE",
        slug: "forged-slug",
        logoUrl: "/uploads/forged.webp",
        name: "Nome válido",
      }),
      "VALIDATION_FAILED",
    );

    for (const field of ["id", "ownerId", "status", "slug", "logoUrl"]) {
      expect(failure.validationErrors?.fieldErrors[field]).toContain(
        "Campo não permitido.",
      );
    }
    expect(fakeDb.calls.establishmentUpdate).toEqual([]);
    expect(fakeDb.state.establishments.find((row) => row.id === "est-a")?.name).toBe(
      "Sextou Bar",
    );
  });

  it("requires ACTIVE status before profile or logo mutations", async () => {
    for (const status of ["PENDING", "BLOCKED", "INACTIVE"] as const) {
      const fakeDb = createFakeMerchantDb({
        establishments: [buildEstablishment({ ownerId: `owner-${status}`, status })],
      });
      const service = createMerchantServiceCore({ db: fakeDb });

      expectFailure(
        await service.updateProfileForOwner(`owner-${status}`, { name: "Novo nome" }),
        "INACTIVE_STATUS",
      );
      expectFailure(
        await service.updateLogoForOwner(
          `owner-${status}`,
          "/uploads/establishments/est-a/logos/logo.webp",
        ),
        "INACTIVE_STATUS",
      );
      expect(fakeDb.calls.establishmentUpdate).toEqual([]);
    }
  });

  it("validates active establishment categories and allows blank category clearing", async () => {
    const fakeDb = createFakeMerchantDb({
      establishments: [buildEstablishment({ ownerId: "owner-a", categoryId: "cat-est" })],
      categories: [
        buildCategory({ id: "cat-est", type: "ESTABLISHMENT", isActive: true }),
        buildCategory({ id: "cat-inactive", type: "ESTABLISHMENT", isActive: false }),
        buildCategory({ id: "cat-product", type: "PRODUCT", isActive: true }),
      ],
    });
    const service = createMerchantServiceCore({ db: fakeDb });

    for (const categoryId of ["cat-inactive", "cat-product", "cat-missing"]) {
      expectFailure(
        await service.updateProfileForOwner("owner-a", { categoryId }),
        "INVALID_CATEGORY",
      );
    }

    const cleared = expectOk(
      await service.updateProfileForOwner("owner-a", { categoryId: " " }),
    );

    expect(cleared.categoryId).toBeNull();
    expect(fakeDb.state.establishments[0]?.categoryId).toBeNull();
  });

  it("returns field errors for malformed owner ids, money, category ids, and logo URLs", async () => {
    const service = createMerchantServiceCore({
      db: createFakeMerchantDb({
        establishments: [buildEstablishment({ ownerId: "owner-a" })],
      }),
    });

    const ownerFailure = expectFailure(
      await service.getDashboardForOwner(" "),
      "VALIDATION_FAILED",
    );
    expect(ownerFailure.validationErrors?.fieldErrors.ownerId).toContain(
      "Informe o identificador do comerciante.",
    );

    const profileFailure = expectFailure(
      await service.updateProfileForOwner("owner-a", {
        categoryId: "c".repeat(129),
        deliveryFee: "abc",
        minimumOrder: "-1",
      }),
      "VALIDATION_FAILED",
    );
    expect(profileFailure.validationErrors?.fieldErrors.categoryId).toContain(
      "Informe um identificador com até 128 caracteres.",
    );
    expect(profileFailure.validationErrors?.fieldErrors.deliveryFee).toContain(
      "Informe um valor em dinheiro válido.",
    );
    expect(profileFailure.validationErrors?.fieldErrors.minimumOrder).toContain(
      "Informe um valor maior ou igual a zero.",
    );

    const logoFailure = expectFailure(
      await service.updateLogoForOwner("owner-a", "https://evil.example/logo.png"),
      "VALIDATION_FAILED",
    );
    expect(logoFailure.validationErrors?.fieldErrors.logoUrl).toContain(
      "Informe um caminho de upload válido.",
    );
  });

  it("updates logoUrl through the owner-resolved active establishment only", async () => {
    const fakeDb = createFakeMerchantDb({
      establishments: [
        buildEstablishment({ id: "est-a", ownerId: "owner-a" }),
        buildEstablishment({ id: "est-b", ownerId: "owner-b" }),
      ],
    });
    const service = createMerchantServiceCore({ db: fakeDb });

    const updated = expectOk(
      await service.updateLogoForOwner(
        "owner-a",
        "/uploads/establishments/est-a/logos/logo.webp",
      ),
    );

    expect(updated).toMatchObject({
      id: "est-a",
      logoUrl: "/uploads/establishments/est-a/logos/logo.webp",
    });
    expect(fakeDb.calls.establishmentUpdate).toHaveLength(1);
    expect(fakeDb.calls.establishmentUpdate[0]).toMatchObject({
      where: { id: "est-a" },
      data: { logoUrl: "/uploads/establishments/est-a/logos/logo.webp" },
    });
    expect(fakeDb.state.establishments.find((row) => row.id === "est-b")?.logoUrl).toBeNull();
  });

  it("returns safe not-found failures for owners without establishments", async () => {
    const service = createMerchantServiceCore({ db: createFakeMerchantDb() });

    expectFailure(await service.getDashboardForOwner("owner-missing"), "NOT_FOUND");
    expectFailure(
      await service.updateProfileForOwner("owner-missing", { name: "Novo nome" }),
      "NOT_FOUND",
    );
    expectFailure(
      await service.updateLogoForOwner(
        "owner-missing",
        "/uploads/establishments/est-x/logos/logo.webp",
      ),
      "NOT_FOUND",
    );
  });

  it("converts database and category lookup errors into generic safe failures", async () => {
    const readFailureService = createMerchantServiceCore({
      db: createFakeMerchantDb({ failEstablishmentRead: true }),
    });

    const readFailure = expectFailure(
      await readFailureService.getDashboardForOwner("owner-a"),
      "DATABASE_ERROR",
    );
    expect(readFailure.message).toBe(
      "Não foi possível concluir a operação do estabelecimento. Tente novamente.",
    );
    expect(JSON.stringify(readFailure)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(readFailure)).not.toContain("Prisma");
    expect(JSON.stringify(readFailure)).not.toContain("passwordHash");

    const categoryFailureService = createMerchantServiceCore({
      db: createFakeMerchantDb({
        failCategoryLookup: true,
        establishments: [buildEstablishment({ ownerId: "owner-a" })],
      }),
    });

    expectFailure(
      await categoryFailureService.updateProfileForOwner("owner-a", {
        categoryId: "cat-est",
      }),
      "DATABASE_ERROR",
    );
  });
});

type FakeEstablishmentRow = MerchantDbEstablishment & {
  passwordHash?: string;
  tokenHash?: string;
  sessions?: unknown[];
};

type FakeMerchantState = {
  categories: MerchantDbCategory[];
  establishments: FakeEstablishmentRow[];
  failCategoryLookup: boolean;
  failEstablishmentRead: boolean;
  failEstablishmentUpdate: boolean;
};

type FakeMerchantDb = MerchantServiceClient & {
  calls: {
    categoryFindFirst: unknown[];
    establishmentFindFirst: unknown[];
    establishmentUpdate: unknown[];
  };
  state: FakeMerchantState;
};

function createFakeMerchantDb(
  initial: Partial<FakeMerchantState> = {},
): FakeMerchantDb {
  const state: FakeMerchantState = {
    categories: initial.categories?.map(cloneCategory) ?? [],
    establishments: initial.establishments?.map(cloneEstablishment) ?? [],
    failCategoryLookup: initial.failCategoryLookup ?? false,
    failEstablishmentRead: initial.failEstablishmentRead ?? false,
    failEstablishmentUpdate: initial.failEstablishmentUpdate ?? false,
  };
  const calls: FakeMerchantDb["calls"] = {
    categoryFindFirst: [],
    establishmentFindFirst: [],
    establishmentUpdate: [],
  };

  return {
    calls,
    state,
    category: {
      async findFirst(args) {
        calls.categoryFindFirst.push(args);

        if (state.failCategoryLookup) {
          throw new Error("Prisma failed with DATABASE_URL and passwordHash");
        }

        const category = state.categories.find((candidate) => {
          if (args.where.id && candidate.id !== args.where.id) {
            return false;
          }

          if (args.where.type && candidate.type !== args.where.type) {
            return false;
          }

          if (
            args.where.isActive !== undefined &&
            candidate.isActive !== args.where.isActive
          ) {
            return false;
          }

          return true;
        });

        return category ? cloneCategory(category) : null;
      },
    },
    establishment: {
      async findFirst(args) {
        calls.establishmentFindFirst.push(args);

        if (state.failEstablishmentRead) {
          throw new Error("Prisma failed with DATABASE_URL and passwordHash");
        }

        const establishment = state.establishments
          .filter((candidate) => candidate.ownerId === args.where.ownerId)
          .sort(compareEstablishments)[0];

        return establishment ? cloneEstablishment(establishment) : null;
      },
      async update(args) {
        calls.establishmentUpdate.push(args);

        if (state.failEstablishmentUpdate) {
          throw new Error("Prisma failed with DATABASE_URL and passwordHash");
        }

        const establishment = state.establishments.find(
          (candidate) => candidate.id === args.where.id,
        );

        if (!establishment) {
          throw Object.assign(new Error("Record not found"), { code: "P2025" });
        }

        Object.assign(establishment, args.data, { updatedAt: NOW });

        return cloneEstablishment(establishment);
      },
    },
  };
}

function buildEstablishment(
  overrides: Partial<FakeEstablishmentRow> = {},
): FakeEstablishmentRow {
  return {
    id: "est-a",
    ownerId: "owner-a",
    categoryId: "cat-est",
    name: "Sextou Bar",
    slug: "sextou-bar",
    description: "Petiscos e bebidas",
    logoUrl: null,
    status: "ACTIVE",
    phone: "11999999999",
    whatsapp: "11999999999",
    addressLine1: "Rua Um",
    addressLine2: null,
    city: "São Paulo",
    state: "SP",
    postalCode: "01000-000",
    deliveryFee: "5.00",
    minimumOrder: "15.00",
    createdAt: EARLIER,
    updatedAt: NOW,
    category: buildCategory({ id: "cat-est" }),
    passwordHash: "must-not-serialize",
    tokenHash: "must-not-serialize",
    sessions: [{ tokenHash: "must-not-serialize" }],
    ...overrides,
  };
}

function buildCategory(
  overrides: Partial<MerchantDbCategory> = {},
): MerchantDbCategory {
  return {
    id: "cat-est",
    name: "Restaurantes",
    slug: "restaurantes",
    type: "ESTABLISHMENT",
    isActive: true,
    ...overrides,
  };
}

function compareEstablishments(
  first: FakeEstablishmentRow,
  second: FakeEstablishmentRow,
) {
  return (
    first.createdAt.getTime() - second.createdAt.getTime() ||
    first.id.localeCompare(second.id, "pt-BR")
  );
}

function cloneEstablishment(
  establishment: FakeEstablishmentRow,
): FakeEstablishmentRow {
  return {
    ...establishment,
    createdAt: new Date(establishment.createdAt.getTime()),
    updatedAt: new Date(establishment.updatedAt.getTime()),
    category: establishment.category ? cloneCategory(establishment.category) : null,
    sessions: establishment.sessions ? [...establishment.sessions] : undefined,
  };
}

function cloneCategory(category: MerchantDbCategory): MerchantDbCategory {
  return { ...category };
}

function expectOk<TData>(result: MerchantResult<TData>) {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(`Expected success, got ${result.code}`);
  }

  return result.data;
}

function expectFailure<TData>(
  result: MerchantResult<TData>,
  code: MerchantFailure["code"],
) {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected failure, got success.");
  }

  expect(result.code).toBe(code);
  expect(result.message).not.toContain("DATABASE_URL");
  expect(result.message).not.toContain("Prisma");
  expect(result.message).not.toContain("passwordHash");

  return result;
}
