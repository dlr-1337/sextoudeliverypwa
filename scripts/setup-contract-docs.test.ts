import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
  scripts: Record<string, string>;
};

const readme = readFileSync("README.md", "utf8");
const envExample = readFileSync(".env.example", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;

const documentedPackageScripts = [
  "db:generate",
  "db:migrate",
  "db:deploy",
  "db:seed",
  "smoke:m001",
  "verify:m001",
] as const;

const activeM001EnvKeys = [
  "NEXT_PUBLIC_APP_URL",
  "APP_ENV",
  "DATABASE_URL",
  "AUTH_SECRET",
  "SESSION_COOKIE_NAME",
  "SESSION_MAX_AGE_DAYS",
  "SEED_ADMIN_NAME",
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
  "UPLOAD_DRIVER",
  "UPLOAD_DIR",
  "UPLOAD_PUBLIC_BASE_URL",
  "UPLOAD_MAX_BYTES",
] as const;

const futurePlaceholderEnvKeys = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_FORCE_PATH_STYLE",
  "FAKE_PAYMENT_PROVIDER",
  "FAKE_PAYMENT_WEBHOOK_SECRET",
  "FAKE_PAYMENT_APPROVAL_MODE",
] as const;

const importantRoutes = [
  "/login",
  "/cadastro",
  "/conta",
  "/admin",
  "/admin/estabelecimentos",
  "/admin/categorias",
  "/admin/clientes",
  "/estabelecimento",
  "/lojas",
  "/lojas/[slug]",
  "/acesso-negado",
] as const;

const downstreamDeferralTerms = [
  "carrinho",
  "pedidos",
  "pagamentos",
  "assinaturas",
  "S3/R2/MinIO",
] as const;

const forbiddenSecretPatterns = [
  {
    label: "private key material",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  { label: "Argon2 password hash", pattern: /\$argon2(?:id|i|d)\$/i },
  {
    label: "JWT-like session token",
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  { label: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/ },
  {
    label: "non-placeholder PostgreSQL URL",
    pattern:
      /postgresql:\/\/(?!USER:PASSWORD@HOST:PORT\/DATABASE\?schema=public)[^\s`"']+/i,
  },
] as const;

const sensitiveEnvKeyPattern = /(?:DATABASE_URL|PASSWORD|SECRET|TOKEN|ACCESS_KEY)/i;
const safeSensitiveEnvValuePattern =
  /^(?:replace-with|postgresql:\/\/USER:PASSWORD@HOST:PORT\/DATABASE\?schema=public)/i;

function parseEnvAssignments(content: string) {
  const assignments: Record<string, string> = {};

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(trimmed);

    if (match) {
      assignments[match[1]] = match[2].replace(/^"(.*)"$/u, "$1");
    }
  }

  return assignments;
}

function normalizedIgnoreLines() {
  return gitignore
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

describe("setup documentation contract", () => {
  it("documents package scripts that exist in package.json", () => {
    for (const scriptName of documentedPackageScripts) {
      expect(packageJson.scripts[scriptName], `${scriptName} should exist`).toBeTypeOf(
        "string",
      );
      expect(readme).toContain(`npm run ${scriptName}`);
    }

    expect(readme).toContain(".env.example");
    expect(readme).toMatch(/PostgreSQL/i);
    expect(readme).toMatch(/seed/i);
    expect(readme).toMatch(/upload local/i);
  });

  it("documents access routes and downstream deferrals", () => {
    for (const route of importantRoutes) {
      expect(readme).toContain(route);
    }

    for (const term of downstreamDeferralTerms) {
      expect(readme).toContain(term);
    }
  });

  it("keeps the env example complete and explicit about active versus future settings", () => {
    const assignments = parseEnvAssignments(envExample);

    for (const key of activeM001EnvKeys) {
      expect(assignments[key], `${key} should be present`).toBeTypeOf("string");
    }

    for (const key of futurePlaceholderEnvKeys) {
      expect(assignments[key], `${key} should be present`).toBeTypeOf("string");
    }

    expect(envExample).toMatch(/ativo no M001/i);
    expect(envExample).toMatch(/placeholder para evolução futura/i);
    expect(envExample).toMatch(/AUTH_SECRET.*32 caracteres/is);
    expect(envExample).toMatch(/SESSION_MAX_AGE_DAYS.*1 e 365/is);
    expect(envExample).toMatch(/upsert de um ADMIN ativo/i);
    expect(envExample).toMatch(/PNG, JPEG\/JPG e WebP/i);
    expect(assignments.UPLOAD_DRIVER).toBe("local");
    expect(assignments.UPLOAD_DIR).toBe("./uploads");
    expect(assignments.UPLOAD_MAX_BYTES).toBe("5242880");
  });

  it("ignores runtime uploads while keeping the env example trackable", () => {
    const ignoreLines = normalizedIgnoreLines();

    expect(ignoreLines).toContain("/uploads/");
    expect(ignoreLines).toContain("uploads/");
    expect(ignoreLines).toContain("!.env.example");
  });

  it("keeps documentation and examples free of obvious raw secret material", () => {
    const docsToScan = `${readme}\n${envExample}`;

    for (const { label, pattern } of forbiddenSecretPatterns) {
      expect(docsToScan, `${label} should not be documented`).not.toMatch(pattern);
    }

    const assignments = parseEnvAssignments(envExample);

    for (const [key, value] of Object.entries(assignments)) {
      if (sensitiveEnvKeyPattern.test(key)) {
        expect(value, `${key} should use an explicit placeholder`).toMatch(
          safeSensitiveEnvValuePattern,
        );
      }
    }
  });
});
