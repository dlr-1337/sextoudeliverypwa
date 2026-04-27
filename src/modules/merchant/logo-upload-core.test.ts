import { describe, expect, it, vi } from "vitest";

import { AuthError } from "../auth/errors";
import type { AuthSessionContext } from "../auth/types";
import {
  uploadFailure,
  uploadSuccess,
  type StoredUpload,
  type StoreImageInput,
  type UploadResult,
} from "../uploads/service-core";

import {
  createMerchantLogoUploadCore,
  type MerchantLogoUploadCoreDependencies,
  type MerchantLogoUploadFailure,
  type MerchantLogoUploadResult,
} from "./logo-upload-core";
import type {
  MerchantDashboardDto,
  MerchantEstablishmentDto,
  MerchantResult,
} from "./service-core";

const NOW = new Date("2026-04-27T02:40:00.000Z");
const EARLIER = new Date("2026-04-26T18:00:00.000Z");
const UUID = "11111111-1111-4111-8111-111111111111";
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

const STORED_UPLOAD: StoredUpload = {
  extension: "png",
  mediaType: "image/png",
  publicPath: `/uploads/establishments/est-a/logos/${UUID}.png`,
  publicUrl: `https://cdn.example.test/uploads/establishments/est-a/logos/${UUID}.png`,
  relativePath: `establishments/est-a/logos/${UUID}.png`,
  sizeBytes: PNG_BYTES.byteLength,
};

