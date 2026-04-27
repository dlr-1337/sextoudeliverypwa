import { describe, expect, it } from "vitest";

import {
  createCatalogServiceCore,
  type CatalogDbCategoryRow,
  type CatalogDbStoreSummaryRow,
  type CatalogFailure,
  type CatalogResult,
  type CatalogServiceClient,
} from "./service-core";

describe("public catalog service core", () => {
  it("lists only ACTIVE stores with safe public projections and bounded ordering", async () => {
    const fakeDb = createFakeCatalogDb({
      stores: [
        buildStore({
          id: "est-b",
          name: "Açaí da Sexta",
          slug: "acai-da-sexta",
          deliveryFee: fakeDecimal("3.50"),
          minimumOrder: 25,
        }),
        buildStore({
          id: "est-a",
          name: "Bar do Zé",
          slug: "bar-do-ze",
          deliveryFee: "5.00",
          minimumOrder: fakeDecimal("0.00"),
        }),
        buildStore({ id: "est-pending", name: "Loja Pendente", slug: "loja-pendente", status: "PENDING" }),
        buildStore({ id: "est-blocked", name: "Loja Bloqueada", slug: "loja-bloqueada", status: "BLOCKED" }),
        buildStore({ id: "est-inactive", name: "Loja Inativa", slug: "loja-inativa", status: "INACTIVE" }),
      ],
    });
    const service = createCatalogServiceCore({ db: fakeDb });

    const stores = expectOk(await service.listActiveStores({ limit: 10 }));

    expect(stores.map((store) => store.slug)).toEqual([
      "acai-da-sexta",
      "bar-do-ze",
    ]);
    expect(stores[0]).toEqual({
      name: "Açaí da Sexta",
      slug: "acai-da-sexta",
      description: "Entrega local de sexta",
      logoUrl: "/uploads/establishments/est-a/logo.webp",
      city: "São Paulo",
      state: "SP",
      deliveryFee: "3.50",
      minimumOrder: "25.00",
      category: { name: "Petiscos", slug: "petiscos" },
    });
    expect(JSON.stringify(stores)).not.toContain("ownerId");
    expect(JSON.stringify(stores)).not.toContain("passwordHash");
    expect(JSON.stringify(stores)).not.toContain("tokenHash");
    expect(JSON.stringify(stores)).not.toContain("sessions");
    expect(JSON.stringify(stores)).not.toContain("PENDING");
    expect(fakeDb.calls.establishmentFindMany[0]).toMatchObject({
      where: { status: "ACTIVE" },
      orderBy: [{ name: "asc" }, { slug: "asc" }, { id: "asc" }],
      take: 10,
      select: {
        name: true,
        slug: true,
        description: true,
        logoUrl: true,
        city: true,
        state: true,
        deliveryFee: true,
        minimumOrder: true,
        category: { select: { name: true, slug: true } },
      },
    });
  });

  it("returns an ACTIVE store catalog with only ACTIVE products, safe fields, null categories, and deterministic product ordering", async () => {
    const fakeDb = createFakeCatalogDb({
      stores: [
        buildStore({
          id: "est-a",
          category: null,
          products: [
            buildProduct({
              id: "product-b",
              name: "Isca de peixe",
              slug: "isca-de-peixe",
              isFeatured: false,
              price: 42,
              category: buildCategory({ name: "Porções", slug: "porcoes" }),
            }),
            buildProduct({
              id: "product-a",
              name: "Batata especial",
              slug: "batata-especial",
              isFeatured: true,
              price: fakeDecimal("19.90"),
              category: null,
              imageUrl: "/uploads/products/est-a/product-a/photo.webp",
            }),
            buildProduct({ id: "product-draft", name: "Rascunho", slug: "rascunho", status: "DRAFT" }),
            buildProduct({ id: "product-paused", name: "Pausado", slug: "pausado", status: "PAUSED" }),
            buildProduct({ id: "product-archived", name: "Arquivado", slug: "arquivado", status: "ARCHIVED" }),
          ],
        }),
      ],
    });
    const service = createCatalogServiceCore({ db: fakeDb });

    const catalog = expectOk(
      await service.getActiveStoreCatalog({ slug: " Sextou Bar " }),
    );

    expect(catalog).toMatchObject({
      name: "Sextou Bar",
      slug: "sextou-bar",
      category: null,
      deliveryFee: "4.00",
      minimumOrder: "20.00",
    });
    expect(catalog.products).toEqual([
      {
        name: "Batata especial",
        slug: "batata-especial",
        description: "Produto liberado no catálogo",
        price: "19.90",
        imageUrl: "/uploads/products/est-a/product-a/photo.webp",
        category: null,
      },
      {
        name: "Isca de peixe",
        slug: "isca-de-peixe",
        description: "Produto liberado no catálogo",
        price: "42.00",
        imageUrl: null,
        category: { name: "Porções", slug: "porcoes" },
      },
    ]);
    expect(JSON.stringify(catalog)).not.toContain("ownerId");
    expect(JSON.stringify(catalog)).not.toContain("status");
    expect(JSON.stringify(catalog)).not.toContain("isFeatured");
    expect(JSON.stringify(catalog)).not.toContain("establishmentId");
    expect(JSON.stringify(catalog)).not.toContain("passwordHash");
    expect(JSON.stringify(catalog)).not.toContain("sessions");
    expect(fakeDb.calls.establishmentFindFirst[0]).toMatchObject({
      where: { slug: "sextou-bar", status: "ACTIVE" },
      select: {
        name: true,
        slug: true,
        description: true,
        logoUrl: true,
        city: true,
        state: true,
        deliveryFee: true,
        minimumOrder: true,
        category: { select: { name: true, slug: true } },
        products: {
          where: { status: "ACTIVE" },
          orderBy: [{ isFeatured: "desc" }, { name: "asc" }, { id: "asc" }],
          select: {
            name: true,
            slug: true,
            description: true,
            price: true,
            imageUrl: true,
            category: { select: { name: true, slug: true } },
          },
        },
      },
    });
  });

  it("returns safe not-found behavior for hidden stores, missing stores, invalid slugs, and stores with zero active products", async () => {
    for (const status of ["PENDING", "BLOCKED", "INACTIVE"] as const) {
      const fakeDb = createFakeCatalogDb({
        stores: [buildStore({ id: `est-${status}`, slug: "hidden-store", status })],
      });
      const service = createCatalogServiceCore({ db: fakeDb });

      expectFailure(
        await service.getActiveStoreCatalog({ slug: "hidden-store" }),
        "NOT_FOUND",
      );
      expect(fakeDb.calls.establishmentFindFirst[0]).toMatchObject({
        where: { slug: "hidden-store", status: "ACTIVE" },
      });
    }

    const emptyStoreDb = createFakeCatalogDb({
      stores: [
        buildStore({
          products: [
            buildProduct({ id: "product-draft", status: "DRAFT" }),
            buildProduct({ id: "product-paused", status: "PAUSED" }),
          ],
        }),
      ],
    });
    const emptyStoreService = createCatalogServiceCore({ db: emptyStoreDb });
    const emptyCatalog = expectOk(
      await emptyStoreService.getActiveStoreCatalog({ slug: "sextou-bar" }),
    );
    expect(emptyCatalog.products).toEqual([]);

    const missingDb = createFakeCatalogDb();
    const missingService = createCatalogServiceCore({ db: missingDb });
    expectFailure(
      await missingService.getActiveStoreCatalog({ slug: "loja-inexistente" }),
      "NOT_FOUND",
    );

    const invalidDb = createFakeCatalogDb({ stores: [buildStore()] });
    const invalidService = createCatalogServiceCore({ db: invalidDb });
    expectFailure(
      await invalidService.getActiveStoreCatalog({ slug: "../../admin" }),
      "NOT_FOUND",
    );
    expectFailure(
      await invalidService.getActiveStoreCatalog({ slug: "   " }),
      "NOT_FOUND",
    );
    expect(invalidDb.calls.establishmentFindFirst).toEqual([]);
  });

  it("maps service-thrown database failures to safe public messages", async () => {
    const service = createCatalogServiceCore({
      db: createFakeCatalogDb({ failEstablishmentRead: true, stores: [buildStore()] }),
    });

    expectFailure(await service.listActiveStores(), "DATABASE_ERROR");
    expectFailure(
      await service.getActiveStoreCatalog({ slug: "sextou-bar" }),
      "DATABASE_ERROR",
    );
  });
});

