import { describe, expect, it } from "vitest";

import {
  createProductServiceCore,
  type ProductCategoryDbRow,
  type ProductDbEstablishment,
  type ProductDbRow,
  type ProductFailure,
  type ProductResult,
  type ProductServiceClient,
} from "./service-core";

const NOW = new Date("2026-04-27T00:10:00.000Z");
const EARLIER = new Date("2026-04-26T18:00:00.000Z");

describe("merchant product service core", () => {
  it("lists and reads only the authenticated owner establishment products with safe projections", async () => {
    const fakeDb = createFakeProductDb({
      establishments: [
        buildEstablishment({ id: "est-a", ownerId: "owner-a", slug: "sextou-a" }),
        buildEstablishment({ id: "est-b", ownerId: "owner-b", slug: "sextou-b" }),
      ],
      products: [
        buildProduct({ id: "product-a", establishmentId: "est-a", name: "Batata" }),
        buildProduct({ id: "product-b", establishmentId: "est-b", name: "Isca" }),
        buildProduct({
          id: "product-archived",
          establishmentId: "est-a",
          status: "ARCHIVED",
          name: "Produto removido",
        }),
      ],
    });
    const service = createProductServiceCore({ db: fakeDb });

    const listed = expectOk(await service.listForOwner(" owner-a "));

    expect(listed.map((product) => product.id)).toEqual(["product-a"]);
    expect(listed[0]).toMatchObject({
      id: "product-a",
      establishmentId: "est-a",
      establishmentSlug: "sextou-a",
      price: "19.90",
      category: { id: "cat-product", type: "PRODUCT", isActive: true },
    });
    expect(JSON.stringify(listed)).not.toContain("owner-b");
    expect(JSON.stringify(listed)).not.toContain("passwordHash");
    expect(JSON.stringify(listed)).not.toContain("tokenHash");
    expect(JSON.stringify(listed)).not.toContain("sessions");
    expect(fakeDb.calls.productFindMany[0]).toMatchObject({
      where: { establishmentId: "est-a", status: { not: "ARCHIVED" } },
    });

    const product = expectOk(
      await service.getOwnedProductForOwner("owner-a", { productId: "product-a" }),
    );

    expect(product.id).toBe("product-a");
    expectFailure(
      await service.getOwnedProductForOwner("owner-a", { productId: "product-b" }),
      "NOT_FOUND",
    );
  });

  it("creates ACTIVE products for approved merchants with active PRODUCT categories and bounded slug collisions", async () => {
    const fakeDb = createFakeProductDb({
      establishments: [buildEstablishment({ id: "est-a", ownerId: "owner-a" })],
      categories: [buildCategory({ id: "cat-product" })],
      products: [
        buildProduct({ id: "existing-1", establishmentId: "est-a", slug: "produto" }),
      ],
    });
    const service = createProductServiceCore({ db: fakeDb });

    const created = expectOk(
      await service.createForOwner("owner-a", {
        name: " Produto ",
        description: " ",
        categoryId: "cat-product",
        price: "12,5",
      }),
    );

    expect(created).toMatchObject({
      name: "Produto",
      slug: "produto-2",
      status: "ACTIVE",
      price: "12.50",
      description: null,
      categoryId: "cat-product",
      establishmentId: "est-a",
      establishmentSlug: "sextou-bar",
    });
    expect(fakeDb.calls.categoryFindFirst[0]).toMatchObject({
      where: { id: "cat-product", type: "PRODUCT", isActive: true },
    });
    expect(fakeDb.calls.productCreate).toHaveLength(1);
    expect(fakeDb.calls.productCreate[0]).toMatchObject({
      data: {
        establishmentId: "est-a",
        slug: "produto-2",
        status: "ACTIVE",
        price: "12.50",
      },
    });
  });

  it("rejects invalid product/category inputs before writes", async () => {
    const fakeDb = createFakeProductDb({
      establishments: [buildEstablishment({ id: "est-a", ownerId: "owner-a" })],
      categories: [
        buildCategory({ id: "cat-inactive", isActive: false }),
        buildCategory({ id: "cat-establishment", type: "ESTABLISHMENT" }),
      ],
    });
    const service = createProductServiceCore({ db: fakeDb });

    const forbidden = expectFailure(
      await service.createForOwner("owner-a", {
        name: "Produto válido",
        price: "9.99",
        ownerId: "owner-b",
        establishmentId: "est-b",
        slug: "forged",
        status: "ACTIVE",
        imageUrl: "/uploads/forged.webp",
        isFeatured: true,
      }),
      "VALIDATION_FAILED",
    );

    for (const field of [
      "ownerId",
      "establishmentId",
      "slug",
      "status",
      "imageUrl",
      "isFeatured",
    ]) {
      expect(forbidden.validationErrors?.fieldErrors[field]).toContain(
        "Campo não permitido.",
      );
    }
    expect(fakeDb.calls.productCreate).toEqual([]);
    expect(fakeDb.calls.establishmentFindFirst).toEqual([]);

    for (const categoryId of ["cat-inactive", "cat-establishment", "cat-missing"]) {
      expectFailure(
        await service.createForOwner("owner-a", {
          name: "Produto válido",
          price: "9.99",
          categoryId,
        }),
        "INVALID_CATEGORY",
      );
    }
    expect(fakeDb.calls.productCreate).toEqual([]);
  });

  it("requires an ACTIVE owner establishment before create, update, lifecycle, and image mutations", async () => {
    for (const status of ["PENDING", "BLOCKED", "INACTIVE"] as const) {
      const fakeDb = createFakeProductDb({
        establishments: [buildEstablishment({ id: `est-${status}`, ownerId: `owner-${status}`, status })],
        categories: [buildCategory({ id: "cat-product" })],
        products: [buildProduct({ id: "product-a", establishmentId: `est-${status}` })],
      });
      const service = createProductServiceCore({ db: fakeDb });

      expectFailure(
        await service.createForOwner(`owner-${status}`, {
          name: "Produto válido",
          price: "9.99",
        }),
        "OPERATION_NOT_ALLOWED",
      );
      expectFailure(
        await service.updateForOwner(`owner-${status}`, { productId: "product-a" }, { name: "Novo" }),
        "OPERATION_NOT_ALLOWED",
      );
      expectFailure(
        await service.pauseForOwner(`owner-${status}`, { productId: "product-a" }),
        "OPERATION_NOT_ALLOWED",
      );
      expectFailure(
        await service.updateImageForOwner(
          `owner-${status}`,
          { productId: "product-a" },
          { imageUrl: "/uploads/products/est-a/product-a/photo.webp" },
        ),
        "OPERATION_NOT_ALLOWED",
      );
      expect(fakeDb.calls.productUpdate).toEqual([]);
      expect(fakeDb.calls.productCreate).toEqual([]);
    }
  });

  it("updates only owned products, keeps slugs stable, persists images, and converts prices to strings", async () => {
    const fakeDb = createFakeProductDb({
      establishments: [
        buildEstablishment({ id: "est-a", ownerId: "owner-a" }),
        buildEstablishment({ id: "est-b", ownerId: "owner-b" }),
      ],
      categories: [buildCategory({ id: "cat-product-2", name: "Bebidas" })],
      products: [
        buildProduct({ id: "product-a", establishmentId: "est-a", slug: "batata" }),
        buildProduct({ id: "product-b", establishmentId: "est-b", slug: "isca" }),
      ],
    });
    const service = createProductServiceCore({ db: fakeDb });

    const updated = expectOk(
      await service.updateForOwner(
        "owner-a",
        { productId: "product-a" },
        {
          name: "Batata Especial",
          description: " ",
          categoryId: "cat-product-2",
          price: "21.50",
        },
      ),
    );

    expect(updated).toMatchObject({
      id: "product-a",
      name: "Batata Especial",
      slug: "batata",
      price: "21.50",
      description: null,
      categoryId: "cat-product-2",
      establishmentSlug: "sextou-bar",
    });
    expect(fakeDb.state.products.find((row) => row.id === "product-b")?.name).toBe(
      "Batata",
    );

    const image = expectOk(
      await service.updateImageForOwner(
        "owner-a",
        { productId: "product-a" },
        { imageUrl: "/uploads/products/est-a/product-a/photo.webp" },
      ),
    );

    expect(image.imageUrl).toBe("/uploads/products/est-a/product-a/photo.webp");
    expect(fakeDb.calls.productUpdate.at(-1)).toMatchObject({
      where: { id: "product-a" },
      data: { imageUrl: "/uploads/products/est-a/product-a/photo.webp" },
    });

    expectFailure(
      await service.updateForOwner("owner-a", { productId: "product-b" }, { name: "Ataque" }),
      "NOT_FOUND",
    );
    expect(fakeDb.state.products.find((row) => row.id === "product-b")?.name).toBe(
      "Batata",
    );
  });

  it("implements ACTIVE, PAUSED, and ARCHIVED lifecycle without hard deleting", async () => {
    const fakeDb = createFakeProductDb({
      establishments: [buildEstablishment({ id: "est-a", ownerId: "owner-a" })],
      products: [buildProduct({ id: "product-a", establishmentId: "est-a", status: "ACTIVE" })],
    });
    const service = createProductServiceCore({ db: fakeDb });

    expect(expectOk(await service.pauseForOwner("owner-a", { productId: "product-a" })).status).toBe(
      "PAUSED",
    );
    expect(expectOk(await service.activateForOwner("owner-a", { productId: "product-a" })).status).toBe(
      "ACTIVE",
    );
    expect(expectOk(await service.archiveForOwner("owner-a", { productId: "product-a" })).status).toBe(
      "ARCHIVED",
    );
    expect(fakeDb.state.deletedIds).toEqual([]);

    const listed = expectOk(await service.listForOwner("owner-a"));
    expect(listed).toEqual([]);
  });

  it("returns safe failures for missing establishments, slug races, not-found updates, and database errors", async () => {
    const missingService = createProductServiceCore({ db: createFakeProductDb() });
    expectFailure(
      await missingService.createForOwner("owner-missing", {
        name: "Produto válido",
        price: "9.99",
      }),
      "NOT_FOUND",
    );

    const duplicateService = createProductServiceCore({
      db: createFakeProductDb({
        establishments: [buildEstablishment({ id: "est-a", ownerId: "owner-a" })],
        failProductCreateAsDuplicate: true,
      }),
    });
    const duplicate = expectFailure(
      await duplicateService.createForOwner("owner-a", {
        name: "Produto válido",
        price: "9.99",
      }),
      "DUPLICATE_SLUG",
    );
    expect(duplicate.message).not.toContain("Unique constraint");

    const notFoundDb = createFakeProductDb({
      establishments: [buildEstablishment({ id: "est-a", ownerId: "owner-a" })],
      products: [buildProduct({ id: "product-a", establishmentId: "est-a" })],
      failNextProductUpdateAsNotFound: true,
    });
    const notFoundService = createProductServiceCore({ db: notFoundDb });
    expectFailure(
      await notFoundService.pauseForOwner("owner-a", { productId: "product-a" }),
      "NOT_FOUND",
    );

    const databaseService = createProductServiceCore({
      db: createFakeProductDb({ failEstablishmentRead: true }),
    });
    const databaseFailure = expectFailure(
      await databaseService.listForOwner("owner-a"),
      "DATABASE_ERROR",
    );
    expect(JSON.stringify(databaseFailure)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(databaseFailure)).not.toContain("Prisma");
    expect(JSON.stringify(databaseFailure)).not.toContain("passwordHash");
  });
});