describe("merchant logo upload core", () => {
  it("rejects missing and wrong-role sessions before storage or merchant reads", async () => {
    const missing = createSubject({
      readSessionCookie: () => undefined,
      requireMerchantSession: async () => {
        throw new AuthError("TOKEN_INVALID", "raw session token missing");
      },
    });

    const missingResult = expectFailure(
      await missing.core.uploadMerchantLogo(logoForm()),
      "TOKEN_INVALID",
    );

    expect(missingResult.status).toBe(401);
    expect(missingResult.message).toBe("Sessão inválida. Faça login novamente.");
    expect(JSON.stringify(missingResult)).not.toContain("raw session token");
    expect(missing.uploadService.storeImage).not.toHaveBeenCalled();
    expect(missing.merchantService.getDashboardForOwner).not.toHaveBeenCalled();
    expect(missing.merchantService.updateLogoForOwner).not.toHaveBeenCalled();

    const wrongRole = createSubject({
      requireMerchantSession: async () => {
        throw new AuthError(
          "FORBIDDEN_ROLE",
          "Role CUSTOMER cannot access this server-only surface.",
        );
      },
    });

    const wrongRoleResult = expectFailure(
      await wrongRole.core.uploadMerchantLogo(logoForm()),
      "FORBIDDEN_ROLE",
    );

    expect(wrongRoleResult.status).toBe(403);
    expect(wrongRoleResult.message).toBe(
      "Você não tem permissão para acessar esta área.",
    );
    expect(JSON.stringify(wrongRoleResult)).not.toContain("CUSTOMER");
    expect(wrongRole.uploadService.storeImage).not.toHaveBeenCalled();
    expect(wrongRole.merchantService.getDashboardForOwner).not.toHaveBeenCalled();
    expect(wrongRole.merchantService.updateLogoForOwner).not.toHaveBeenCalled();
  });

  it("rejects pending, blocked, and inactive establishments before file storage", async () => {
    for (const status of ["PENDING", "BLOCKED", "INACTIVE"] as const) {
      const subject = createSubject({ dashboard: buildDashboard({ status }) });

      const result = expectFailure(
        await subject.core.uploadMerchantLogo(logoForm()),
        "INACTIVE_STATUS",
      );

      expect(result.status).toBe(409);
      expect(result.message).toBe(
        "Este estabelecimento precisa estar ativo para editar o perfil.",
      );
      expect(subject.merchantService.getDashboardForOwner).toHaveBeenCalledWith(
        "owner-a",
      );
      expect(subject.uploadService.storeImage).not.toHaveBeenCalled();
      expect(subject.merchantService.updateLogoForOwner).not.toHaveBeenCalled();
    }
  });

  it("requires exactly one logo file while ignoring unrelated forged fields", async () => {
    const subject = createSubject();
    const formData = new FormData();
    formData.set("establishmentId", "est-forged");
    formData.set("status", "ACTIVE");
    formData.set("slug", "forged-slug");

    const result = expectFailure(
      await subject.core.uploadMerchantLogo(formData),
      "MISSING_FILE",
    );

    expect(result.status).toBe(400);
    expect(result.message).toBe("Envie uma imagem de logo para continuar.");
    expect(JSON.stringify(result)).not.toContain("est-forged");
    expect(subject.uploadService.storeImage).not.toHaveBeenCalled();
    expect(subject.merchantService.updateLogoForOwner).not.toHaveBeenCalled();
  });

  it("maps oversized and invalid image validation failures without persistence", async () => {
    const oversized = createSubject({
      storeImage: async () => uploadFailure("FILE_TOO_LARGE"),
    });

    const oversizedResult = expectFailure(
      await oversized.core.uploadMerchantLogo(logoForm()),
      "FILE_TOO_LARGE",
    );

    expect(oversizedResult.status).toBe(400);
    expect(oversizedResult.message).toBe(
      "A imagem excede o tamanho máximo permitido.",
    );
    expect(oversized.merchantService.updateLogoForOwner).not.toHaveBeenCalled();

    const invalid = createSubject({
      storeImage: async () => uploadFailure("UNSUPPORTED_MIME"),
    });

    const invalidResult = expectFailure(
      await invalid.core.uploadMerchantLogo(logoForm()),
      "UNSUPPORTED_MIME",
    );

    expect(invalidResult.status).toBe(400);
    expect(invalidResult.message).toBe("Envie uma imagem PNG, JPG ou WebP válida.");
    expect(invalid.merchantService.updateLogoForOwner).not.toHaveBeenCalled();
  });

  it("stores under the session establishment and persists that public logo path", async () => {
    const subject = createSubject();
    const formData = logoForm();
    formData.set("establishmentId", "est-forged");
    formData.set("ownerId", "owner-b");

    const result = await subject.core.uploadMerchantLogo(formData);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(`Expected success, got ${result.code}`);
    }

    expect(result).toMatchObject({
      code: "LOGO_UPDATED",
      data: {
        establishmentId: "est-a",
        logoUrl: STORED_UPLOAD.publicPath,
        mediaType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
      },
      message: "Logo do estabelecimento atualizado com sucesso.",
      ok: true,
      status: 200,
    });
    expect(subject.uploadService.storeImage).toHaveBeenCalledWith(
      expect.objectContaining({
        clientMimeType: "image/png",
        originalFilename: "logo-original.png",
        scope: ["establishments", "est-a", "logos"],
      }),
    );
    expect(subject.uploadService.storeImage.mock.calls[0]?.[0].bytes).toBeInstanceOf(
      Uint8Array,
    );
    expect(JSON.stringify(subject.uploadService.storeImage.mock.calls)).not.toContain(
      "est-forged",
    );
    expect(subject.merchantService.updateLogoForOwner).toHaveBeenCalledWith(
      "owner-a",
      STORED_UPLOAD.publicPath,
    );
    expect(subject.uploadService.deleteStoredFile).not.toHaveBeenCalled();
  });

  it("best-effort deletes the stored file when DB persistence fails", async () => {
    const subject = createSubject({
      updateLogoForOwner: async () => ({
        code: "DATABASE_ERROR",
        message: "Prisma stack leaked DATABASE_URL and raw upload root",
        ok: false,
      }),
    });

    const result = expectFailure(
      await subject.core.uploadMerchantLogo(logoForm()),
      "DATABASE_ERROR",
    );

    expect(result.status).toBe(500);
    expect(result.message).toBe(
      "Não foi possível concluir a operação do estabelecimento. Tente novamente.",
    );
    expect(JSON.stringify(result)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(result)).not.toContain("raw upload root");
    expect(subject.uploadService.deleteStoredFile).toHaveBeenCalledWith(
      STORED_UPLOAD.relativePath,
    );
  });
});

