import type { UploadConfig } from "./config";

export const ALLOWED_UPLOAD_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const UPLOAD_ERROR_MESSAGES = {
  CONFIG_INVALID: "Configuração de upload indisponível. Contate o suporte.",
  VALIDATION_FAILED: "Revise o arquivo enviado.",
  EMPTY_FILE: "Envie uma imagem para continuar.",
  FILE_TOO_LARGE: "A imagem excede o tamanho máximo permitido.",
  UNSUPPORTED_MIME: "Envie uma imagem PNG, JPG ou WebP válida.",
  CLIENT_MIME_MISMATCH:
    "O tipo informado não corresponde ao conteúdo da imagem.",
  PATH_TRAVERSAL: "Caminho de upload inválido.",
  NOT_FOUND: "Arquivo de upload não encontrado.",
  STORAGE_ERROR: "Não foi possível armazenar o arquivo. Tente novamente.",
} as const;

export const UPLOAD_FAILURE_STATUS = {
  CONFIG_INVALID: 500,
  VALIDATION_FAILED: 400,
  EMPTY_FILE: 400,
  FILE_TOO_LARGE: 400,
  UNSUPPORTED_MIME: 400,
  CLIENT_MIME_MISMATCH: 400,
  PATH_TRAVERSAL: 400,
  NOT_FOUND: 404,
  STORAGE_ERROR: 500,
} as const satisfies Record<UploadFailureCode, number>;

const SAFE_SCOPE_SEGMENT_PATTERN = /^[0-9A-Za-z][0-9A-Za-z_-]{0,127}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_STORED_FILENAME_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(png|jpg|webp)$/iu;

export type AllowedUploadImageType = (typeof ALLOWED_UPLOAD_IMAGE_TYPES)[number];
export type UploadFailureCode = keyof typeof UPLOAD_ERROR_MESSAGES;
export type UploadFileExtension = "png" | "jpg" | "webp";

export type UploadDetectedFileType = {
  ext: string;
  mime: string;
};

export type UploadFileTypeDetector = (
  bytes: Uint8Array,
) => Promise<UploadDetectedFileType | undefined>;

export type UploadStorage = {
  writeFile(relativePath: string, bytes: Uint8Array): Promise<void>;
  deleteFile(relativePath: string): Promise<void>;
  readFile?(relativePath: string): Promise<Uint8Array>;
};

export type UploadFailure = {
  ok: false;
  code: UploadFailureCode;
  message: string;
  status: (typeof UPLOAD_FAILURE_STATUS)[UploadFailureCode];
};

export type UploadSuccess<TData> = {
  ok: true;
  data: TData;
};

export type UploadResult<TData> = UploadFailure | UploadSuccess<TData>;

export type StoreImageInput = {
  bytes: Uint8Array | ArrayBuffer;
  scope: string | readonly string[];
  clientMimeType?: string | null;
  originalFilename?: string | null;
};

export type StoredUpload = {
  relativePath: string;
  publicPath: string;
  publicUrl: string;
  mediaType: AllowedUploadImageType;
  extension: UploadFileExtension;
  sizeBytes: number;
};

export type StoredUploadRead = {
  bytes: Uint8Array;
  mediaType: AllowedUploadImageType;
  sizeBytes: number;
};

export type DeleteStoredUploadResult = {
  deleted: true;
};

export type UploadServiceCoreDependencies = {
  config: UploadConfig;
  storage: UploadStorage;
  randomUUID: () => string;
  detectFileType: UploadFileTypeDetector;
};

