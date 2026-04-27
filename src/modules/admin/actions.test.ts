import { describe, expect, it, vi } from "vitest";

import { AuthError } from "../auth/errors";
import {
  createCategoryServiceCore,
  type CategoryDbCategory,
  type CategoryResult,
  type CategoryServiceClient,
  type CategoryServiceCore,
} from "../categories/service-core";
import type {
  EstablishmentDetailDto,
  EstablishmentResult,
  EstablishmentServiceCore,
} from "../establishments/service-core";

import { ADMIN_ACTION_IDLE_STATE } from "./action-state";
import { createAdminActionCore } from "./action-core";

const NOW = new Date("2026-04-26T22:10:00.000Z");

describe("admin server action core", () => {
  it("rejects missing and non-admin sessions before service mutation", async () => {
    const noCookieCategoryCreate = vi.fn(async () => okCategory(buildCategory()));
    const noCookieCore = createAdminActionCore({
      readSessionCookie: () => undefined,
      requireAdminSession: async (rawToken) => {
        expect(rawToken).toBeUndefined();
        throw new AuthError("TOKEN_INVALID", "raw missing token");
      },
      categoryService: {
        create: noCookieCategoryCreate,
        update: vi.fn(),
        activate: vi.fn(),
        inactivate: vi.fn(),
      },
      establishmentService: createFakeEstablishmentService(),
      revalidatePath: vi.fn(),
    });

    const missingCookie = await noCookieCore.createCategoryAction(
      ADMIN_ACTION_IDLE_STATE,
      categoryForm({ name: "Bebidas", type: "PRODUCT" }),
    );

    expect(missingCookie).toMatchObject({
      status: "error",
      message: "Sessão inválida. Faça login novamente.",
    });
    expect(noCookieCategoryCreate).not.toHaveBeenCalled();

    const establishmentService = createFakeEstablishmentService();
    const merchantApprove = vi.spyOn(establishmentService, "approve");
    const merchantCore = createAdminActionCore({
      readSessionCookie: () => "merchant-token",
      requireAdminSession: async (rawToken) => {
        expect(rawToken).toBe("merchant-token");
        throw new AuthError(
          "FORBIDDEN_ROLE",
          "Role MERCHANT cannot access this server-only surface.",
        );
      },
      categoryService: createFakeCategoryService(),
      establishmentService,
      revalidatePath: vi.fn(),
    });

    const forbidden = await merchantCore.approveEstablishmentAction(
      ADMIN_ACTION_IDLE_STATE,
      idForm("establishment-1"),
    );

    expect(forbidden.status).toBe("error");
    expect(forbidden.message).toBe("Você não tem permissão para acessar esta área.");
    expect(forbidden.message).not.toContain("MERCHANT");
    expect(merchantApprove).not.toHaveBeenCalled();
  });

  it("ignores forged category status fields and preserves safe validation values", async () => {
    const service = createCategoryServiceCore({ db: createFakeCategoryDb() });
    const createSpy = vi.spyOn(service, "create");
    const core = createAdminActionCore({
      readSessionCookie: () => "admin-token",
      requireAdminSession: vi.fn(async () => ({ user: { role: "ADMIN" } })),
      categoryService: service,
      establishmentService: createFakeEstablishmentService(),
      revalidatePath: vi.fn(),
    });

    const result = await core.createCategoryAction(
      ADMIN_ACTION_IDLE_STATE,
      categoryForm({
        name: "N".repeat(121),
        type: "SERVICE",
        description: "D".repeat(501),
        displayOrder: "1",
        status: "ACTIVE",
      }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toBe("Revise os campos destacados.");
    expect(result.fieldErrors?.name).toContain(
      "Informe um nome com até 120 caracteres.",
    );
    expect(result.fieldErrors?.type).toContain(
      "Selecione um tipo de categoria válido.",
    );
    expect(result.fieldErrors?.description).toContain(
      "Informe uma descrição com até 500 caracteres.",
    );
    expect(result.fieldErrors?.status).toBeUndefined();
    expect(result.values).toEqual({
      name: "N".repeat(121),
      type: "SERVICE",
      description: "D".repeat(501),
      displayOrder: "1",
    });
    expect(createSpy).toHaveBeenCalledWith({
      name: "N".repeat(121),
      type: "SERVICE",
      description: "D".repeat(501),
      displayOrder: "1",
    });
  });

  it("returns duplicate category failures without leaking database details", async () => {
    const core = createAdminActionCore({
      readSessionCookie: () => "admin-token",
      requireAdminSession: vi.fn(async () => ({ user: { role: "ADMIN" } })),
      categoryService: createCategoryServiceCore({
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
      }),
      establishmentService: createFakeEstablishmentService(),
      revalidatePath: vi.fn(),
    });

    const result = await core.createCategoryAction(
      ADMIN_ACTION_IDLE_STATE,
      categoryForm({ name: " Bebidas ", type: "PRODUCT" }),
    );

    expect(result).toMatchObject({
      status: "error",
      message: "Já existe uma categoria com este nome para o tipo selecionado.",
      values: {
        name: " Bebidas ",
        type: "PRODUCT",
        description: "",
        displayOrder: "",
      },
    });
    expect(JSON.stringify(result)).not.toContain("Unique constraint");
    expect(JSON.stringify(result)).not.toContain("slug/type");
    expect(JSON.stringify(result)).not.toContain("DATABASE_URL");
  });

  it("revalidates only affected admin paths after successful category actions", async () => {
    const revalidatePath = vi.fn();
    const core = createAdminActionCore({
      readSessionCookie: () => "admin-token",
      requireAdminSession: vi.fn(async () => ({ user: { role: "ADMIN" } })),
      categoryService: createCategoryServiceCore({ db: createFakeCategoryDb() }),
      establishmentService: createFakeEstablishmentService(),
      revalidatePath,
    });

    const result = await core.createCategoryAction(
      ADMIN_ACTION_IDLE_STATE,
      categoryForm({ name: "Açaí", type: "PRODUCT", displayOrder: "2" }),
    );

    expect(result).toMatchObject({
      status: "success",
      message: "Categoria criada com sucesso.",
      categoryId: "category-1",
    });
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/admin",
      "/admin/categorias",
    ]);
  });

  it("updates category editable fields without forwarding the immutable type", async () => {
    const update = vi.fn(async (input: unknown) =>
      okCategory(
        buildCategory({
          id: getId(input),
          name: isRecord(input) && typeof input.name === "string" ? input.name : "",
        }),
      ),
    );
    const revalidatePath = vi.fn();
    const core = createAdminActionCore({
      readSessionCookie: () => "admin-token",
      requireAdminSession: vi.fn(async () => ({ user: { role: "ADMIN" } })),
      categoryService: createFakeCategoryService({ update }),
      establishmentService: createFakeEstablishmentService(),
      revalidatePath,
    });

    const result = await core.updateCategoryAction(
      ADMIN_ACTION_IDLE_STATE,
      categoryForm({
        id: "category-1",
        name: "Bebidas especiais",
        type: "PRODUCT",
        description: "Sem álcool",
        displayOrder: "4",
      }),
    );

    expect(result).toMatchObject({
      status: "success",
      message: "Categoria atualizada com sucesso.",
      categoryId: "category-1",
    });
    expect(update).toHaveBeenCalledWith({
      id: "category-1",
      name: "Bebidas especiais",
      description: "Sem álcool",
      displayOrder: "4",
    });
    expect(JSON.stringify(update.mock.calls[0])).not.toContain("PRODUCT");
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/admin",
      "/admin/categorias",
    ]);
  });

  it("uses named establishment actions and ignores forged raw statuses", async () => {
    const establishmentService = createFakeEstablishmentService({
      approve: async (input: unknown) =>
        okEstablishment(buildEstablishment({ id: getId(input), status: "ACTIVE" })),
      block: async (input: unknown) =>
        okEstablishment(buildEstablishment({ id: getId(input), status: "BLOCKED" })),
    });
    const approveSpy = vi.spyOn(establishmentService, "approve");
    const blockSpy = vi.spyOn(establishmentService, "block");
    const revalidatePath = vi.fn();
    const core = createAdminActionCore({
      readSessionCookie: () => "admin-token",
      requireAdminSession: vi.fn(async () => ({ user: { role: "ADMIN" } })),
      categoryService: createFakeCategoryService(),
      establishmentService,
      revalidatePath,
    });

    const approved = await core.approveEstablishmentAction(
      ADMIN_ACTION_IDLE_STATE,
      idForm("establishment-1", { status: "BLOCKED", action: "block" }),
    );

    expect(approved).toMatchObject({
      status: "success",
      message: "Estabelecimento aprovado com sucesso.",
      detailId: "establishment-1",
      establishmentId: "establishment-1",
    });
    expect(approveSpy).toHaveBeenCalledWith({ id: "establishment-1" });
    expect(blockSpy).not.toHaveBeenCalled();
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/admin",
      "/admin/estabelecimentos",
      "/admin/estabelecimentos/establishment-1",
    ]);
  });

  it("returns safe validation for missing establishment ids", async () => {
    const core = createAdminActionCore({
      readSessionCookie: () => "admin-token",
      requireAdminSession: vi.fn(async () => ({ user: { role: "ADMIN" } })),
      categoryService: createFakeCategoryService(),
      establishmentService: createFakeEstablishmentService({
        inactivate: async () => ({
          ok: false,
          code: "VALIDATION_FAILED",
          message: "Revise os campos destacados.",
          validationErrors: {
            fieldErrors: {
              id: ["Informe o identificador do estabelecimento."],
            },
            formErrors: [],
          },
        }),
      }),
      revalidatePath: vi.fn(),
    });

    const result = await core.inactivateEstablishmentAction(
      ADMIN_ACTION_IDLE_STATE,
      new FormData(),
    );

    expect(result).toMatchObject({
      status: "error",
      message: "Revise os campos destacados.",
      fieldErrors: {
        id: ["Informe o identificador do estabelecimento."],
      },
      values: { id: "" },
    });
  });

  it("does not leak raw service or revalidation failures", async () => {
    const serviceFailureCore = createAdminActionCore({
      readSessionCookie: () => "admin-token",
      requireAdminSession: vi.fn(async () => ({ user: { role: "ADMIN" } })),
      categoryService: createFakeCategoryService({
        create: async () => {
          throw new Error(
            "Prisma stack leaked DATABASE_URL and passwordHash from tokenHash",
          );
        },
      }),
      establishmentService: createFakeEstablishmentService(),
      revalidatePath: vi.fn(),
    });

    const serviceFailure = await serviceFailureCore.createCategoryAction(
      ADMIN_ACTION_IDLE_STATE,
      categoryForm({ name: "Bebidas", type: "PRODUCT" }),
    );

    expect(serviceFailure.status).toBe("error");
    expect(serviceFailure.message).toBe(
      "Não foi possível concluir a operação administrativa. Tente novamente.",
    );
    expect(JSON.stringify(serviceFailure)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(serviceFailure)).not.toContain("passwordHash");
    expect(JSON.stringify(serviceFailure)).not.toContain("tokenHash");

    const revalidationFailureCore = createAdminActionCore({
      readSessionCookie: () => "admin-token",
      requireAdminSession: vi.fn(async () => ({ user: { role: "ADMIN" } })),
      categoryService: createFakeCategoryService({
        activate: async () => okCategory(buildCategory({ id: "category-9" })),
      }),
      establishmentService: createFakeEstablishmentService(),
      revalidatePath: () => {
        throw new Error("AUTH_SECRET and raw Next cache internals");
      },
    });

    const revalidationFailure = await revalidationFailureCore.activateCategoryAction(
      ADMIN_ACTION_IDLE_STATE,
      idForm("category-9"),
    );

    expect(revalidationFailure.status).toBe("error");
    expect(revalidationFailure.message).toBe(
      "Operação concluída, mas não foi possível atualizar a visualização. Recarregue a página.",
    );
    expect(JSON.stringify(revalidationFailure)).not.toContain("AUTH_SECRET");
  });
});