type FakeProductRow = ProductDbRow & {
  ownerId?: string;
  passwordHash?: string;
  tokenHash?: string;
  sessions?: unknown[];
};

type FakeProductState = {
  categories: ProductCategoryDbRow[];
  deletedIds: string[];
  establishments: ProductDbEstablishment[];
  failCategoryLookup: boolean;
  failEstablishmentRead: boolean;
  failNextProductUpdateAsNotFound: boolean;
  failProductCreateAsDuplicate: boolean;
  failProductRead: boolean;
  failProductUpdate: boolean;
  products: FakeProductRow[];
  seq: number;
};

type FakeProductDb = ProductServiceClient & {
  calls: {
    categoryFindFirst: unknown[];
    establishmentFindFirst: unknown[];
    productCreate: unknown[];
    productFindFirst: unknown[];
    productFindMany: unknown[];
    productUpdate: unknown[];
  };
  state: FakeProductState;
};

function createFakeProductDb(initial: Partial<FakeProductState> = {}): FakeProductDb {
  const state: FakeProductState = {
    categories: initial.categories?.map(cloneCategory) ?? [],
    deletedIds: [],
    establishments: initial.establishments?.map(cloneEstablishment) ?? [],
    failCategoryLookup: initial.failCategoryLookup ?? false,
    failEstablishmentRead: initial.failEstablishmentRead ?? false,
    failNextProductUpdateAsNotFound: initial.failNextProductUpdateAsNotFound ?? false,
    failProductCreateAsDuplicate: initial.failProductCreateAsDuplicate ?? false,
    failProductRead: initial.failProductRead ?? false,
    failProductUpdate: initial.failProductUpdate ?? false,
    products: initial.products?.map(cloneProduct) ?? [],
    seq: initial.products?.length ?? 0,
  };
  const calls: FakeProductDb["calls"] = {
    categoryFindFirst: [],
    establishmentFindFirst: [],
    productCreate: [],
    productFindFirst: [],
    productFindMany: [],
    productUpdate: [],
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

          if (args.where.isActive !== undefined && candidate.isActive !== args.where.isActive) {
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
    },
    product: {
      async create(args) {
        calls.productCreate.push(args);

        if (state.failProductCreateAsDuplicate) {
          throw uniqueConstraint(["establishmentId", "slug"]);
        }

        if (
          state.products.some(
            (product) =>
              product.establishmentId === args.data.establishmentId &&
              product.slug === args.data.slug,
          )
        ) {
          throw uniqueConstraint(["establishmentId", "slug"]);
        }

        const establishment = state.establishments.find(
          (candidate) => candidate.id === args.data.establishmentId,
        );
        const category = args.data.categoryId
          ? state.categories.find((candidate) => candidate.id === args.data.categoryId) ?? null
          : null;
        const product = buildProduct({
          ...args.data,
          id: `product-${state.seq + 1}`,
          createdAt: NOW,
          updatedAt: NOW,
          category,
          establishment: establishment
            ? { id: establishment.id, slug: establishment.slug }
            : { id: args.data.establishmentId, slug: "missing-establishment" },
        });

        state.seq += 1;
        state.products.push(product);

        return cloneProduct(product);
      },
      async findFirst(args) {
        calls.productFindFirst.push(args);

        if (state.failProductRead) {
          throw new Error("Prisma failed with DATABASE_URL and passwordHash");
        }

        const product = state.products.find((candidate) => matchesProductWhere(candidate, args.where));
        return product ? cloneProduct(withProductRelations(product, state)) : null;
      },
      async findMany(args) {
        calls.productFindMany.push(args);

        if (state.failProductRead) {
          throw new Error("Prisma failed with DATABASE_URL and passwordHash");
        }

        return state.products
          .filter((candidate) => matchesProductWhere(candidate, args.where))
          .sort(compareProducts)
          .slice(0, args.take)
          .map((product) => cloneProduct(withProductRelations(product, state)));
      },
      async update(args) {
        calls.productUpdate.push(args);

        if (state.failNextProductUpdateAsNotFound) {
          state.failNextProductUpdateAsNotFound = false;
          throw notFound();
        }

        if (state.failProductUpdate) {
          throw new Error("Prisma failed with DATABASE_URL and passwordHash");
        }

        const product = state.products.find((candidate) => candidate.id === args.where.id);

        if (!product) {
          throw notFound();
        }

        Object.assign(product, args.data, { updatedAt: NOW });

        if (args.data.categoryId !== undefined) {
          product.category = args.data.categoryId
            ? state.categories.find((candidate) => candidate.id === args.data.categoryId) ?? null
            : null;
        }

        return cloneProduct(withProductRelations(product, state));
      },
    },
  };
}

