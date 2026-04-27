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
  createProductPhotoUploadCore,
  getProductPhotoContentLengthSizeFailure,
  parseProductPhotoContentLength,
  PRODUCT_PHOTO_MULTIPART_OVERHEAD_BYTES,
  type ProductPhotoUploadCoreDependencies,
  type ProductPhotoUploadFailure,
  type ProductPhotoUploadResult,
} from "./photo-upload-core";
import type { ProductDto, ProductResult, ProductServiceCore } from "./service-core";

const NOW = new Date("2026-04-27T03:30:00.000Z");
const EARLIER = new Date("2026-04-26T18:00:00.000Z");
const UUID = "22222222-2222-4222-8222-222222222222";
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

const STORED_UPLOAD: StoredUpload = {
  extension: "png",
  mediaType: "image/png",
  publicPath: `/uploads/products/product-a/photos/${UUID}.png`,
  publicUrl: `https://cdn.example.test/uploads/products/product-a/photos/${UUID}.png`,
  relativePath: `products/product-a/photos/${UUID}.png`,
  sizeBytes: PNG_BYTES.byteLength,
};

describe("product photo upload core", () => {
  it("rejects missing and wrong-role sessions before product reads or storage", async () => {
    const missing = createSubject({
      readSessionCookie: () => undefined,
      requireMerchantSession: async () => {
        throw new AuthError("TOKEN_INVALID", "raw session token missing");
      },
    });

    const missingResult = expectFailure(
      await missing.core.uploadProductPhoto("product-a", photoForm()),
      "TOKEN_INVALID",
    );

    expect(missingResult.status).toBe(401);
    expect(missingResult.message).toBe("Sessão inválida. Faça login novamente.");
    expect(JSON.stringify(missingResult)).not.toContain("session token");
    expect(missing.productService.getImageUploadAuthorityForOwner).not.toHaveBeenCalled();
    expect(missing.uploadService.storeImage).not.toHaveBeenCalled();

    for (const role of ["CUSTOMER", "ADMIN"] as const) {
      const subject = createSubject({
        requireMerchantSession: async () => {
          throw new AuthError(
            "FORBIDDEN_ROLE",
            `Role ${role} cannot access this server-only surface.`,
          );
        },
      });

      const result = expectFailure(
        await subject.core.uploadProductPhoto("product-a", photoForm()),
        "FORBIDDEN_ROLE",
      );

      expect(result.status).toBe(403);
      expect(result.message).toBe("Você não tem permissão para acessar esta área.");
      expect(JSON.stringify(result)).not.toContain(role);
      expect(subject.productService.getImageUploadAuthorityForOwner).not.toHaveBeenCalled();
      expect(subject.uploadService.storeImage).not.toHaveBeenCalled();
    }
  });

  it("uses the route product id for authority and storage while ignoring forged body ids", async () => {
    const subject = createSubject();
    const formData = photoForm();
    formData.set("productId", "product-b");
    formData.set("ownerId", "owner-b");
    formData.set("establishmentId", "est-b");
    formData.set("status", "ACTIVE");

    const result = await subject.core.uploadProductPhoto("product-a", formData);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(`Expected success, got ${result.code}`);
    }

    expect(result).toMatchObject({
      ok: true,
      code: "PHOTO_UPDATED",
      message: "Foto do produto atualizada com sucesso.",
      status: 200,
      data: {
        productId: "product-a",
        imageUrl: STORED_UPLOAD.publicPath,
        establishmentSlug: "sextou-bar",
        mediaType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
      },
    });
    expect(subject.productService.getImageUploadAuthorityForOwner).toHaveBeenCalledWith(
      "owner-a",
      { productId: "product-a" },
    );
    expect(subject.uploadService.storeImage).toHaveBeenCalledWith(
      expect.objectContaining({
        clientMimeType: "image/png",
        originalFilename: "produto-original.png",
        scope: ["products", "product-a", "photos"],
      }),
    );
    expect(subject.uploadService.storeImage.mock.calls[0]?.[0].bytes).toBeInstanceOf(
      Uint8Array,
    );
    expect(subject.productService.updateImageForOwner).toHaveBeenCalledWith(
      "owner-a",
      { productId: "product-a" },
      { imageUrl: STORED_UPLOAD.publicPath },
    );
    expect(JSON.stringify(subject.uploadService.storeImage.mock.calls)).not.toContain(
      "product-b",
    );
    expect(JSON.stringify(subject.productService.updateImageForOwner.mock.calls)).not.toContain(
      "owner-b",
    );
    expect(subject.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/estabelecimento",
      "/lojas",
      "/lojas/sextou-bar",
    ]);
  });

  it("denies malformed ids, inactive establishments, and cross-owner products before storage", async () => {
    const malformed = createSubject({
      getImageUploadAuthorityForOwner: async () => ({
        ok: false,
        code: "VALIDATION_FAILED",
        message: "Revise os campos destacados.",
        validationErrors: {
          fieldErrors: { productId: ["Informe o identificador do produto."] },
          formErrors: [],
        },
      }),
    });

    const malformedResult = expectFailure(
      await malformed.core.uploadProductPhoto(" ", photoForm()),
      "VALIDATION_FAILED",
    );

    expect(malformedResult.status).toBe(400);
    expect(malformedResult.message).toBe("Revise os campos destacados.");
    expect(malformed.uploadService.storeImage).not.toHaveBeenCalled();

    const inactive = createSubject({
      getImageUploadAuthorityForOwner: async () => ({
        ok: false,
        code: "OPERATION_NOT_ALLOWED",
        message: "Este estabelecimento precisa estar ativo para gerenciar produtos.",
      }),
    });

    const inactiveResult = expectFailure(
      await inactive.core.uploadProductPhoto("product-a", photoForm()),
      "OPERATION_NOT_ALLOWED",
    );

    expect(inactiveResult.status).toBe(409);
    expect(inactive.uploadService.storeImage).not.toHaveBeenCalled();

    const crossOwner = createSubject({
      getImageUploadAuthorityForOwner: async () => ({
        ok: false,
        code: "NOT_FOUND",
        message: "Produto ou estabelecimento não encontrado para este comerciante.",
      }),
    });

    const crossOwnerResult = expectFailure(
      await crossOwner.core.uploadProductPhoto("product-b", photoForm()),
      "NOT_FOUND",
    );

    expect(crossOwnerResult.status).toBe(404);
    expect(crossOwner.uploadService.storeImage).not.toHaveBeenCalled();
  });

  it("requires exactly one photo file before storage", async () => {
    const missing = createSubject();
    const missingResult = expectFailure(
      await missing.core.uploadProductPhoto("product-a", new FormData()),
      "MISSING_FILE",
    );

    expect(missingResult.status).toBe(400);
    expect(missingResult.message).toBe("Envie uma foto do produto para continuar.");
    expect(missing.uploadService.storeImage).not.toHaveBeenCalled();

    const multiple = createSubject();
    const multiplePhotos = new FormData();
    multiplePhotos.append("photo", new Blob([PNG_BYTES], { type: "image/png" }), "a.png");
    multiplePhotos.append("photo", new Blob([PNG_BYTES], { type: "image/png" }), "b.png");

    const multipleResult = expectFailure(
      await multiple.core.uploadProductPhoto("product-a", multiplePhotos),
      "MULTIPLE_FILES",
    );

    expect(multipleResult.status).toBe(400);
    expect(multipleResult.message).toBe("Envie apenas uma foto do produto por vez.");
    expect(multiple.uploadService.storeImage).not.toHaveBeenCalled();
  });

  it("returns safe failures for malformed and oversized content-length prechecks", () => {
    expect(parseProductPhotoContentLength(null)).toEqual({
      ok: true,
      contentLength: null,
    });

    const malformed = parseProductPhotoContentLength("abc");

    expect(malformed.ok).toBe(false);

    if (malformed.ok) {
      throw new Error("Expected malformed content-length failure.");
    }

    expect(malformed.failure).toMatchObject({
      ok: false,
      code: "MALFORMED_MULTIPART",
      message: "Não foi possível ler o envio da foto. Tente novamente.",
      status: 400,
    });

    const negative = parseProductPhotoContentLength("-1");

    expect(negative.ok).toBe(false);

    if (negative.ok) {
      throw new Error("Expected negative content-length failure.");
    }

    expect(negative.failure.code).toBe("MALFORMED_MULTIPART");

    const oversized = getProductPhotoContentLengthSizeFailure(
      PRODUCT_PHOTO_MULTIPART_OVERHEAD_BYTES + 2,
      1,
    );

    expect(oversized).toMatchObject({
      ok: false,
      code: "FILE_TOO_LARGE",
      message: "A imagem excede o tamanho máximo permitido.",
      status: 400,
    });
    expect(getProductPhotoContentLengthSizeFailure(100, 100)).toBeNull();
  });

  it("maps upload validation and storage failures without updating the product", async () => {
    for (const code of ["FILE_TOO_LARGE", "UNSUPPORTED_MIME", "STORAGE_ERROR"] as const) {
      const subject = createSubject({
        storeImage: async () => uploadFailure(code),
      });

      const result = expectFailure(
        await subject.core.uploadProductPhoto("product-a", photoForm()),
        code,
      );

      expect(result.status).toBe(code === "STORAGE_ERROR" ? 500 : 400);
      expect(subject.productService.updateImageForOwner).not.toHaveBeenCalled();
      expect(subject.uploadService.deleteStoredFile).not.toHaveBeenCalled();
    }
  });

  it("best-effort deletes the stored file when DB persistence fails", async () => {
    const subject = createSubject({
      updateImageForOwner: async () => ({
        ok: false,
        code: "DATABASE_ERROR",
        message: "Prisma stack leaked DATABASE_URL and raw upload root",
      }),
    });

    const result = expectFailure(
      await subject.core.uploadProductPhoto("product-a", photoForm()),
      "DATABASE_ERROR",
    );

    expect(result.status).toBe(500);
    expect(result.message).toBe(
      "Não foi possível concluir a operação de produto. Tente novamente.",
    );
    expect(JSON.stringify(result)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(result)).not.toContain("raw upload root");
    expect(subject.uploadService.deleteStoredFile).toHaveBeenCalledWith(
      STORED_UPLOAD.relativePath,
    );
    expect(subject.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a safe reload failure when cache revalidation fails after persistence", async () => {
    const subject = createSubject({
      revalidatePath: () => {
        throw new Error("AUTH_SECRET and raw Next cache internals");
      },
    });

    const result = expectFailure(
      await subject.core.uploadProductPhoto("product-a", photoForm()),
      "REVALIDATION_FAILED",
    );

    expect(result.status).toBe(500);
    expect(result.message).toBe(
      "Foto salva, mas não foi possível atualizar a visualização. Recarregue a página.",
    );
    expect(subject.productService.updateImageForOwner).toHaveBeenCalledTimes(1);
    expect(subject.uploadService.deleteStoredFile).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("AUTH_SECRET");
  });
});

