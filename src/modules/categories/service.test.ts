import { describe, expect, it } from "vitest";

import {
  createCategoryServiceCore,
  type CategoryDbCategory,
  type CategoryFailure,
  type CategoryResult,
  type CategoryServiceClient,
} from "./service-core";

const NOW = new Date("2026-04-26T21:46:00.000Z");

describe("category admin service core", () => {
  it("normalizes category creation input and orders lists deterministically", async () => {
    const fakeDb = createFakeCategoryDb({
      categories: [
        buildCategory({
          id: "category-z",
          name: "Z Carnes",
          slug: "z-carnes",
          type: "PRODUCT",
          displayOrder: 2,
        }),
        buildCategory({
          id: "category-a",
          name: "A Bebidas",
          slug: "a-bebidas",
          type: "PRODUCT",
          displayOrder: 2,
        }),
      ],
    });
    const service = createCategoryServiceCore({ db: fakeDb });

    const created = expectOk(
      await service.create({
        name: "  AçAÍ & Sucos  ",
        type: "PRODUCT",
        description: "  Gelados da casa  ",
        displayOrder: "1",
      }),
    );

    expect(created).toMatchObject({
      name: "AçAÍ & Sucos",
      slug: "acai-e-sucos",
      type: "PRODUCT",
      description: "Gelados da casa",
      displayOrder: 1,
      isActive: true,
    });

    const listed = expectOk(
      await service.listByType({ type: "PRODUCT", includeInactive: true }),
    );

    expect(listed.map((category) => category.slug)).toEqual([
      "acai-e-sucos",
      "a-bebidas",
      "z-carnes",
    ]);
  });

  it("rejects malformed category input and forbidden caller-owned fields", async () => {
    const service = createCategoryServiceCore({ db: createFakeCategoryDb() });

    const invalidCreate = expectFailure(
      await service.create({
        name: " ",
        type: "SERVICE",
        displayOrder: "1.5",
        role: "ADMIN",
        status: "ACTIVE",
      }),
      "VALIDATION_FAILED",
    );

    expect(invalidCreate.validationErrors?.fieldErrors.name).toContain(
      "Informe um nome com pelo menos 2 caracteres.",
    );
    expect(invalidCreate.validationErrors?.fieldErrors.type).toContain(
      "Selecione um tipo de categoria válido.",
    );
    expect(invalidCreate.validationErrors?.fieldErrors.displayOrder).toContain(
      "Informe uma ordem inteira.",
    );
    expect(invalidCreate.validationErrors?.fieldErrors.role).toContain(
      "Campo não permitido.",
    );
    expect(invalidCreate.validationErrors?.fieldErrors.status).toContain(
      "Campo não permitido.",
    );

    const invalidUpdate = expectFailure(
      await service.update({
        id: "category-1",
        name: "N".repeat(121),
        slug: "caller-owned-slug",
      }),
      "VALIDATION_FAILED",
    );

    expect(invalidUpdate.validationErrors?.fieldErrors.name).toContain(
      "Informe um nome com até 120 caracteres.",
    );
    expect(invalidUpdate.validationErrors?.fieldErrors.slug).toContain(
      "Campo não permitido.",
    );
  });

  it("turns duplicate slug/type writes into safe failures while allowing the other type", async () => {
    const service = createCategoryServiceCore({
      db: createFakeCategoryDb({
        categories: [
          buildCategory({
            id: "existing-product",
            name: "Bebidas",
            slug: "bebidas",
            type: "PRODUCT",
          }),
        ],
      }),
    });

    const duplicate = expectFailure(
      await service.create({ name: " Bebidas ", type: "PRODUCT" }),
      "DUPLICATE_CATEGORY",
    );

    expect(duplicate.message).toBe(
      "Já existe uma categoria com este nome para o tipo selecionado.",
    );

    const establishmentCategory = expectOk(
      await service.create({ name: "Bebidas", type: "ESTABLISHMENT" }),
    );

    expect(establishmentCategory.slug).toBe("bebidas");
    expect(establishmentCategory.type).toBe("ESTABLISHMENT");
  });

  it("keeps slugs stable on edit and toggles logical category activity", async () => {
    const fakeDb = createFakeCategoryDb({
      categories: [
        buildCategory({
          id: "category-1",
          name: "Bebidas",
          slug: "bebidas",
          type: "PRODUCT",
          isActive: true,
        }),
      ],
    });
    const service = createCategoryServiceCore({ db: fakeDb });

    const updated = expectOk(
      await service.update({
        id: "category-1",
        name: "Bebidas Especiais",
        description: " ",
        displayOrder: 5,
      }),
    );

    expect(updated).toMatchObject({
      id: "category-1",
      name: "Bebidas Especiais",
      slug: "bebidas",
      description: null,
      displayOrder: 5,
    });

    const inactive = expectOk(await service.inactivate({ id: "category-1" }));
    expect(inactive.isActive).toBe(false);
    expect(fakeDb.state.deletedIds).toEqual([]);

    const activeList = expectOk(
      await service.listByType({ type: "PRODUCT", includeInactive: false }),
    );
    expect(activeList).toEqual([]);

    const reactivated = expectOk(await service.activate({ id: "category-1" }));
    expect(reactivated.isActive).toBe(true);
  });

  it("returns safe not-found failures for invalid category identifiers", async () => {
    const service = createCategoryServiceCore({ db: createFakeCategoryDb() });

    expectFailure(await service.update({ id: "missing", name: "Bebidas" }), "NOT_FOUND");
    expectFailure(await service.activate({ id: "missing" }), "NOT_FOUND");
    expectFailure(await service.inactivate({ id: "missing" }), "NOT_FOUND");
  });
});

