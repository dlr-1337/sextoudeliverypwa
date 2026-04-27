import {
  AUTH_ERROR_MESSAGES,
  getPublicAuthErrorMessage,
  isAuthError,
  type AuthErrorCode,
} from "../auth/errors";
import type { AuthSessionContext } from "../auth/types";
import {
  UPLOAD_ERROR_MESSAGES,
  UPLOAD_FAILURE_STATUS,
  type StoredUpload,
  type StoreImageInput,
  type UploadFailure,
  type UploadServiceCore,
} from "../uploads/service-core";

import {
  PRODUCT_ERROR_MESSAGES,
  type ProductFailure,
  type ProductFailureCode,
  type ProductResult,
  type ProductServiceCore,
} from "./service-core";

const MERCHANT_PANEL_PATH = "/estabelecimento";
const PUBLIC_STORES_PATH = "/lojas";

export const PRODUCT_PHOTO_MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export const PRODUCT_PHOTO_UPLOAD_MESSAGES = {
  PHOTO_UPDATED: "Foto do produto atualizada com sucesso.",
  MISSING_FILE: "Envie uma foto do produto para continuar.",
  MULTIPLE_FILES: "Envie apenas uma foto do produto por vez.",
  READ_FAILED: "Não foi possível ler a foto enviada. Tente novamente.",
  MALFORMED_MULTIPART: "Não foi possível ler o envio da foto. Tente novamente.",
  REVALIDATION_FAILED:
    "Foto salva, mas não foi possível atualizar a visualização. Recarregue a página.",
  GENERIC_FAILURE: "Não foi possível atualizar a foto do produto. Tente novamente.",
} as const;

export const PRODUCT_PHOTO_UPLOAD_FAILURE_STATUS = {
  MISSING_FILE: 400,
  MULTIPLE_FILES: 400,
  READ_FAILED: 400,
  MALFORMED_MULTIPART: 400,
  REVALIDATION_FAILED: 500,
} as const;

export type ProductPhotoUploadLocalFailureCode =
  keyof typeof PRODUCT_PHOTO_UPLOAD_FAILURE_STATUS;
export type ProductPhotoUploadFailureCode =
  | AuthErrorCode
  | ProductFailureCode
  | UploadFailure["code"]
  | ProductPhotoUploadLocalFailureCode;

export type ProductPhotoUploadFailure = {
  ok: false;
  code: ProductPhotoUploadFailureCode;
  message: string;
  status: number;
};

export type ProductPhotoUploadSuccess = {
  ok: true;
  code: "PHOTO_UPDATED";
  message: string;
  status: 200;
  data: {
    productId: string;
    imageUrl: string;
    establishmentSlug: string;
    mediaType: StoredUpload["mediaType"];
    sizeBytes: number;
  };
};

export type ProductPhotoUploadResult =
  | ProductPhotoUploadFailure
  | ProductPhotoUploadSuccess;

export type ProductPhotoContentLengthParseResult =
  | { ok: true; contentLength: number | null }
  | { ok: false; failure: ProductPhotoUploadFailure };

export function parseProductPhotoContentLength(
  rawContentLength: string | null,
): ProductPhotoContentLengthParseResult {
  if (!rawContentLength) {
    return { ok: true, contentLength: null };
  }

  const contentLength = Number(rawContentLength);

  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    return {
      ok: false,
      failure: localFailure("MALFORMED_MULTIPART"),
    };
  }

  return { ok: true, contentLength };
}

export function getProductPhotoContentLengthSizeFailure(
  contentLength: number,
  maxUploadBytes: number,
): ProductPhotoUploadFailure | null {
  const maxMultipartBytes = maxUploadBytes + PRODUCT_PHOTO_MULTIPART_OVERHEAD_BYTES;

  if (contentLength > maxMultipartBytes) {
    return createProductPhotoUploadFailure(
      "FILE_TOO_LARGE",
      UPLOAD_FAILURE_STATUS.FILE_TOO_LARGE,
      UPLOAD_ERROR_MESSAGES.FILE_TOO_LARGE,
    );
  }

  return null;
}

type MaybePromise<T> = T | Promise<T>;

type ProductPhotoService = Pick<
  ProductServiceCore,
  "getImageUploadAuthorityForOwner" | "updateImageForOwner"
>;

type ProductPhotoStorageService = Pick<
  UploadServiceCore,
  "deleteStoredFile" | "storeImage"
