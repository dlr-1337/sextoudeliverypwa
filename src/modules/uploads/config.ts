const DEFAULT_UPLOAD_DRIVER = "local";
const DEFAULT_UPLOAD_DIR = "./uploads";
const DEFAULT_UPLOAD_PUBLIC_BASE_URL = "http://localhost:3000/uploads";
const DEFAULT_UPLOAD_MAX_BYTES = 5_242_880;

export type UploadEnvKey =
  | "UPLOAD_DRIVER"
  | "UPLOAD_DIR"
  | "UPLOAD_PUBLIC_BASE_URL"
  | "UPLOAD_MAX_BYTES";
export type UploadDriver = "local";

export type UploadConfigEnv = Record<string, string | undefined>;

export type UploadConfig = {
  driver: UploadDriver;
  uploadDir: string;
  publicBaseUrl: string;
  publicBasePath: string;
  maxBytes: number;
};

export class UploadConfigError extends Error {
  readonly code = "CONFIG_INVALID";
  readonly keys: readonly UploadEnvKey[];
  readonly publicMessage = "Configuração de upload indisponível. Contate o suporte.";

  constructor(keys: readonly UploadEnvKey[]) {
    const uniqueKeys = [...new Set(keys)].sort();

    super(`Configuração de upload inválida: ${uniqueKeys.join(", ")}.`);
    this.name = "UploadConfigError";
    this.keys = uniqueKeys;
  }
}

export function parseUploadConfig(
  env: UploadConfigEnv = process.env,
): UploadConfig {
  const invalidKeys: UploadEnvKey[] = [];
  const rawDriver = readEnvValue(env, "UPLOAD_DRIVER", DEFAULT_UPLOAD_DRIVER);
  const rawUploadDir = readEnvValue(env, "UPLOAD_DIR", DEFAULT_UPLOAD_DIR);
  const rawPublicBaseUrl = readEnvValue(
    env,
    "UPLOAD_PUBLIC_BASE_URL",
    DEFAULT_UPLOAD_PUBLIC_BASE_URL,
  );
  const rawMaxBytes = readEnvValue(
    env,
    "UPLOAD_MAX_BYTES",
    String(DEFAULT_UPLOAD_MAX_BYTES),
  );

  if (rawDriver !== "local") {
    invalidKeys.push("UPLOAD_DRIVER");
  }

  if (rawUploadDir.length === 0 || rawUploadDir.includes("\0")) {
    invalidKeys.push("UPLOAD_DIR");
  }

  const publicBase = normalizePublicBase(rawPublicBaseUrl);

  if (!publicBase) {
    invalidKeys.push("UPLOAD_PUBLIC_BASE_URL");
  }

  const maxBytes = Number(rawMaxBytes);

  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    invalidKeys.push("UPLOAD_MAX_BYTES");
  }

  if (invalidKeys.length > 0) {
    throw new UploadConfigError(invalidKeys);
  }

  return {
    driver: "local",
    uploadDir: rawUploadDir,
    publicBaseUrl: publicBase?.publicBaseUrl ?? DEFAULT_UPLOAD_PUBLIC_BASE_URL,
    publicBasePath: publicBase?.publicBasePath ?? "/uploads",
    maxBytes,
  };
}

export function getUploadConfig(env: UploadConfigEnv = process.env) {
  return parseUploadConfig(env);
}

function readEnvValue(
  env: UploadConfigEnv,
  key: UploadEnvKey,
  defaultValue: string,
) {
  const value = env[key];

  if (value === undefined) {
    return defaultValue;
  }

  return value.trim();
}

type NormalizedPublicBase = {
  publicBaseUrl: string;
  publicBasePath: string;
};

function normalizePublicBase(value: string): NormalizedPublicBase | null {
  if (value.length === 0 || value.includes("\0") || value.includes("\\")) {
    return null;
  }

  if (value.startsWith("/")) {
    return normalizeRootRelativePublicBase(value);
  }

  try {
    const url = new URL(value);

    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      return null;
    }

    const publicBasePath = normalizePathname(url.pathname);

    if (!publicBasePath) {
      return null;
    }

    return {
      publicBasePath,
      publicBaseUrl: `${url.origin}${publicBasePath}`,
    };
  } catch {
    return null;
  }
}

function normalizeRootRelativePublicBase(value: string): NormalizedPublicBase | null {
  if (value.includes("?") || value.includes("#")) {
    return null;
  }

  const publicBasePath = normalizePathname(value);

  if (!publicBasePath) {
    return null;
  }

  return {
    publicBasePath,
    publicBaseUrl: publicBasePath,
  };
}

function normalizePathname(pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/u, "") || "/";

  if (
    normalizedPath === "/" ||
    normalizedPath.includes("//") ||
    normalizedPath.includes("/../") ||
    normalizedPath.endsWith("/..") ||
    normalizedPath.includes("/./") ||
    normalizedPath.endsWith("/.")
  ) {
    return null;
  }

  return normalizedPath;
}