type EstablishmentStatusValue = "PENDING" | "ACTIVE" | "BLOCKED" | "INACTIVE";
type ProductStatusValue = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

type FakeProductRow = {
  id: string;
  establishmentId: string;
  name: string;
  slug: string;
  description: string | null;
  price: DecimalLike;
  status: ProductStatusValue;
  imageUrl: string | null;
  isFeatured: boolean;
  category: CatalogDbCategoryRow | null;
  ownerId?: string;
  passwordHash?: string;
  sessions?: unknown[];
};

type FakeStoreRow = CatalogDbStoreSummaryRow & {
  id: string;
  status: EstablishmentStatusValue;
  ownerId: string;
  passwordHash?: string;
  tokenHash?: string;
  sessions?: unknown[];
  products: FakeProductRow[];
};

type FakeCatalogDb = CatalogServiceClient & {
  calls: {
    establishmentFindFirst: unknown[];
    establishmentFindMany: unknown[];
  };
  state: {
    failEstablishmentRead: boolean;
    stores: FakeStoreRow[];
  };
};

type DecimalLike = { toString(): string } | number | string;

type ProductSelection = {
  where?: {
    status?: ProductStatusValue;
  };
};

function createFakeCatalogDb(initial: {
  failEstablishmentRead?: boolean;
  stores?: FakeStoreRow[];
} = {}): FakeCatalogDb {
  const state = {
    failEstablishmentRead: initial.failEstablishmentRead ?? false,
    stores: initial.stores?.map(cloneStore) ?? [],
  };
  const calls: FakeCatalogDb["calls"] = {
    establishmentFindFirst: [],
    establishmentFindMany: [],
  };

  return {
    calls,
    state,
    establishment: {
      async findMany(args) {
        calls.establishmentFindMany.push(args);

        if (state.failEstablishmentRead) {
          throw new Error("Prisma failed with DATABASE_URL and passwordHash");
        }

        return state.stores
          .filter((store) => !args.where?.status || store.status === args.where.status)
          .sort(compareStores)
          .slice(0, args.take)
          .map(cloneStore);
      },
      async findFirst(args) {
        calls.establishmentFindFirst.push(args);

        if (state.failEstablishmentRead) {
          throw new Error("Prisma failed with DATABASE_URL and passwordHash");
        }

        const store = state.stores.find(
          (candidate) =>
            (!args.where?.slug || candidate.slug === args.where.slug) &&
            (!args.where?.status || candidate.status === args.where.status),
        );

        if (!store) {
          return null;
        }

        const productSelection = getProductSelection(args.select);
        const products = productSelection
          ? store.products
              .filter(
                (product) =>
                  !productSelection.where?.status ||
                  product.status === productSelection.where.status,
              )
              .sort(compareProducts)
          : store.products;

        return cloneStore({ ...store, products });
      },
    },
  };
}