>;

export type ProductPhotoUploadCoreDependencies = {
  readSessionCookie: () => MaybePromise<unknown>;
  requireMerchantSession: (rawToken: unknown) => MaybePromise<AuthSessionContext>;
  productService: ProductPhotoService;
  uploadService: ProductPhotoStorageService;
  revalidatePath: (path: string) => MaybePromise<void>;
};

export function createProductPhotoUploadCore(
  dependencies: ProductPhotoUploadCoreDependencies,
) {
  async function uploadProductPhoto(
    productId: string,
    formData: FormData,
  ): Promise<ProductPhotoUploadResult> {
    const guard = await requireMerchantOrFailure(dependencies);

    if (!guard.ok) {
      return guard.failure;
    }

    const productIdInput = { productId };
    const authority = await safelyCallProductService(() =>
      dependencies.productService.getImageUploadAuthorityForOwner(
        guard.session.user.id,
        productIdInput,
      ),
    );

    if (!authority.ok) {
      return productFailureToPhotoFailure(authority);
    }

    const photoFile = getSinglePhotoFile(formData);

    if (!photoFile.ok) {
      return photoFile.failure;
    }

    const bytes = await readPhotoBytes(photoFile.file);

    if (!bytes.ok) {
      return bytes.failure;
    }

    const stored = await dependencies.uploadService.storeImage({
      bytes: bytes.data,
      clientMimeType: getOptionalString(photoFile.file.type),
      originalFilename: getOptionalString(photoFile.file.name),
      scope: ["products", authority.data.id, "photos"],
    });

    if (!stored.ok) {
      return uploadFailureToPhotoFailure(stored);
    }

    const persisted = await safelyCallProductService(() =>
      dependencies.productService.updateImageForOwner(
        guard.session.user.id,
        { productId: authority.data.id },
        { imageUrl: stored.data.publicPath },
      ),
    );

    if (!persisted.ok) {
      await bestEffortDeleteStoredPhoto(dependencies, stored.data.relativePath);

      return productFailureToPhotoFailure(persisted);
    }

    const revalidation = await revalidateProductPaths(
      dependencies,
      persisted.data.establishmentSlug,
    );

    if (!revalidation.ok) {
      return localFailure("REVALIDATION_FAILED");
    }

    return {
      ok: true,
      code: "PHOTO_UPDATED",
      message: PRODUCT_PHOTO_UPLOAD_MESSAGES.PHOTO_UPDATED,
      status: 200,
      data: {
        productId: persisted.data.id,
        imageUrl: persisted.data.imageUrl ?? stored.data.publicPath,
        establishmentSlug: persisted.data.establishmentSlug,
        mediaType: stored.data.mediaType,
        sizeBytes: stored.data.sizeBytes,
      },
    };
  }

  return { uploadProductPhoto };
}

async function requireMerchantOrFailure(
  dependencies: ProductPhotoUploadCoreDependencies,
): Promise<
  | { ok: true; session: AuthSessionContext }
  | { ok: false; failure: ProductPhotoUploadFailure }
> {
  try {
    const rawToken = await dependencies.readSessionCookie();
    const session = await dependencies.requireMerchantSession(rawToken);

    return { ok: true, session };
  } catch (error) {
    return { ok: false, failure: authErrorToPhotoFailure(error) };
  }
}

async function safelyCallProductService<TData>(
  serviceCall: () => Promise<ProductResult<TData>>,
): Promise<ProductResult<TData>> {
  try {
    return await serviceCall();
  } catch {
    return {
      ok: false,
      code: "DATABASE_ERROR",
      message: PRODUCT_ERROR_MESSAGES.DATABASE_ERROR,
    };
  }
}

function getSinglePhotoFile(
  formData: FormData,
): { ok: true; file: UploadFileLike } | { ok: false; failure: ProductPhotoUploadFailure } {
  const photoValues = formData.getAll("photo");

  if (photoValues.length === 0 || !isUploadFileLike(photoValues[0])) {
    return { ok: false, failure: localFailure("MISSING_FILE") };
  }

  if (photoValues.length > 1) {
    return { ok: false, failure: localFailure("MULTIPLE_FILES") };
  }

  return { ok: true, file: photoValues[0] };
}