type FakeCategoryService = Pick<
  CategoryServiceCore,
  "create" | "update" | "activate" | "inactivate"
>;
type FakeEstablishmentService = Pick<
  EstablishmentServiceCore,
  "approve" | "block" | "reactivate" | "inactivate"
>;

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

function idForm(id: string, extra: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("id", id);

  for (const [key, value] of Object.entries(extra)) {
    formData.set(key, value);
  }

  return formData;
}

function createFakeCategoryService(
  overrides: Partial<FakeCategoryService> = {},
): FakeCategoryService {
  return {
    create: async () => okCategory(buildCategory()),
    update: async () => okCategory(buildCategory()),
    activate: async () => okCategory(buildCategory({ isActive: true })),
    inactivate: async () => okCategory(buildCategory({ isActive: false })),
    ...overrides,
  };
}

function createFakeEstablishmentService(
  overrides: Partial<FakeEstablishmentService> = {},
): FakeEstablishmentService {
  return {
    approve: async (input: unknown) =>
      okEstablishment(buildEstablishment({ id: getId(input), status: "ACTIVE" })),
    block: async (input: unknown) =>
      okEstablishment(buildEstablishment({ id: getId(input), status: "BLOCKED" })),
    reactivate: async (input: unknown) =>
      okEstablishment(buildEstablishment({ id: getId(input), status: "ACTIVE" })),
    inactivate: async (input: unknown) =>
      okEstablishment(buildEstablishment({ id: getId(input), status: "INACTIVE" })),
    ...overrides,
  };
}