export function createUploadServiceCore(
  dependencies: UploadServiceCoreDependencies,
) {
  const config = dependencies.config;
  const storage = dependencies.storage;

  async function storeImage(
    input: StoreImageInput,
  ): Promise<UploadResult<StoredUpload>> {
    const bytes = toUint8Array(input.bytes);

    if (bytes.byteLength === 0) {
      return uploadFailure("EMPTY_FILE");
    }

    if (bytes.byteLength > config.maxBytes) {
      return uploadFailure("FILE_TOO_LARGE");
    }

    const scope = parseScope(input.scope);

    if (!scope.ok) {
      return scope;
    }

    const detectedType = await detectAllowedImageType(bytes);

    if (!detectedType.ok) {
      return detectedType;
    }

    if (hasClientMimeMismatch(input.clientMimeType, detectedType.data.mediaType)) {
      return uploadFailure("CLIENT_MIME_MISMATCH");
    }

    const filename = createSafeGeneratedFilename(detectedType.data.extension);

    if (!filename.ok) {
      return filename;
    }

    const relativePath = [...scope.data, filename.data].join("/");

    try {
      await storage.writeFile(relativePath, bytes);
    } catch {
      return uploadFailure("STORAGE_ERROR");
    }

    return uploadSuccess({
      relativePath,
      publicPath: buildPublicPath(config.publicBasePath, relativePath),
      publicUrl: buildPublicPath(config.publicBaseUrl, relativePath),
      mediaType: detectedType.data.mediaType,
      extension: detectedType.data.extension,
      sizeBytes: bytes.byteLength,
    });
  }

  async function readStoredImage(
    relativePathInput: string,
  ): Promise<UploadResult<StoredUploadRead>> {
    const storedPath = parseStoredRelativePath(relativePathInput);

    if (!storedPath.ok) {
      return storedPath;
    }

    if (!storage.readFile) {
      return uploadFailure("STORAGE_ERROR");
    }

    try {
      const bytes = await storage.readFile(storedPath.data.relativePath);

      if (bytes.byteLength > config.maxBytes) {
        return uploadFailure("FILE_TOO_LARGE");
      }

      return uploadSuccess({
        bytes,
        mediaType: storedPath.data.mediaType,
        sizeBytes: bytes.byteLength,
      });
    } catch (error) {
      if (isNotFoundStorageError(error)) {
        return uploadFailure("NOT_FOUND");
      }

      return uploadFailure("STORAGE_ERROR");
    }
  }

  async function deleteStoredFile(
    relativePathInput: string,
  ): Promise<UploadResult<DeleteStoredUploadResult>> {
    const storedPath = parseStoredRelativePath(relativePathInput);

    if (!storedPath.ok) {
      return storedPath;
    }

    try {
      await storage.deleteFile(storedPath.data.relativePath);
      return uploadSuccess({ deleted: true });
    } catch (error) {
      if (isNotFoundStorageError(error)) {
        return uploadFailure("NOT_FOUND");
      }

      return uploadFailure("STORAGE_ERROR");
    }
  }

  async function detectAllowedImageType(
    bytes: Uint8Array,
  ): Promise<UploadResult<{ extension: UploadFileExtension; mediaType: AllowedUploadImageType }>> {
    try {
      const detected = await dependencies.detectFileType(bytes);
      const allowed = normalizeDetectedImageType(detected);

      if (!allowed) {
        return uploadFailure("UNSUPPORTED_MIME");
      }

      return uploadSuccess(allowed);
    } catch {
      return uploadFailure("UNSUPPORTED_MIME");
    }
  }

  function createSafeGeneratedFilename(
    extension: UploadFileExtension,
  ): UploadResult<string> {
    const uuid = dependencies.randomUUID().trim().toLowerCase();

    if (!UUID_PATTERN.test(uuid)) {
      return uploadFailure("STORAGE_ERROR");
    }

    return uploadSuccess(`${uuid}.${extension}`);
  }

  return {
    deleteStoredFile,
    readStoredImage,
    storeImage,
  };
}

export type UploadServiceCore = ReturnType<typeof createUploadServiceCore>;

export function validateUploadRelativePath(relativePathInput: string) {
  return parseStoredRelativePath(relativePathInput);
}

export function uploadSuccess<TData>(data: TData): UploadSuccess<TData> {
  return { ok: true, data };
}

