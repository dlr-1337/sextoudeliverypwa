import { describe, expect, it, vi } from "vitest";

import { AuthError } from "../auth/errors";
import type { AuthSessionContext } from "../auth/types";

import { PRODUCT_ACTION_IDLE_STATE } from "./action-state";
import { createProductActionCore } from "./action-core";
import type {
  ProductDto,
  ProductResult,
  ProductServiceCore,
} from "./service-core";

const NOW = new Date("2026-04-27T03:20:00.000Z");
const EARLIER = new Date("2026-04-26T18:00:00.000Z");

describe("merchant product server action core", () => {
  it("rejects missing, customer, and admin sessions before service mutation", async () => {
    const createForOwner = vi.fn(async () => okProduct(buildProduct()));
    const missingCore = createProductActionCore({
      readSessionCookie: () => undefined,
      requireMerchantSession: async (rawToken) => {
        expect(rawToken).toBeUndefined();
        throw new AuthError("TOKEN_INVALID", "raw session token missing");
      },
      productService: createFakeProductActionService({ createForOwner }),
      revalidatePath: vi.fn(),
    });

    const missing = await missingCore.createProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({ name: "Batata", price: "19,90" }),
    );

    expect(missing).toMatchObject({
      status: "error",
      message: "Sessão inválida. Faça login novamente.",
    });
    expect(JSON.stringify(missing)).not.toContain("session token");
    expect(createForOwner).not.toHaveBeenCalled();

    for (const role of ["CUSTOMER", "ADMIN"] as const) {
      const updateForOwner = vi.fn(async () => okProduct(buildProduct()));
      const roleCore = createProductActionCore({
        readSessionCookie: () => `${role.toLowerCase()}-token`,
        requireMerchantSession: async (rawToken) => {
          expect(rawToken).toBe(`${role.toLowerCase()}-token`);
          throw new AuthError(
            "FORBIDDEN_ROLE",
            `Role ${role} cannot access this server-only surface.`,
          );
        },
        productService: createFakeProductActionService({ updateForOwner }),
        revalidatePath: vi.fn(),
      });

      const forbidden = await roleCore.updateProductAction(
        PRODUCT_ACTION_IDLE_STATE,
        productForm({ productId: "product-a", name: "Batata", price: "19.90" }),
      );

      expect(forbidden).toMatchObject({
        status: "error",
        message: "Você não tem permissão para acessar esta área.",
      });
      expect(JSON.stringify(forbidden)).not.toContain(role);
      expect(updateForOwner).not.toHaveBeenCalled();
    }
  });

  it("sends only allowlisted fields and never accepts forged authority or raw status", async () => {
    const createForOwner = vi.fn(async (_ownerId: unknown, input: unknown) =>
      okProduct(buildProduct({ id: "product-created", name: getString(input, "name") })),
    );
    const updateForOwner = vi.fn(async (_ownerId: unknown, _id: unknown, input: unknown) =>
      okProduct(buildProduct({ id: "product-a", name: getString(input, "name") })),
    );
    const pauseForOwner = vi.fn(async () =>
      okProduct(buildProduct({ id: "product-a", status: "PAUSED" })),
    );
    const revalidatePath = vi.fn();
    const core = createProductActionCore({
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: vi.fn(async () => merchantSession("owner-a")),
      productService: createFakeProductActionService({
        createForOwner,
        pauseForOwner,
        updateForOwner,
      }),
      revalidatePath,
    });

    const created = await core.createProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({
        name: " Batata Frita ",
        description: "Porção grande",
        categoryId: "cat-product",
        price: "19,90",
        establishmentId: "est-forged",
        ownerId: "owner-b",
        productId: "product-forged",
        slug: "forged-slug",
        status: "ARCHIVED",
        imageUrl: "/uploads/forged.webp",
      }),
    );

    expect(created).toMatchObject({
      status: "success",
      message: "Produto criado com sucesso.",
      merchantId: "owner-a",
      productId: "product-created",
      establishmentSlug: "sextou-bar",
    });
    expect(createForOwner).toHaveBeenCalledWith("owner-a", {
      name: " Batata Frita ",
      description: "Porção grande",
      categoryId: "cat-product",
      price: "19,90",
    });
    expect(JSON.stringify(createForOwner.mock.calls[0])).not.toContain("est-forged");
    expect(JSON.stringify(createForOwner.mock.calls[0])).not.toContain("owner-b");
    expect(JSON.stringify(createForOwner.mock.calls[0])).not.toContain("ARCHIVED");
    expect(JSON.stringify(createForOwner.mock.calls[0])).not.toContain("forged-slug");
    expect(JSON.stringify(createForOwner.mock.calls[0])).not.toContain("/uploads/forged.webp");

    const updated = await core.updateProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({
        productId: "product-a",
        name: "Batata Especial",
        price: "21.50",
        status: "ACTIVE",
        ownerId: "owner-b",
        establishmentId: "est-b",
        slug: "new-slug",
      }),
    );

    expect(updated.status).toBe("success");
    expect(updateForOwner).toHaveBeenCalledWith(
      "owner-a",
      { productId: "product-a" },
      { name: "Batata Especial", price: "21.50" },
    );
    expect(JSON.stringify(updateForOwner.mock.calls[0])).not.toContain("owner-b");
    expect(JSON.stringify(updateForOwner.mock.calls[0])).not.toContain("est-b");
    expect(JSON.stringify(updateForOwner.mock.calls[0])).not.toContain("new-slug");

    await core.pauseProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({ productId: "product-a", status: "ACTIVE" }),
    );

    expect(pauseForOwner).toHaveBeenCalledWith("owner-a", {
      productId: "product-a",
    });
  });

  it("maps validation, status, category, and thrown service failures to safe states", async () => {
    const validationCore = createProductActionCore({
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: vi.fn(async () => merchantSession("owner-a")),
      productService: createFakeProductActionService({
        createForOwner: async () => ({
          ok: false,
          code: "VALIDATION_FAILED",
          message: "Revise os campos destacados.",
          validationErrors: {
            fieldErrors: {
              name: ["Informe um nome com pelo menos 2 caracteres."],
              price: ["Prisma leaked DATABASE_URL passwordHash"],
            },
            formErrors: ["stack tokenHash leaked"],
          },
        }),
      }),
      revalidatePath: vi.fn(),
    });

    const validation = await validationCore.createProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({ name: "A", price: "abc" }),
    );

    expect(validation).toMatchObject({
      status: "error",
      message: "Revise os campos destacados.",
      fieldErrors: {
        name: ["Informe um nome com pelo menos 2 caracteres."],
        price: ["Revise este campo."],
      },
      formErrors: ["Não foi possível salvar o produto. Tente novamente."],
      values: { name: "A", description: "", categoryId: "", price: "abc" },
      merchantId: "owner-a",
    });
    expect(JSON.stringify(validation)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(validation)).not.toContain("passwordHash");
    expect(JSON.stringify(validation)).not.toContain("tokenHash");

    const categoryCore = createProductActionCore({
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: vi.fn(async () => merchantSession("owner-a")),
      productService: createFakeProductActionService({
        updateForOwner: async () => ({
          ok: false,
          code: "INVALID_CATEGORY",
          message: "Selecione uma categoria ativa de produto.",
          validationErrors: {
            fieldErrors: {
              categoryId: ["Selecione uma categoria ativa de produto."],
            },
            formErrors: [],
          },
        }),
      }),
      revalidatePath: vi.fn(),
    });

    const category = await categoryCore.updateProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({ productId: "product-a", categoryId: "cat-inactive" }),
    );

    expect(category).toMatchObject({
      status: "error",
      message: "Selecione uma categoria ativa de produto.",
      fieldErrors: { categoryId: ["Selecione uma categoria ativa de produto."] },
    });

    const inactiveCore = createProductActionCore({
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: vi.fn(async () => merchantSession("owner-a")),
      productService: createFakeProductActionService({
        activateForOwner: async () => ({
          ok: false,
          code: "OPERATION_NOT_ALLOWED",
          message: "Este estabelecimento precisa estar ativo para gerenciar produtos.",
        }),
      }),
      revalidatePath: vi.fn(),
    });

    const inactive = await inactiveCore.activateProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({ productId: "product-a" }),
    );

    expect(inactive).toMatchObject({
      status: "error",
      message: "Este estabelecimento precisa estar ativo para gerenciar produtos.",
    });

    const thrownCore = createProductActionCore({
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: vi.fn(async () => merchantSession("owner-a")),
      productService: createFakeProductActionService({
        archiveForOwner: async () => {
          throw new Error("Prisma stack leaked DATABASE_URL tokenHash");
        },
      }),
      revalidatePath: vi.fn(),
    });

    const thrown = await thrownCore.archiveProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({ productId: "product-a" }),
    );

    expect(thrown).toMatchObject({
      status: "error",
      message: "Não foi possível salvar o produto. Tente novamente.",
    });
    expect(JSON.stringify(thrown)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(thrown)).not.toContain("tokenHash");
  });

  it("revalidates merchant and public catalog paths after every successful mutation", async () => {
    const revalidatePath = vi.fn();
    const core = createProductActionCore({
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: vi.fn(async () => merchantSession("owner-a")),
      productService: createFakeProductActionService(),
      revalidatePath,
    });

    await core.createProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({ name: "Batata", price: "19.90" }),
    );
    await core.updateProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({ productId: "product-a", name: "Batata Especial" }),
    );
    await core.activateProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({ productId: "product-a" }),
    );
    await core.pauseProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({ productId: "product-a" }),
    );
    await core.archiveProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({ productId: "product-a" }),
    );

    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/estabelecimento",
      "/lojas",
      "/lojas/sextou-bar",
      "/estabelecimento",
      "/lojas",
      "/lojas/sextou-bar",
      "/estabelecimento",
      "/lojas",
      "/lojas/sextou-bar",
      "/estabelecimento",
      "/lojas",
      "/lojas/sextou-bar",
      "/estabelecimento",
      "/lojas",
      "/lojas/sextou-bar",
    ]);
  });

  it("returns a safe reload state when revalidation fails after service success", async () => {
    const updateForOwner = vi.fn(async () => okProduct(buildProduct()));
    const core = createProductActionCore({
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: vi.fn(async () => merchantSession("owner-a")),
      productService: createFakeProductActionService({ updateForOwner }),
      revalidatePath: () => {
        throw new Error("AUTH_SECRET and raw Next cache internals");
      },
    });

    const result = await core.updateProductAction(
      PRODUCT_ACTION_IDLE_STATE,
      productForm({ productId: "product-a", name: "Batata" }),
    );

    expect(result).toMatchObject({
      status: "error",
      message:
        "Produto salvo, mas não foi possível atualizar a visualização. Recarregue a página.",
      merchantId: "owner-a",
      productId: "product-a",
      establishmentSlug: "sextou-bar",
    });
    expect(updateForOwner).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("AUTH_SECRET");
  });
});

