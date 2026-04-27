import { describe, expect, it, vi } from "vitest";

import { AuthError } from "../auth/errors";
import type { AuthSessionContext } from "../auth/types";

import { MERCHANT_ACTION_IDLE_STATE } from "./action-state";
import { createMerchantActionCore } from "./action-core";
import {
  createMerchantServiceCore,
  type MerchantCategoryDto,
  type MerchantDbEstablishment,
  type MerchantEstablishmentDto,
  type MerchantResult,
  type MerchantServiceClient,
} from "./service-core";

const NOW = new Date("2026-04-27T01:20:00.000Z");
const EARLIER = new Date("2026-04-26T18:00:00.000Z");

describe("merchant profile server action core", () => {
  it("rejects missing, customer, and admin sessions before service mutation", async () => {
    const noCookieUpdate = vi.fn(async () => okEstablishment(buildDto()));
    const noCookieCore = createMerchantActionCore({
      readSessionCookie: () => undefined,
      requireMerchantSession: async (rawToken) => {
        expect(rawToken).toBeUndefined();
        throw new AuthError("TOKEN_INVALID", "raw missing session token");
      },
      merchantService: { updateProfileForOwner: noCookieUpdate },
      revalidatePath: vi.fn(),
    });

    const missingCookie = await noCookieCore.updateMerchantProfileAction(
      MERCHANT_ACTION_IDLE_STATE,
      profileForm({ name: "Sextou Bar" }),
    );

    expect(missingCookie).toMatchObject({
      status: "error",
      message: "Sessão inválida. Faça login novamente.",
    });
    expect(JSON.stringify(missingCookie)).not.toContain("session token");
    expect(noCookieUpdate).not.toHaveBeenCalled();

    for (const role of ["CUSTOMER", "ADMIN"] as const) {
      const updateProfileForOwner = vi.fn(async () => okEstablishment(buildDto()));
      const roleCore = createMerchantActionCore({
        readSessionCookie: () => `${role.toLowerCase()}-token`,
        requireMerchantSession: async (rawToken) => {
          expect(rawToken).toBe(`${role.toLowerCase()}-token`);
          throw new AuthError(
            "FORBIDDEN_ROLE",
            `Role ${role} cannot access this server-only surface.`,
          );
        },
        merchantService: { updateProfileForOwner },
        revalidatePath: vi.fn(),
      });

      const forbidden = await roleCore.updateMerchantProfileAction(
        MERCHANT_ACTION_IDLE_STATE,
        profileForm({ name: "Sextou Bar" }),
      );

      expect(forbidden).toMatchObject({
        status: "error",
        message: "Você não tem permissão para acessar esta área.",
      });
      expect(JSON.stringify(forbidden)).not.toContain(role);
      expect(updateProfileForOwner).not.toHaveBeenCalled();
    }
  });

  it("sends only allowlisted profile fields and revalidates only /estabelecimento", async () => {
    const updateProfileForOwner = vi.fn(async (_ownerId: unknown, input: unknown) =>
      okEstablishment(buildDto({ id: "est-active", name: getString(input, "name") })),
    );
    const revalidatePath = vi.fn();
    const core = createMerchantActionCore({
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: vi.fn(async () => merchantSession("owner-a")),
      merchantService: { updateProfileForOwner },
      revalidatePath,
    });

    const result = await core.updateMerchantProfileAction(
      MERCHANT_ACTION_IDLE_STATE,
      profileForm({
        id: "est-forged",
        ownerId: "owner-b",
        status: "ACTIVE",
        slug: "forged-slug",
        logoUrl: "/uploads/forged.webp",
        name: " Sextou Delivery ",
        categoryId: "cat-est",
        description: "Petiscos e bebidas",
        phone: "1133334444",
        whatsapp: "11999999999",
        addressLine1: "Rua Um, 10",
        addressLine2: "Sala 2",
        city: "São Paulo",
        state: "SP",
        postalCode: "01000-000",
        deliveryFee: "7,50",
        minimumOrder: "20.00",
      }),
    );

    expect(result).toMatchObject({
      status: "success",
      message: "Perfil do estabelecimento atualizado com sucesso.",
      establishmentId: "est-active",
      merchantId: "owner-a",
    });
    expect(updateProfileForOwner).toHaveBeenCalledWith("owner-a", {
      name: " Sextou Delivery ",
      categoryId: "cat-est",
      description: "Petiscos e bebidas",
      phone: "1133334444",
      whatsapp: "11999999999",
      addressLine1: "Rua Um, 10",
      addressLine2: "Sala 2",
      city: "São Paulo",
      state: "SP",
      postalCode: "01000-000",
      deliveryFee: "7,50",
      minimumOrder: "20.00",
    });
    expect(JSON.stringify(updateProfileForOwner.mock.calls[0])).not.toContain(
      "est-forged",
    );
    expect(JSON.stringify(updateProfileForOwner.mock.calls[0])).not.toContain(
      "owner-b",
    );
    expect(JSON.stringify(updateProfileForOwner.mock.calls[0])).not.toContain(
      "forged-slug",
    );
    expect(JSON.stringify(updateProfileForOwner.mock.calls[0])).not.toContain(
      "/uploads/forged.webp",
    );
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/estabelecimento",
    ]);
    expect(JSON.stringify(result)).not.toContain("passwordHash");
    expect(JSON.stringify(result)).not.toContain("tokenHash");
  });

  it("maps malformed FormData to field errors with only safe submitted values", async () => {
    const fakeDb = createFakeMerchantDb({
      establishments: [buildEstablishment({ ownerId: "owner-a" })],
    });
    const core = createMerchantActionCore({
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: vi.fn(async () => merchantSession("owner-a")),
      merchantService: createMerchantServiceCore({ db: fakeDb }),
      revalidatePath: vi.fn(),
    });

    const result = await core.updateMerchantProfileAction(
      MERCHANT_ACTION_IDLE_STATE,
      profileForm({
        id: "est-forged",
        ownerId: "owner-b",
        status: "BLOCKED",
        slug: "forged-slug",
        logoUrl: "/uploads/forged.webp",
        name: " ",
        description: "D".repeat(501),
        deliveryFee: "abc",
        minimumOrder: "-1",
      }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toBe("Revise os campos destacados.");
    expect(result.fieldErrors?.name).toContain(
      "Informe um nome com pelo menos 2 caracteres.",
    );
    expect(result.fieldErrors?.description).toContain(
      "Informe uma descrição com até 500 caracteres.",
    );
    expect(result.fieldErrors?.deliveryFee).toContain(
      "Informe um valor em dinheiro válido.",
    );
    expect(result.fieldErrors?.minimumOrder).toContain(
      "Informe um valor maior ou igual a zero.",
    );
    expect(result.fieldErrors?.id).toBeUndefined();
    expect(result.values).toMatchObject({
      name: " ",
      description: "D".repeat(501),
      deliveryFee: "abc",
      minimumOrder: "-1",
    });
    expect(JSON.stringify(result.values)).not.toContain("est-forged");
    expect(JSON.stringify(result.values)).not.toContain("owner-b");
    expect(JSON.stringify(result.values)).not.toContain("forged-slug");
    expect(JSON.stringify(result.values)).not.toContain("/uploads/forged.webp");
    expect(fakeDb.calls.establishmentUpdate).toEqual([]);
  });

  it("returns safe category and inactive-status failures without mutating", async () => {
    const invalidCategoryDb = createFakeMerchantDb({
      establishments: [buildEstablishment({ ownerId: "owner-a" })],
      categories: [buildCategory({ id: "cat-product", type: "PRODUCT" })],
    });
    const invalidCategoryCore = createMerchantActionCore({
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: vi.fn(async () => merchantSession("owner-a")),
      merchantService: createMerchantServiceCore({ db: invalidCategoryDb }),
      revalidatePath: vi.fn(),
    });

    const invalidCategory = await invalidCategoryCore.updateMerchantProfileAction(
      MERCHANT_ACTION_IDLE_STATE,
      profileForm({ name: "Sextou Bar", categoryId: "cat-product" }),
    );

    expect(invalidCategory).toMatchObject({
      status: "error",
      message: "Selecione uma categoria ativa de estabelecimento.",
      values: { name: "Sextou Bar", categoryId: "cat-product" },
    });
    expect(invalidCategory.fieldErrors?.categoryId).toContain(
      "Selecione uma categoria ativa de estabelecimento.",
    );
    expect(invalidCategoryDb.calls.establishmentUpdate).toEqual([]);

    for (const status of ["PENDING", "BLOCKED", "INACTIVE"] as const) {
      const inactiveDb = createFakeMerchantDb({
        establishments: [buildEstablishment({ ownerId: `owner-${status}`, status })],
      });
      const inactiveCore = createMerchantActionCore({
        readSessionCookie: () => "merchant-token",
        requireMerchantSession: vi.fn(async () => merchantSession(`owner-${status}`)),
        merchantService: createMerchantServiceCore({ db: inactiveDb }),
        revalidatePath: vi.fn(),
      });

      const inactive = await inactiveCore.updateMerchantProfileAction(
        MERCHANT_ACTION_IDLE_STATE,
        profileForm({ name: "Sextou Bar" }),
      );

      expect(inactive).toMatchObject({
        status: "error",
        message: "Este estabelecimento precisa estar ativo para editar o perfil.",
      });
      expect(JSON.stringify(inactive)).not.toContain("Prisma");
      expect(inactiveDb.calls.establishmentUpdate).toEqual([]);
    }
  });

  it("does not leak thrown service failures or unsafe service-returned text", async () => {
    const thrownCore = createMerchantActionCore({
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: vi.fn(async () => merchantSession("owner-a")),
      merchantService: {
        updateProfileForOwner: async () => {
          throw new Error("Prisma stack leaked DATABASE_URL passwordHash tokenHash");
        },
      },
      revalidatePath: vi.fn(),
    });

    const thrown = await thrownCore.updateMerchantProfileAction(
      MERCHANT_ACTION_IDLE_STATE,
      profileForm({ name: "Sextou Bar" }),
    );

    expect(thrown).toMatchObject({
      status: "error",
      message: "Não foi possível salvar o perfil do estabelecimento. Tente novamente.",
    });
    expect(JSON.stringify(thrown)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(thrown)).not.toContain("passwordHash");
    expect(JSON.stringify(thrown)).not.toContain("tokenHash");

    const unsafeCore = createMerchantActionCore({
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: vi.fn(async () => merchantSession("owner-a")),
      merchantService: {
        updateProfileForOwner: async () => ({
          ok: false,
          code: "DATABASE_ERROR",
          message: "Prisma leaked DATABASE_URL",
          validationErrors: {
            fieldErrors: { name: ["passwordHash leaked"] },
            formErrors: ["stack tokenHash leaked"],
          },
        }),
      },
      revalidatePath: vi.fn(),
    });

    const unsafe = await unsafeCore.updateMerchantProfileAction(
      MERCHANT_ACTION_IDLE_STATE,
      profileForm({ name: "Sextou Bar" }),
    );

    expect(unsafe).toMatchObject({
      status: "error",
      message: "Não foi possível salvar o perfil do estabelecimento. Tente novamente.",
      fieldErrors: { name: ["Revise este campo."] },
      formErrors: [
        "Não foi possível salvar o perfil do estabelecimento. Tente novamente.",
      ],
    });
    expect(JSON.stringify(unsafe)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(unsafe)).not.toContain("passwordHash");
    expect(JSON.stringify(unsafe)).not.toContain("tokenHash");
  });

  it("returns a safe reload message when revalidation fails after mutation", async () => {
    const updateProfileForOwner = vi.fn(async () => okEstablishment(buildDto()));
    const revalidatePath = vi.fn(() => {
      throw new Error("AUTH_SECRET and raw Next cache internals");
    });
    const core = createMerchantActionCore({
      readSessionCookie: () => "merchant-token",
      requireMerchantSession: vi.fn(async () => merchantSession("owner-a")),
      merchantService: { updateProfileForOwner },
      revalidatePath,
    });

    const result = await core.updateMerchantProfileAction(
      MERCHANT_ACTION_IDLE_STATE,
      profileForm({ name: "Sextou Bar" }),
    );

    expect(result).toMatchObject({
      status: "error",
      message:
        "Perfil salvo, mas não foi possível atualizar a visualização. Recarregue a página.",
      establishmentId: "est-a",
      merchantId: "owner-a",
    });
    expect(updateProfileForOwner).toHaveBeenCalledTimes(1);
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/estabelecimento",
    ]);
    expect(JSON.stringify(result)).not.toContain("AUTH_SECRET");
  });
});

