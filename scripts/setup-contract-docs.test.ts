import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
  scripts: Record<string, string>;
};

const readme = readFileSync("README.md", "utf8");
const envExample = readFileSync(".env.example", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const m002CoveragePath = "docs/m002-requirements-coverage.md";
const m003CoveragePath = "docs/m003-requirements-coverage.md";
const m002Coverage = readFileSync(m002CoveragePath, "utf8");
const m003Coverage = readFileSync(m003CoveragePath, "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;

const documentedPackageScripts = [
  "db:generate",
  "db:migrate",
  "db:deploy",
  "db:seed",
  "smoke:m001",
  "verify:m001",
  "smoke:m002",
  "e2e:m002",
  "verify:m002",
  "smoke:m003",
  "e2e:m003",
  "verify:m003",
] as const;

const activeM001M002M003EnvKeys = [
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
  "/estabelecimento/pedidos",
  "/estabelecimento/pedidos/[id]",
  "/lojas",
  "/lojas/[slug]",
  "/checkout",
  "/pedido/[publicCode]",
  "/acesso-negado",
] as const;

const deliveredM002Terms = [
  "carrinho",
  "checkout",
  "CASH",
  "pagamento em dinheiro",
  "PostgreSQL descartável",
  "navegador real",
  "npx playwright install chromium",
] as const;

const deliveredM003Terms = [
  "operação do pedido pelo estabelecimento",
  "caixa de entrada de pedidos",
  "Pedido aceito",
  "Server Action",
  "status stale",
  "Chromium",
] as const;

const futureDeferralTerms = [
  "gateway real",
  "assinaturas",
  "S3/R2/MinIO",
  "rate limiting",
] as const;

const staleM001OnlyDeferralPatterns = [
  /Fora do M001[\s\S]{0,180}(?:carrinho|pedidos|checkout)/i,
  /próximas entregas[\s\S]{0,180}(?:carrinho|checkout)/i,
  /ainda precisam definir[\s\S]{0,120}(?:carrinho|checkout)/i,
  /R017[–-]R043 downstream/i,
] as const;

const staleM003DeferralPatterns = [
  /Ainda não fazem parte[\s\S]{0,220}(?:transições operacionais do lojista|transições de status pelo estabelecimento)/i,
  /Deferrals conhecidos[\s\S]{0,260}(?:transições operacionais do lojista|transições de status pelo estabelecimento)/i,
  /próximas entregas[\s\S]{0,220}(?:transições operacionais do lojista|transições de status pelo estabelecimento)/i,
  /later milestones still own merchant-side order transitions/i,
  /Merchant status transitions remain owned by M003/i,
  /Future merchant status operations remain/i,
] as const;

const m002RequirementIds = [
  "R017",
  "R018",
  "R019",
  "R020",
  "R021",
  "R023",
  "R044",
  "R045",
  "R046",
] as const;

const m003RequirementIds = ["R021", "R047", "R048", "R049", "R050", "R051"] as const;

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

function matrixRows(doc: string) {
  return doc
    .split(/\r?\n/u)
    .filter((candidate) => /^\|\s*R\d{3}\s*\|/u.test(candidate));
}

describe("setup documentation contract", () => {
  it("documents package scripts that exist in package.json", () => {
    const documentationSurface = `${readme}\n${m002Coverage}\n${m003Coverage}`;

    for (const scriptName of documentedPackageScripts) {
      expect(packageJson.scripts[scriptName], `${scriptName} should exist`).toBeTypeOf(
        "string",
      );
      expect(documentationSurface).toContain(`npm run ${scriptName}`);
    }

    expect(readme).toContain(".env.example");
    expect(readme).toMatch(/PostgreSQL/i);
    expect(readme).toMatch(/seed/i);
    expect(readme).toMatch(/upload local/i);
  });

  it("documents M001+M002+M003 routes and delivered money/order-operation scope", () => {
    for (const route of importantRoutes) {
      expect(readme).toContain(route);
    }

    for (const term of deliveredM002Terms) {
      expect(readme).toContain(term);
    }

    for (const term of deliveredM003Terms) {
      expect(readme).toContain(term);
    }

    expect(readme).toMatch(/M001\+M002\+M003/i);
    expect(readme).toMatch(/PIX[\s\S]{0,120}cart[aã]o[\s\S]{0,160}indispon/i);
    expect(readme).toMatch(/n[aã]o (?:criam?|gera)[\s\S]{0,80}(?:fake|gateway)/i);
    expect(readme).toMatch(/CUSTOMER[\s\S]{0,120}MERCHANT[\s\S]{0,120}Pedido aceito/i);

    for (const term of futureDeferralTerms) {
      expect(readme).toContain(term);
    }

    for (const pattern of staleM001OnlyDeferralPatterns) {
      expect(readme, `${pattern} should not appear`).not.toMatch(pattern);
    }

    for (const pattern of staleM003DeferralPatterns) {
      expect(readme, `${pattern} should not appear`).not.toMatch(pattern);
    }
  });

  it("keeps the env example complete and explicit about active M001/M002/M003 versus future settings", () => {
    const assignments = parseEnvAssignments(envExample);

    for (const key of activeM001M002M003EnvKeys) {
      expect(assignments[key], `${key} should be present`).toBeTypeOf("string");
    }

    for (const key of futurePlaceholderEnvKeys) {
      expect(assignments[key], `${key} should be present`).toBeTypeOf("string");
    }

    expect(envExample).toMatch(/ativo no M001, M002 e M003/i);
    expect(envExample).toMatch(/placeholder futuro; n[aã]o-runtime no M003/i);
    expect(envExample).toMatch(/smoke:m002[\s\S]*smoke:m003[\s\S]*e2e:m002[\s\S]*e2e:m003[\s\S]*verify:m001[\s\S]*verify:m002[\s\S]*verify:m003/i);
    expect(envExample).toMatch(/AUTH_SECRET.*32 caracteres/is);
    expect(envExample).toMatch(/SESSION_MAX_AGE_DAYS.*1 e 365/is);
    expect(envExample).toMatch(/upsert de um ADMIN ativo/i);
    expect(envExample).toMatch(/PNG, JPEG\/JPG e WebP/i);
    expect(envExample).toMatch(/PIX[\s\S]*cart[aã]o[\s\S]*indispon/i);
    expect(assignments.UPLOAD_DRIVER).toBe("local");
    expect(assignments.UPLOAD_DIR).toBe("./uploads");
    expect(assignments.UPLOAD_MAX_BYTES).toBe("5242880");
  });

  it("tracks M002 requirements coverage for the delivered final proof", () => {
    expect(existsSync(m002CoveragePath), `${m002CoveragePath} should exist`).toBe(true);
    expect(readme).toContain(m002CoveragePath);
    expect(m002Coverage).toMatch(/M002 Requirements Coverage Matrix/i);
    expect(m002Coverage).toMatch(/S06 final proof/i);
    expect(m002Coverage).toContain("npm run e2e:m002");
    expect(m002Coverage).toContain("npm run verify:m002");
    expect(m002Coverage).toContain("e2e/m002-money-flow.spec.ts");
    expect(m002Coverage).toContain("scripts/require-env.mjs");

    const rows = matrixRows(m002Coverage);

    expect(rows).toHaveLength(m002RequirementIds.length);

    for (const id of m002RequirementIds) {
      const matches = rows.filter((row) => row.startsWith(`| ${id} |`));

      expect(matches, `${id} should appear exactly once`).toHaveLength(1);
    }

    expect(rows.find((row) => row.startsWith("| R045 |"))).toMatch(/S06 final proof/i);
    expect(rows.find((row) => row.startsWith("| R046 |"))).toMatch(/S06 final proof/i);
    expect(rows.find((row) => row.startsWith("| R021 |"))).toMatch(/M003/i);
  });

  it("tracks M003 requirements coverage for merchant order operations", () => {
    expect(existsSync(m003CoveragePath), `${m003CoveragePath} should exist`).toBe(true);
    expect(readme).toContain(m003CoveragePath);
    expect(m003Coverage).toMatch(/M003 Requirements Coverage Matrix/i);
    expect(m003Coverage).toMatch(/Final assembly evidence/i);
    expect(m003Coverage).toContain("npm run smoke:m003");
    expect(m003Coverage).toContain("npm run e2e:m003");
    expect(m003Coverage).toContain("npm run verify:m003");
    expect(m003Coverage).toContain("scripts/verify-m003-order-operations.ts");
    expect(m003Coverage).toContain("e2e/m003-order-operations.spec.ts");
    expect(m003Coverage).toContain("e2e/m003-order-operations.e2e-helper.ts");
    expect(m003Coverage).toContain("scripts/setup-contract-docs.test.ts");

    const rows = matrixRows(m003Coverage);

    expect(rows).toHaveLength(m003RequirementIds.length);

    for (const id of m003RequirementIds) {
      const matches = rows.filter((row) => row.startsWith(`| ${id} |`));

      expect(matches, `${id} should appear exactly once`).toHaveLength(1);
      expect(matches[0], `${id} should cite M003 runtime proof`).toMatch(/verify:m003/);
    }

    expect(rows.find((row) => row.startsWith("| R021 |"))).toMatch(/status/i);
    expect(rows.find((row) => row.startsWith("| R047 |"))).toMatch(/establishment/i);
    expect(rows.find((row) => row.startsWith("| R048 |"))).toMatch(/detail/i);
    expect(rows.find((row) => row.startsWith("| R049 |"))).toMatch(/stale|wrong-owner/i);
    expect(rows.find((row) => row.startsWith("| R050 |"))).toMatch(/public|públic/i);
    expect(rows.find((row) => row.startsWith("| R051 |"))).toMatch(/final|verify:m003/i);
  });

  it("rejects stale merchant-transition deferrals across README and coverage docs", () => {
    const docsToScan = `${readme}\n${m002Coverage}\n${m003Coverage}`;

    expect(docsToScan).toContain("M003 validates merchant status transitions");
    expect(docsToScan).toContain("M003-covered / validated");

    for (const pattern of staleM003DeferralPatterns) {
      expect(docsToScan, `${pattern} should not appear`).not.toMatch(pattern);
    }
  });

  it("ignores runtime uploads while keeping the env example trackable", () => {
    const ignoreLines = normalizedIgnoreLines();

    expect(ignoreLines).toContain("/uploads/");
    expect(ignoreLines).toContain("uploads/");
    expect(ignoreLines).toContain("!.env.example");
  });

  it("keeps documentation and examples free of obvious raw secret material", () => {
    const docsToScan = `${readme}\n${envExample}\n${m002Coverage}\n${m003Coverage}`;

    for (const { label, pattern } of forbiddenSecretPatterns) {
      expect(docsToScan, `${label} should not be documented`).not.toMatch(pattern);
    }

    expect(docsToScan).toMatch(/n[aã]o executa[\s\S]{0,120}migrate reset/i);
    expect(docsToScan).toMatch(/n[aã]o executa[\s\S]{0,160}db push/i);
    expect(docsToScan).toMatch(/destrutiv/i);
    expect(docsToScan).not.toMatch(/(?:npm run|npx|prisma)\s+(?:migrate\s+reset|db\s+push)/i);

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