export function uploadFailure(code: UploadFailureCode): UploadFailure {
  return {
    ok: false,
    code,
    message: UPLOAD_ERROR_MESSAGES[code],
    status: UPLOAD_FAILURE_STATUS[code],
  };
}

function parseScope(scopeInput: StoreImageInput["scope"]): UploadResult<string[]> {
  const segments =
    typeof scopeInput === "string" ? scopeInput.split("/") : [...scopeInput];

  if (segments.length === 0) {
    return uploadFailure("PATH_TRAVERSAL");
  }

  const safeSegments: string[] = [];

  for (const segment of segments) {
    if (!isSafeScopeSegment(segment)) {
      return uploadFailure("PATH_TRAVERSAL");
    }

    safeSegments.push(segment);
  }

  return uploadSuccess(safeSegments);
}

function parseStoredRelativePath(
  relativePathInput: string,
): UploadResult<{ relativePath: string; mediaType: AllowedUploadImageType }> {
  if (
    typeof relativePathInput !== "string" ||
    relativePathInput.length === 0 ||
    relativePathInput.startsWith("/") ||
    relativePathInput.includes("\\") ||
    relativePathInput.includes("\0")
  ) {
    return uploadFailure("PATH_TRAVERSAL");
  }

  const segments = relativePathInput.split("/");
  const filename = segments.at(-1);
  const scopeSegments = segments.slice(0, -1);

  if (!filename || scopeSegments.length === 0) {
    return uploadFailure("PATH_TRAVERSAL");
  }

  for (const segment of scopeSegments) {
    if (!isSafeScopeSegment(segment)) {
      return uploadFailure("PATH_TRAVERSAL");
    }
  }

  const filenameMatch = SAFE_STORED_FILENAME_PATTERN.exec(filename);

  if (!filenameMatch) {
    return uploadFailure("PATH_TRAVERSAL");
  }

  const extension = filenameMatch[2]?.toLowerCase() as UploadFileExtension | undefined;
  const mediaType = extension ? imageTypeFromExtension(extension) : null;

  if (!mediaType) {
    return uploadFailure("PATH_TRAVERSAL");
  }

  return uploadSuccess({
    relativePath: [...scopeSegments, filename.toLowerCase()].join("/"),
    mediaType,
  });
}

function isSafeScopeSegment(segment: string) {
  return (
    segment.trim() === segment &&
    SAFE_SCOPE_SEGMENT_PATTERN.test(segment) &&
    segment !== "." &&
    segment !== ".."
  );
}

function toUint8Array(bytes: Uint8Array | ArrayBuffer) {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }

  return new Uint8Array(bytes);
}

function normalizeDetectedImageType(
  detected: UploadDetectedFileType | undefined,
): { extension: UploadFileExtension; mediaType: AllowedUploadImageType } | null {
  if (!detected) {
    return null;
  }

  if (detected.mime === "image/png") {
    return { extension: "png", mediaType: "image/png" };
  }

  if (detected.mime === "image/jpeg") {
    return { extension: "jpg", mediaType: "image/jpeg" };
  }

  if (detected.mime === "image/webp") {
    return { extension: "webp", mediaType: "image/webp" };
  }

  return null;
}

function imageTypeFromExtension(
  extension: UploadFileExtension,
): AllowedUploadImageType | null {
  if (extension === "png") {
    return "image/png";
  }

  if (extension === "jpg") {
    return "image/jpeg";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  return null;
}

function hasClientMimeMismatch(
  clientMimeType: string | null | undefined,
  detectedMimeType: AllowedUploadImageType,
) {
  const normalizedClientMime = clientMimeType?.trim().toLowerCase();

  return Boolean(
    normalizedClientMime && normalizedClientMime !== detectedMimeType,
  );
}

function buildPublicPath(publicBase: string, relativePath: string) {
  return `${publicBase.replace(/\/+$/u, "")}/${relativePath}`;
}

function isNotFoundStorageError(error: unknown) {
  return isRecord(error) && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