type FakeMerchantState = {
  categories: MerchantCategoryDto[];
  establishments: MerchantDbEstablishment[];
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

        const establishment = state.establishments
          .filter((candidate) => candidate.ownerId === args.where.ownerId)
          .sort(compareEstablishments)[0];

        return establishment ? cloneEstablishment(establishment) : null;
      },
      async update(args) {
        calls.establishmentUpdate.push(args);

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

function profileForm(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

function merchantSession(ownerId: string): AuthSessionContext {
  return {
    session: {
      id: "session-1",
      userId: ownerId,
      expiresAt: NOW,
      lastUsedAt: NOW,
      revokedAt: null,
      createdAt: EARLIER,
    },
    user: {
      id: ownerId,
      name: "Maria Comerciante",
      email: "maria@example.com",
      role: "MERCHANT",
      status: "ACTIVE",
      phone: "11999999999",
    },
  };
}

function buildEstablishment(
  overrides: Partial<MerchantDbEstablishment> = {},
): MerchantDbEstablishment {
  return {
    id: "est-a",
    ownerId: "owner-a",
    categoryId: "cat-est",
    name: "Sextou Bar",
    slug: "sextou-bar",
    description: "Petiscos e bebidas",
    logoUrl: null,
    status: "ACTIVE",
    phone: "1133334444",
    whatsapp: "11999999999",
    addressLine1: "Rua Um, 10",
    addressLine2: null,
    city: "São Paulo",
    state: "SP",
    postalCode: "01000-000",
    deliveryFee: "5.00",
    minimumOrder: "15.00",
    createdAt: EARLIER,
    updatedAt: NOW,
    category: buildCategory({ id: "cat-est" }),
    ...overrides,
  };
}

function buildDto(
  overrides: Partial<MerchantEstablishmentDto> = {},
): MerchantEstablishmentDto {
  return {
    id: "est-a",
    categoryId: "cat-est",
    name: "Sextou Bar",
    slug: "sextou-bar",
    description: "Petiscos e bebidas",
    logoUrl: null,
    status: "ACTIVE",
    phone: "1133334444",
    whatsapp: "11999999999",
    addressLine1: "Rua Um, 10",
    addressLine2: null,
    city: "São Paulo",
    state: "SP",
    postalCode: "01000-000",
    deliveryFee: "5.00",
    minimumOrder: "15.00",
    createdAt: EARLIER,
    updatedAt: NOW,
    category: buildCategory({ id: "cat-est" }),
    ...overrides,
  };
}

function buildCategory(
  overrides: Partial<MerchantCategoryDto> = {},
): MerchantCategoryDto {
  return {
    id: "cat-est",
    name: "Restaurantes",
    slug: "restaurantes",
    type: "ESTABLISHMENT",
    isActive: true,
    ...overrides,
  };
}

function okEstablishment(
  establishment: MerchantEstablishmentDto,
): MerchantResult<MerchantEstablishmentDto> {
  return { ok: true, data: establishment };
}

function compareEstablishments(
  first: MerchantDbEstablishment,
  second: MerchantDbEstablishment,
) {
  return (
    first.createdAt.getTime() - second.createdAt.getTime() ||
    first.id.localeCompare(second.id, "pt-BR")
  );
}

function cloneEstablishment(
  establishment: MerchantDbEstablishment,
): MerchantDbEstablishment {
  return {
    ...establishment,
    createdAt: new Date(establishment.createdAt.getTime()),
    updatedAt: new Date(establishment.updatedAt.getTime()),
    category: establishment.category ? cloneCategory(establishment.category) : null,
  };
}

function cloneCategory(category: MerchantCategoryDto): MerchantCategoryDto {
  return { ...category };
}

function getString(input: unknown, key: string) {
  return isRecord(input) && typeof input[key] === "string" ? input[key] : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