async function readPhotoBytes(
  file: UploadFileLike,
): Promise<
  | { ok: true; data: StoreImageInput["bytes"] }
  | { ok: false; failure: ProductPhotoUploadFailure }
> {
  try {
    return { ok: true, data: new Uint8Array(await file.arrayBuffer()) };
  } catch {
    return { ok: false, failure: localFailure("READ_FAILED") };
  }
}

async function revalidateProductPaths(
  dependencies: ProductPhotoUploadCoreDependencies,
  establishmentSlug: string,
): Promise<{ ok: true } | { ok: false }> {
  const paths = [
    MERCHANT_PANEL_PATH,
    PUBLIC_STORES_PATH,
    `${PUBLIC_STORES_PATH}/${encodeURIComponent(establishmentSlug)}`,
  ];

  try {
    for (const path of paths) {
      await dependencies.revalidatePath(path);
    }

    return { ok: true };
  } catch {
    return { ok: false };
  }
}

function authErrorToPhotoFailure(error: unknown): ProductPhotoUploadFailure {
  if (isAuthError(error)) {
    return createProductPhotoUploadFailure(
      error.code,
      authStatusForCode(error.code),
      getPublicAuthErrorMessage(error),
    );
  }

  return createProductPhotoUploadFailure(
    "CONFIG_INVALID",
    500,
    AUTH_ERROR_MESSAGES.CONFIG_INVALID,
  );
}

function productFailureToPhotoFailure(
  failure: ProductFailure,
): ProductPhotoUploadFailure {
  return createProductPhotoUploadFailure(
    failure.code,
    productStatusForCode(failure.code),
    PRODUCT_ERROR_MESSAGES[failure.code],
  );
}

function uploadFailureToPhotoFailure(
  failure: UploadFailure,
): ProductPhotoUploadFailure {
  return createProductPhotoUploadFailure(
    failure.code,
    failure.status,
    UPLOAD_ERROR_MESSAGES[failure.code],
  );
}

function localFailure(
  code: ProductPhotoUploadLocalFailureCode,
): ProductPhotoUploadFailure {
  return createProductPhotoUploadFailure(
    code,
    PRODUCT_PHOTO_UPLOAD_FAILURE_STATUS[code],
    PRODUCT_PHOTO_UPLOAD_MESSAGES[code],
  );
}

export function createProductPhotoUploadFailure(
  code: ProductPhotoUploadFailureCode,
  status: number,
  message: string,
): ProductPhotoUploadFailure {
  return {
    ok: false,
    code,
    message: safeFailureMessage(message),
    status,
  };
}

async function bestEffortDeleteStoredPhoto(
  dependencies: ProductPhotoUploadCoreDependencies,
  relativePath: string,
) {
  try {
    await dependencies.uploadService.deleteStoredFile(relativePath);
  } catch {
    // Rollback is best-effort; callers receive the safe persistence failure.
  }
}

function authStatusForCode(code: AuthErrorCode) {
  switch (code) {
    case "TOKEN_INVALID":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
      return 401;
    case "FORBIDDEN_ROLE":
    case "INACTIVE_USER":
      return 403;
    default:
      return 500;
  }
}

function productStatusForCode(code: ProductFailureCode) {
  switch (code) {
    case "VALIDATION_FAILED":
    case "INVALID_CATEGORY":
      return 400;
    case "NOT_FOUND":
      return 404;
    case "DUPLICATE_SLUG":
    case "OPERATION_NOT_ALLOWED":
      return 409;
    case "DATABASE_ERROR":
      return 500;
    default:
      return 500;
  }
}

function safeFailureMessage(message: string) {
  if (!message || containsSensitiveToken(message)) {
    return PRODUCT_PHOTO_UPLOAD_MESSAGES.GENERIC_FAILURE;
  }

  return message;
}

function containsSensitiveToken(message: string) {
  return [
    "AUTH_SECRET",
    "DATABASE_URL",
    "password",
    "passwordHash",
    "Prisma",
    "raw upload",
    "session token",
    "stack",
    "tokenHash",
    "Unique constraint",
  ].some((token) => message.toLowerCase().includes(token.toLowerCase()));
}

type UploadFileLike = {
  arrayBuffer(): Promise<ArrayBuffer>;
  name?: string;
  size?: number;
  type?: string;
};

function isUploadFileLike(value: unknown): value is UploadFileLike {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.arrayBuffer === "function";
}

function getOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