type ProductActionService = Pick<
  ProductServiceCore,
  | "activateForOwner"
  | "archiveForOwner"
  | "createForOwner"
  | "pauseForOwner"
  | "updateForOwner"
>;

function createFakeProductActionService(
  overrides: Partial<ProductActionService> = {},
): ProductActionService {
  return {
    activateForOwner: async () => okProduct(buildProduct({ status: "ACTIVE" })),
    archiveForOwner: async () => okProduct(buildProduct({ status: "ARCHIVED" })),
    createForOwner: async () => okProduct(buildProduct()),
    pauseForOwner: async () => okProduct(buildProduct({ status: "PAUSED" })),
    updateForOwner: async () => okProduct(buildProduct()),
    ...overrides,
  };
}

function productForm(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

function merchantSession(ownerId: string): AuthSessionContext {
  return {
    session: {
      createdAt: EARLIER,
      expiresAt: NOW,
      id: "session-1",
      lastUsedAt: NOW,
      revokedAt: null,
      userId: ownerId,
    },
    user: {
      email: "maria@example.com",
      id: ownerId,
      name: "Maria Comerciante",
      phone: "11999999999",
      role: "MERCHANT",
      status: "ACTIVE",
    },
  };
}

function buildProduct(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    category: null,
    categoryId: null,
    createdAt: EARLIER,
    description: "Porção crocante",
    establishmentId: "est-a",
    establishmentSlug: "sextou-bar",
    id: "product-a",
    imageUrl: null,
    isFeatured: false,
    name: "Batata",
    price: "19.90",
    slug: "batata",
    status: "ACTIVE",
    updatedAt: NOW,
    ...overrides,
  };
}

function okProduct(product: ProductDto): ProductResult<ProductDto> {
  return { ok: true, data: product };
}

function getString(input: unknown, key: string) {
  return isRecord(input) && typeof input[key] === "string" ? input[key] : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