type ProductPhotoService = Pick<
  ProductServiceCore,
  "getImageUploadAuthorityForOwner" | "updateImageForOwner"
>;

type SubjectOverrides = Partial<
  Pick<
    ProductPhotoUploadCoreDependencies,
    "readSessionCookie" | "requireMerchantSession" | "revalidatePath"
  >
> & {
  getImageUploadAuthorityForOwner?: ProductPhotoService["getImageUploadAuthorityForOwner"];
  storeImage?: (input: StoreImageInput) => Promise<UploadResult<StoredUpload>>;
  updateImageForOwner?: ProductPhotoService["updateImageForOwner"];
};

function createSubject(overrides: SubjectOverrides = {}) {
  const readSessionCookie = vi.fn(overrides.readSessionCookie ?? (() => "merchant-token"));
  const requireMerchantSession = vi.fn(
    overrides.requireMerchantSession ?? (async () => merchantSession("owner-a")),
  );
  const productService = {
    getImageUploadAuthorityForOwner: vi.fn(
      overrides.getImageUploadAuthorityForOwner ??
        (async () => okProduct(buildProduct({ imageUrl: null }))),
    ),
    updateImageForOwner: vi.fn(
      overrides.updateImageForOwner ??
        (async (_ownerId: unknown, _productId: unknown, imageInput: unknown) =>
          okProduct(buildProduct({ imageUrl: getString(imageInput, "imageUrl") }))),
    ),
  };
  const uploadService = {
    deleteStoredFile: vi.fn(async () => uploadSuccess({ deleted: true as const })),
    storeImage: vi.fn(
      overrides.storeImage ?? (async () => uploadSuccess(STORED_UPLOAD)),
    ),
  };
  const revalidatePath = vi.fn(overrides.revalidatePath ?? (() => undefined));
  const core = createProductPhotoUploadCore({
    productService,
    readSessionCookie,
    requireMerchantSession,
    revalidatePath,
    uploadService,
  });

  return {
    core,
    productService,
    readSessionCookie,
    requireMerchantSession,
    revalidatePath,
    uploadService,
  };
}

function photoForm() {
  const formData = new FormData();
  const file = new Blob([PNG_BYTES], { type: "image/png" });

  formData.set("photo", file, "produto-original.png");

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

function expectFailure(
  result: ProductPhotoUploadResult,
  code: ProductPhotoUploadFailure["code"],
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

function getString(input: unknown, key: string) {
  return isRecord(input) && typeof input[key] === "string" ? input[key] : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