function buildStore(overrides: Partial<FakeStoreRow> = {}): FakeStoreRow {
  const id = overrides.id ?? "est-a";

  return {
    id,
    ownerId: "owner-secret",
    name: "Sextou Bar",
    slug: "sextou-bar",
    description: "Entrega local de sexta",
    logoUrl: "/uploads/establishments/est-a/logo.webp",
    status: "ACTIVE",
    city: "São Paulo",
    state: "SP",
    deliveryFee: fakeDecimal("4.00"),
    minimumOrder: fakeDecimal("20.00"),
    category: buildCategory(),
    products: [],
    passwordHash: "must-not-serialize",
    tokenHash: "must-not-serialize",
    sessions: [{ tokenHash: "must-not-serialize" }],
    ...overrides,
  };
}

function buildCategory(overrides: Partial<CatalogDbCategoryRow> = {}): CatalogDbCategoryRow {
  return {
    name: "Petiscos",
    slug: "petiscos",
    ...overrides,
  };
}

function buildProduct(overrides: Partial<FakeProductRow> = {}): FakeProductRow {
  return {
    id: "product-a",
    establishmentId: "est-a",
    name: "Batata",
    slug: "batata",
    description: "Produto liberado no catálogo",
    price: fakeDecimal("19.90"),
    status: "ACTIVE",
    imageUrl: null,
    isFeatured: false,
    category: buildCategory(),
    ownerId: "owner-secret",
    passwordHash: "must-not-serialize",
    sessions: [{ tokenHash: "must-not-serialize" }],
    ...overrides,
  };
}

function compareStores(first: FakeStoreRow, second: FakeStoreRow) {
  return (
    first.name.localeCompare(second.name, "pt-BR") ||
    first.slug.localeCompare(second.slug, "pt-BR") ||
    first.id.localeCompare(second.id, "pt-BR")
  );
}

function compareProducts(first: FakeProductRow, second: FakeProductRow) {
  const featuredOrder = Number(second.isFeatured) - Number(first.isFeatured);

  return (
    featuredOrder ||
    first.name.localeCompare(second.name, "pt-BR") ||
    first.id.localeCompare(second.id, "pt-BR")
  );
}

function getProductSelection(select: unknown): ProductSelection | null {
  if (!isRecord(select) || !isRecord(select.products)) {
    return null;
  }

  return select.products as ProductSelection;
}

function cloneStore(store: FakeStoreRow): FakeStoreRow {
  return {
    ...store,
    category: store.category ? { ...store.category } : null,
    products: store.products.map((product) => ({
      ...product,
      category: product.category ? { ...product.category } : null,
      sessions: product.sessions ? [...product.sessions] : undefined,
    })),
    sessions: store.sessions ? [...store.sessions] : undefined,
  };
}

function fakeDecimal(value: string) {
  return {
    toString() {
      return value;
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function expectOk<TData>(result: CatalogResult<TData>) {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(`Expected success, got ${result.code}`);
  }

  return result.data;
}

function expectFailure<TData>(
  result: CatalogResult<TData>,
  code: CatalogFailure["code"],
) {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected failure, got success.");
  }

  expect(result.code).toBe(code);
  expect(result.message).not.toContain("DATABASE_URL");
  expect(result.message).not.toContain("Prisma");
  expect(result.message).not.toContain("passwordHash");
  expect(result.message).not.toContain("PENDING");
  expect(result.message).not.toContain("BLOCKED");
  expect(result.message).not.toContain("INACTIVE");

  return result;
}