function matchesProductWhere(
  product: FakeProductRow,
  where: {
    establishmentId?: string;
    id?: string;
    slug?: string;
    status?: ProductStatusWhere;
  } = {},
) {
  if (where.id && product.id !== where.id) {
    return false;
  }

  if (where.establishmentId && product.establishmentId !== where.establishmentId) {
    return false;
  }

  if (where.slug && product.slug !== where.slug) {
    return false;
  }

  if (where.status) {
    if (typeof where.status === "string" && product.status !== where.status) {
      return false;
    }

    if (typeof where.status === "object" && where.status.not && product.status === where.status.not) {
      return false;
    }
  }

  return true;
}

type ProductStatusWhere =
  | FakeProductRow["status"]
  | {
      not?: FakeProductRow["status"];
    };

function buildEstablishment(
  overrides: Partial<ProductDbEstablishment> = {},
): ProductDbEstablishment {
  return {
    id: "est-a",
    ownerId: "owner-a",
    slug: "sextou-bar",
    status: "ACTIVE",
    createdAt: EARLIER,
    ...overrides,
  };
}

function buildCategory(
  overrides: Partial<ProductCategoryDbRow> = {},
): ProductCategoryDbRow {
  return {
    id: "cat-product",
    name: "Petiscos",
    slug: "petiscos",
    type: "PRODUCT",
    isActive: true,
    ...overrides,
  };
}