type SubjectOverrides = Partial<
  Pick<
    MerchantLogoUploadCoreDependencies,
    "readSessionCookie" | "requireMerchantSession"
  >
> & {
  dashboard?: MerchantDashboardDto;
  storeImage?: (input: StoreImageInput) => Promise<UploadResult<StoredUpload>>;
  updateLogoForOwner?: (
    ownerId: unknown,
    logoUrl: unknown,
  ) => Promise<MerchantResult<MerchantEstablishmentDto>>;
};

function createSubject(overrides: SubjectOverrides = {}) {
  const readSessionCookie = vi.fn(overrides.readSessionCookie ?? (() => "merchant-token"));
  const requireMerchantSession = vi.fn(
    overrides.requireMerchantSession ?? (async () => merchantSession("owner-a")),
  );
  const merchantService = {
    getDashboardForOwner: vi.fn(async () =>
      okDashboard(overrides.dashboard ?? buildDashboard()),
    ),
    updateLogoForOwner: vi.fn(
      overrides.updateLogoForOwner ??
        (async (_ownerId: unknown, logoUrl: unknown) =>
          okEstablishment(buildEstablishment({ logoUrl: String(logoUrl) }))),
    ),
  };
  const uploadService = {
    deleteStoredFile: vi.fn(async () => uploadSuccess({ deleted: true as const })),
    storeImage: vi.fn(
      overrides.storeImage ?? (async () => uploadSuccess(STORED_UPLOAD)),
    ),
  };
  const core = createMerchantLogoUploadCore({
    merchantService,
    readSessionCookie,
    requireMerchantSession,
    uploadService,
  });

  return { core, merchantService, readSessionCookie, requireMerchantSession, uploadService };
}

function logoForm() {
  const formData = new FormData();
  const file = new Blob([PNG_BYTES], { type: "image/png" });

  formData.set("logo", file, "logo-original.png");

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

function buildDashboard(
  overrides: Partial<MerchantDashboardDto["establishment"]> = {},
): MerchantDashboardDto {
  const establishment = buildEstablishment(overrides);

  return {
    canEditProfile: establishment.status === "ACTIVE",
    establishment,
    statusMessage: "Seu estabelecimento está ativo.",
  };
}

function buildEstablishment(
  overrides: Partial<MerchantEstablishmentDto> = {},
): MerchantEstablishmentDto {
  return {
    addressLine1: "Rua Um, 10",
    addressLine2: null,
    category: null,
    categoryId: null,
    city: "São Paulo",
    createdAt: EARLIER,
    deliveryFee: "5.00",
    description: "Petiscos e bebidas",
    id: "est-a",
    logoUrl: null,
    minimumOrder: "15.00",
    name: "Sextou Bar",
    phone: "1133334444",
    postalCode: "01000-000",
    slug: "sextou-bar",
    state: "SP",
    status: "ACTIVE",
    updatedAt: NOW,
    whatsapp: "11999999999",
    ...overrides,
  };
}

function okDashboard(data: MerchantDashboardDto): MerchantResult<MerchantDashboardDto> {
  return { data, ok: true };
}

function okEstablishment(
  data: MerchantEstablishmentDto,
): MerchantResult<MerchantEstablishmentDto> {
  return { data, ok: true };
}

function expectFailure(
  result: MerchantLogoUploadResult,
  code: MerchantLogoUploadFailure["code"],
) {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected failure, got success.");
  }

  expect(result.code).toBe(code);
  expect(result.message).not.toContain("DATABASE_URL");
  expect(result.message).not.toContain("Prisma");
  expect(result.message).not.toContain("passwordHash");
  expect(result.message).not.toContain("tokenHash");
  expect(result.message).not.toContain("Error:");

  return result;
}
