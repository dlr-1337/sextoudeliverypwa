import {
  AUTH_ERROR_MESSAGES,
  getPublicAuthErrorMessage,
  isAuthError,
  type AuthErrorCode,
} from "../auth/errors";
import type { AuthSessionContext } from "../auth/types";
import {
  UPLOAD_ERROR_MESSAGES,
  type StoredUpload,
  type StoreImageInput,
  type UploadFailure,
  type UploadServiceCore,
} from "../uploads/service-core";

import {
  MERCHANT_ERROR_MESSAGES,
  type MerchantDashboardDto,
  type MerchantFailure,
  type MerchantFailureCode,
  type MerchantResult,
  type MerchantServiceCore,
} from "./service-core";

const MERCHANT_PANEL_PATH = "/estabelecimento";

export const MERCHANT_LOGO_UPLOAD_MESSAGES = {
  LOGO_UPDATED: "Logo do estabelecimento atualizado com sucesso.",
  MISSING_FILE: "Envie uma imagem de logo para continuar.",
  MULTIPLE_FILES: "Envie apenas uma imagem de logo por vez.",
  READ_FAILED: "Não foi possível ler a imagem enviada. Tente novamente.",
  MALFORMED_MULTIPART: "Não foi possível ler o envio do logo. Tente novamente.",
  REVALIDATION_FAILED:
    "Logo salvo, mas não foi possível atualizar a visualização. Recarregue a página.",
  GENERIC_FAILURE: "Não foi possível atualizar o logo. Tente novamente.",
} as const;

export const MERCHANT_LOGO_UPLOAD_FAILURE_STATUS = {
  MISSING_FILE: 400,
  MULTIPLE_FILES: 400,
  READ_FAILED: 400,
  MALFORMED_MULTIPART: 400,
  REVALIDATION_FAILED: 500,
} as const;

export type MerchantLogoUploadLocalFailureCode = keyof typeof MERCHANT_LOGO_UPLOAD_FAILURE_STATUS;
export type MerchantLogoUploadFailureCode =
  | AuthErrorCode
  | MerchantFailureCode
  | UploadFailure["code"]
  | MerchantLogoUploadLocalFailureCode;

export type MerchantLogoUploadFailure = {
  ok: false;
  code: MerchantLogoUploadFailureCode;
  message: string;
  status: number;
};

export type MerchantLogoUploadSuccess = {
  ok: true;
  code: "LOGO_UPDATED";
  message: string;
  status: 200;
  data: {
    establishmentId: string;
    logoUrl: string;
    mediaType: StoredUpload["mediaType"];
    sizeBytes: number;
  };
};

export type MerchantLogoUploadResult =
  | MerchantLogoUploadFailure
  | MerchantLogoUploadSuccess;

type MaybePromise<T> = T | Promise<T>;

type MerchantLogoService = Pick<
  MerchantServiceCore,
  "getDashboardForOwner" | "updateLogoForOwner"
>;

type LogoUploadService = Pick<UploadServiceCore, "deleteStoredFile" | "storeImage">;

export type MerchantLogoUploadCoreDependencies = {
  readSessionCookie: () => MaybePromise<unknown>;
  requireMerchantSession: (rawToken: unknown) => MaybePromise<AuthSessionContext>;
  merchantService: MerchantLogoService;
  uploadService: LogoUploadService;
};

export function createMerchantLogoUploadCore(
  dependencies: MerchantLogoUploadCoreDependencies,
) {
  async function uploadMerchantLogo(
    formData: FormData,
  ): Promise<MerchantLogoUploadResult> {
    const guard = await requireMerchantOrFailure(dependencies);

    if (!guard.ok) {
      return guard.failure;
    }

    const dashboard = await safelyCallMerchantService(() =>
      dependencies.merchantService.getDashboardForOwner(guard.session.user.id),
    );

    if (!dashboard.ok) {
      return merchantFailureToUploadFailure(dashboard);
    }

    const activeCheck = requireActiveEstablishment(dashboard.data);

    if (!activeCheck.ok) {
      return activeCheck.failure;
    }

    const logoFile = getSingleLogoFile(formData);

    if (!logoFile.ok) {
      return logoFile.failure;
    }

    const bytes = await readLogoBytes(logoFile.file);

    if (!bytes.ok) {
      return bytes.failure;
    }

    const establishmentId = dashboard.data.establishment.id;
    const stored = await dependencies.uploadService.storeImage({
      bytes: bytes.data,
      clientMimeType: getOptionalString(logoFile.file.type),
      originalFilename: getOptionalString(logoFile.file.name),
      scope: ["establishments", establishmentId, "logos"],
    });

    if (!stored.ok) {
      return uploadFailureToLogoFailure(stored);
    }

    const persisted = await safelyCallMerchantService(() =>
      dependencies.merchantService.updateLogoForOwner(
        guard.session.user.id,
        stored.data.publicPath,
      ),
    );

    if (!persisted.ok) {
      await bestEffortDeleteStoredLogo(dependencies, stored.data.relativePath);

      return merchantFailureToUploadFailure(persisted);
    }

    return {
      ok: true,
      code: "LOGO_UPDATED",
      message: MERCHANT_LOGO_UPLOAD_MESSAGES.LOGO_UPDATED,
      status: 200,
      data: {
        establishmentId: persisted.data.id,
        logoUrl: persisted.data.logoUrl ?? stored.data.publicPath,
        mediaType: stored.data.mediaType,
        sizeBytes: stored.data.sizeBytes,
      },
    };
  }

  return { panelPath: MERCHANT_PANEL_PATH, uploadMerchantLogo };
}