function buildProduct(overrides: Partial<FakeProductRow> = {}): FakeProductRow {
  const establishmentId = overrides.establishmentId ?? "est-a";

  return {
    id: "product-a",
    establishmentId,
    categoryId: "cat-product",
    name: "Batata",
    slug: "batata",
    description: "Porção crocante",
    price: fakeDecimal("19.90"),
    status: "ACTIVE",
    imageUrl: null,
    isFeatured: false,
    createdAt: EARLIER,
    updatedAt: NOW,
    category: buildCategory(),
    establishment: { id: establishmentId, slug: "sextou-bar" },
    passwordHash: "must-not-serialize",
    tokenHash: "must-not-serialize",
    sessions: [{ tokenHash: "must-not-serialize" }],
    ...overrides,
  };
}

function compareEstablishments(
  first: ProductDbEstablishment,
  second: ProductDbEstablishment,
) {
  return (
    first.createdAt.getTime() - second.createdAt.getTime() ||
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

function fakeDecimal(value: string) {
  return {
    toString() {
      return value;
    },
  };
}

function uniqueConstraint(target: string[]) {
  return Object.assign(new Error("Unique constraint failed on products"), {
    code: "P2002",
    meta: { target },
  });
}

function notFound() {
  return Object.assign(new Error("Record not found"), { code: "P2025" });
}

function withProductRelations(
  product: FakeProductRow,
  state: FakeProductState,
): FakeProductRow {
  const establishment = state.establishments.find(
    (candidate) => candidate.id === product.establishmentId,
  );
  const category = product.categoryId
    ? state.categories.find((candidate) => candidate.id === product.categoryId) ??
      product.category
    : null;

  return {
    ...product,
    category,
    establishment: establishment
      ? { id: establishment.id, slug: establishment.slug }
      : product.establishment,
  };
}

function cloneEstablishment(
  establishment: ProductDbEstablishment,
): ProductDbEstablishment {
  return {
    ...establishment,
    createdAt: new Date(establishment.createdAt.getTime()),
  };
}

function cloneCategory(category: ProductCategoryDbRow): ProductCategoryDbRow {
  return { ...category };
}

function cloneProduct(product: FakeProductRow): FakeProductRow {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
    category: product.category ? cloneCategory(product.category) : null,
    establishment: { ...product.establishment },
    sessions: product.sessions ? [...product.sessions] : undefined,
  };
}

function expectOk<TData>(result: ProductResult<TData>) {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(`Expected success, got ${result.code}`);
  }

  return result.data;
}

function expectFailure<TData>(
  result: ProductResult<TData>,
  code: ProductFailure["code"],
) {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected failure, got success.");
  }

  expect(result.code).toBe(code);
  expect(result.message).not.toContain("Unique constraint");
  expect(result.message).not.toContain("Record not found");
  expect(result.message).not.toContain("DATABASE_URL");
  expect(result.message).not.toContain("Prisma");
  expect(result.message).not.toContain("passwordHash");

  return result;
}