type FakeCategoryState = {
  categories: CategoryDbCategory[];
  deletedIds: string[];
  seq: number;
};

type FakeCategoryDb = CategoryServiceClient & {
  state: FakeCategoryState;
};

function createFakeCategoryDb(
  initial: Partial<Pick<FakeCategoryState, "categories">> = {},
): FakeCategoryDb {
  const state: FakeCategoryState = {
    categories: initial.categories?.map(cloneCategory) ?? [],
    deletedIds: [],
    seq: initial.categories?.length ?? 0,
  };
  const client: FakeCategoryDb = {
    state,
    category: {
      async findMany(args) {
        const where = args.where ?? {};
        return state.categories
          .filter((category) => {
            if (where.type && category.type !== where.type) {
              return false;
            }

            if (
              where.isActive !== undefined &&
              category.isActive !== where.isActive
            ) {
              return false;
            }

            return true;
          })
          .sort(compareCategoryRows)
          .slice(0, args.take)
          .map(cloneCategory);
      },
      async create(args) {
        if (
          state.categories.some(
            (category) =>
              category.slug === args.data.slug &&
              category.type === args.data.type,
          )
        ) {
          throw uniqueConstraint(["slug", "type"]);
        }

        const category = buildCategory({
          ...args.data,
          id: `category-${state.seq + 1}`,
          createdAt: NOW,
          updatedAt: NOW,
        });

        state.seq += 1;
        state.categories.push(category);

        return cloneCategory(category);
      },
      async update(args) {
        const category = state.categories.find(
          (candidate) => candidate.id === args.where.id,
        );

        if (!category) {
          throw notFound();
        }

        if (args.data.name !== undefined) {
          category.name = args.data.name;
        }

        if (args.data.description !== undefined) {
          category.description = args.data.description;
        }

        if (args.data.displayOrder !== undefined) {
          category.displayOrder = args.data.displayOrder;
        }

        if (args.data.isActive !== undefined) {
          category.isActive = args.data.isActive;
        }

        category.updatedAt = NOW;

        return cloneCategory(category);
      },
    },
  };

  return client;
}

function buildCategory(
  overrides: Partial<CategoryDbCategory> = {},
): CategoryDbCategory {
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

function compareCategoryRows(
  first: CategoryDbCategory,
  second: CategoryDbCategory,
) {
  return (
    first.displayOrder - second.displayOrder ||
    first.name.localeCompare(second.name, "pt-BR") ||
    first.id.localeCompare(second.id, "pt-BR")
  );
}

function uniqueConstraint(target: string[]) {
  return Object.assign(new Error("Unique constraint failed on slug/type"), {
    code: "P2002",
    meta: { target },
  });
}

function notFound() {
  return Object.assign(new Error("Record not found"), { code: "P2025" });
}

function cloneCategory(category: CategoryDbCategory): CategoryDbCategory {
  return {
    ...category,
    createdAt: new Date(category.createdAt.getTime()),
    updatedAt: new Date(category.updatedAt.getTime()),
  };
}

function expectOk<TData>(result: CategoryResult<TData>) {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(`Expected success, got ${result.code}`);
  }

  return result.data;
}

function expectFailure<TData>(
  result: CategoryResult<TData>,
  code: CategoryFailure["code"],
) {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected failure, got success.");
  }

  expect(result.code).toBe(code);
  expect(result.message).not.toContain("Unique constraint");
  expect(result.message).not.toContain("Record not found");

  return result;
}