async function requireMerchantOrFailure(
  dependencies: MerchantLogoUploadCoreDependencies,
): Promise<
  | { ok: true; session: AuthSessionContext }
  | { ok: false; failure: MerchantLogoUploadFailure }
> {
  try {
    const rawToken = await dependencies.readSessionCookie();
    const session = await dependencies.requireMerchantSession(rawToken);

    return { ok: true, session };
  } catch (error) {
    return { ok: false, failure: authErrorToUploadFailure(error) };
  }
}

async function safelyCallMerchantService<TData>(
  serviceCall: () => Promise<MerchantResult<TData>>,
): Promise<MerchantResult<TData>> {
  try {
    return await serviceCall();
  } catch {
    return {
      ok: false,
      code: "DATABASE_ERROR",
      message: MERCHANT_ERROR_MESSAGES.DATABASE_ERROR,
    };
  }
}

function requireActiveEstablishment(
  dashboard: MerchantDashboardDto,
): { ok: true } | { ok: false; failure: MerchantLogoUploadFailure } {
  if (dashboard.establishment.status === "ACTIVE") {
    return { ok: true };
  }

  return {
    ok: false,
    failure: createLogoUploadFailure(
      "INACTIVE_STATUS",
      409,
      MERCHANT_ERROR_MESSAGES.INACTIVE_STATUS,
    ),
  };
}

function getSingleLogoFile(
  formData: FormData,
): { ok: true; file: UploadFileLike } | { ok: false; failure: MerchantLogoUploadFailure } {
  const logoValues = formData.getAll("logo");

  if (logoValues.length === 0 || !isUploadFileLike(logoValues[0])) {
    return {
      ok: false,
      failure: localFailure("MISSING_FILE"),
    };
  }

  if (logoValues.length > 1) {
    return {
      ok: false,
      failure: localFailure("MULTIPLE_FILES"),
    };
  }

  return { ok: true, file: logoValues[0] };
}

async function readLogoBytes(
  file: UploadFileLike,
): Promise<{ ok: true; data: StoreImageInput["bytes"] } | { ok: false; failure: MerchantLogoUploadFailure }> {
  try {
    return { ok: true, data: new Uint8Array(await file.arrayBuffer()) };
  } catch {
    return { ok: false, failure: localFailure("READ_FAILED") };
  }
}

function authErrorToUploadFailure(error: unknown): MerchantLogoUploadFailure {
  if (isAuthError(error)) {
    return createLogoUploadFailure(
      error.code,
      authStatusForCode(error.code),
      getPublicAuthErrorMessage(error),
    );
  }

  return createLogoUploadFailure(
    "CONFIG_INVALID",
    500,
    AUTH_ERROR_MESSAGES.CONFIG_INVALID,
  );
}

function merchantFailureToUploadFailure(
  failure: MerchantFailure,
): MerchantLogoUploadFailure {
  return createLogoUploadFailure(
    failure.code,
    merchantStatusForCode(failure.code),
    MERCHANT_ERROR_MESSAGES[failure.code],
  );
}

function uploadFailureToLogoFailure(
  failure: UploadFailure,
): MerchantLogoUploadFailure {
  return createLogoUploadFailure(
    failure.code,
    failure.status,
    UPLOAD_ERROR_MESSAGES[failure.code],
  );
}

function localFailure(
  code: MerchantLogoUploadLocalFailureCode,
): MerchantLogoUploadFailure {
  return createLogoUploadFailure(
    code,
    MERCHANT_LOGO_UPLOAD_FAILURE_STATUS[code],
    MERCHANT_LOGO_UPLOAD_MESSAGES[code],
  );
}

export function createLogoUploadFailure(
  code: MerchantLogoUploadFailureCode,
  status: number,
  message: string,
): MerchantLogoUploadFailure {
  return {
    ok: false,
    code,
    message: safeFailureMessage(message),
    status,
  };
}

async function bestEffortDeleteStoredLogo(
  dependencies: MerchantLogoUploadCoreDependencies,
  relativePath: string,
) {
  try {
    await dependencies.uploadService.deleteStoredFile(relativePath);
  } catch {
    // Rollback is best-effort; callers get the persistence failure without raw FS details.
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

function merchantStatusForCode(code: MerchantFailureCode) {
  switch (code) {
    case "VALIDATION_FAILED":
    case "INVALID_CATEGORY":
      return 400;
    case "NOT_FOUND":
      return 404;
    case "INACTIVE_STATUS":
      return 409;
    case "DATABASE_ERROR":
      return 500;
    default:
      return 500;
  }
}

function safeFailureMessage(message: string) {
  if (!message || containsSensitiveToken(message)) {
    return MERCHANT_LOGO_UPLOAD_MESSAGES.GENERIC_FAILURE;
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