function createFakeCategoryDb(
  initial: { categories?: CategoryDbCategory[] } = {},
): CategoryServiceClient {
  const categories = initial.categories?.map(cloneCategory) ?? [];

  return {
    category: {
      async findMany() {
        return categories.map(cloneCategory);
      },
      async create(args) {
        if (
          categories.some(
            (category) =>
              category.slug === args.data.slug && category.type === args.data.type,
          )
        ) {
          throw Object.assign(new Error("Unique constraint failed on slug/type"), {
            code: "P2002",
            meta: { target: ["slug", "type"] },
          });
        }

        const category = buildCategory({
          ...args.data,
          id: `category-${categories.length + 1}`,
          createdAt: NOW,
          updatedAt: NOW,
        });
        categories.push(category);

        return cloneCategory(category);
      },
      async update(args) {
        const category = categories.find(
          (candidate) => candidate.id === args.where.id,
        );

        if (!category) {
          throw Object.assign(new Error("Record not found"), { code: "P2025" });
        }

        Object.assign(category, args.data, { updatedAt: NOW });

        return cloneCategory(category);
      },
    },
  };
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

function buildEstablishment(
  overrides: Partial<EstablishmentDetailDto> = {},
): EstablishmentDetailDto {
  return {
    id: "establishment-1",
    ownerId: "owner-1",
    categoryId: "category-1",
    name: "Sextou Bar",
    slug: "sextou-bar",
    status: "PENDING",
    phone: "1133334444",
    whatsapp: "11999999999",
    city: "São Paulo",
    state: "SP",
    createdAt: NOW,
    updatedAt: NOW,
    owner: {
      id: "owner-1",
      name: "Maria Comerciante",
      email: "maria@example.com",
      role: "MERCHANT",
      status: "ACTIVE",
      phone: "11999999999",
    },
    category: {
      id: "category-1",
      name: "Restaurantes",
      slug: "restaurantes",
      type: "ESTABLISHMENT",
      isActive: true,
    },
    description: null,
    addressLine1: "Rua das Sextas, 10",
    addressLine2: null,
    postalCode: "01000-000",
    deliveryFee: "5.00",
    minimumOrder: "25.00",
    ...overrides,
  };
}

function okCategory(category: CategoryDbCategory): CategoryResult<CategoryDbCategory> {
  return { ok: true, data: category };
}

function okEstablishment(
  establishment: EstablishmentDetailDto,
): EstablishmentResult<EstablishmentDetailDto> {
  return { ok: true, data: establishment };
}

function cloneCategory(category: CategoryDbCategory): CategoryDbCategory {
  return {
    ...category,
    createdAt: new Date(category.createdAt.getTime()),
    updatedAt: new Date(category.updatedAt.getTime()),
  };
}

function getId(input: unknown) {
  return isRecord(input) && typeof input.id === "string" ? input.id : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
