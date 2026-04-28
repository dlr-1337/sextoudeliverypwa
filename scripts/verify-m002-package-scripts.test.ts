import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
const scripts = packageJson.scripts;
const configSource = readFileSync("playwright.config.ts", "utf8");
const gitignoreSource = readFileSync(".gitignore", "utf8");
const readmeSource = readFileSync("README.md", "utf8");
const envExampleSource = readFileSync(".env.example", "utf8");
const m002CoveragePath = "docs/m002-requirements-coverage.md";
const m002CoverageSource = readFileSync(m002CoveragePath, "utf8");

const verifyM001Steps = [
  "npm run db:generate",
  "npm test",
  "npm run lint",
  "npm run build",
  "npm run db:deploy",
  "npm run db:seed",
  "npm run smoke:m001",
] as const;

const verifyM002Steps = [
  ...verifyM001Steps,
  "npm run smoke:m002",
  "npm run e2e:m002",
] as const;

const requiredE2EKeys = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "SESSION_COOKIE_NAME",
  "SESSION_MAX_AGE_DAYS",
] as const;

const unsafeCommandPatterns = [
  { label: "migrate reset", pattern: /\bmigrate\s+reset\b/i },
  { label: "db push", pattern: /\b(?:prisma\s+)?db\s+push\b/i },
  { label: "drop database", pattern: /\bdrop\s+database\b/i },
  { label: "truncate", pattern: /\btruncate\b/i },
  { label: "rm -rf", pattern: /\brm\s+-rf\b/i },
  { label: "hidden Playwright browser install", pattern: /\bplaywright\s+install\b/i },
  {
    label: "raw .env read",
    pattern: /(?:^|[\n;&|])\s*(?:cat|type|more|less|source|\.)\s+\.env(?:\b|$)/i,
  },
  {
    label: "secret echo",
    pattern:
      /\becho\s+[^&|;]*\$\{?(?:DATABASE_URL|AUTH_SECRET|SESSION_COOKIE_NAME|SESSION_MAX_AGE_DAYS|SEED_ADMIN_PASSWORD|[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD)[A-Z0-9_]*)\}?\b/i,
  },
] as const;

const documentedM002Commands = [
  "npm run db:generate",
  "npm run db:deploy",
  "npm run db:seed",
  "npm run smoke:m002",
  "npm run e2e:m002",
  "npm run verify:m002",
] as const;

const m002Routes = ["/lojas/[slug]", "/checkout", "/pedido/[publicCode]"] as const;

function requirePackageScript(name: string) {
  const script = scripts[name];

  expect(script, `${name} script should exist`).toBeTypeOf("string");

  return script;
}

function expectStepsInOrder(script: string, expectedSteps: readonly string[]) {
  let previousIndex = -1;

  for (const step of expectedSteps) {
    const currentIndex = script.indexOf(step);

    expect(currentIndex, `${step} should appear after prior verification steps`)
      .toBeGreaterThan(previousIndex);
    previousIndex = currentIndex;
  }
}

describe("M002 package verification scripts", () => {
  it("pins Playwright as a dev dependency without hiding browser installation in scripts", () => {
    expect(packageJson.devDependencies["@playwright/test"]).toBeTypeOf("string");

    const m002CommandSurface = [
      "smoke:m002-fixture",
      "smoke:m002",
      "e2e:m002",
      "verify:m002",
    ]
      .map((name) => `${name}: ${requirePackageScript(name)}`)
      .join("\n");

    expect(m002CommandSurface).not.toMatch(/\bplaywright\s+install\b/i);
  });

  it("adds M002 smoke and E2E scripts with a key-only env preflight", () => {
    expect(requirePackageScript("smoke:m002-fixture")).toBe(
      `node scripts/require-env.mjs ${requiredE2EKeys.join(" ")} && tsx scripts/verify-m002-e2e-fixture.ts`,
    );
    expect(requirePackageScript("smoke:m002")).toBe(
      "npm run smoke:s04-cash-order && npm run smoke:m002-fixture",
    );

    const e2eScript = requirePackageScript("e2e:m002");

    expect(e2eScript).toBe(
      `node scripts/require-env.mjs ${requiredE2EKeys.join(" ")} && playwright test e2e/m002-money-flow.spec.ts`,
    );
  });

  it("keeps verify:m001 unchanged while verify:m002 extends the final assembly chain", () => {
    const verifyM001Script = requirePackageScript("verify:m001");
    const verifyM002Script = requirePackageScript("verify:m002");

    expect(verifyM001Script.split(" && ")).toEqual([...verifyM001Steps]);
    expect(verifyM002Script.split(" && ")).toEqual([...verifyM002Steps]);
    expectStepsInOrder(verifyM002Script, verifyM002Steps);
  });

  it("rejects destructive or secret-printing commands from the M002 verification surface", () => {
    const scriptNames = [
      "smoke:m002-fixture",
      "smoke:m002",
      "e2e:m002",
      "verify:m002",
    ];
    const commandSurface = scriptNames
      .map((name) => `${name}: ${requirePackageScript(name)}`)
      .join("\n");

    for (const { label, pattern } of unsafeCommandPatterns) {
      expect(
        commandSurface,
        `${label} must not appear in M002 verification scripts`,
      ).not.toMatch(pattern);
    }
  });

  it("documents the final M002 command surface without stale deferred-flow wording", () => {
    const documentationSurface = `${readmeSource}\n${envExampleSource}\n${m002CoverageSource}`;

    expect(existsSync(m002CoveragePath), `${m002CoveragePath} should exist`).toBe(true);
    expect(readmeSource).toContain(m002CoveragePath);
    expect(readmeSource).toContain("npx playwright install chromium");
    expect(readmeSource).toMatch(/PostgreSQL descart[aá]vel/i);
    expect(readmeSource).toMatch(/CASH[\s\S]{0,180}(?:único|habilitado|confirm[aá]vel)/i);

    for (const command of documentedM002Commands) {
      expect(documentationSurface).toContain(command);
    }

    for (const key of requiredE2EKeys) {
      expect(documentationSurface).toContain(key);
    }

    for (const route of m002Routes) {
      expect(readmeSource).toContain(route);
    }

    expect(readmeSource).not.toMatch(
      /(?:Fora do M001|próximas entregas|ainda precisam definir)[\s\S]{0,180}(?:carrinho|pedidos|checkout)/i,
    );
    expect(m002CoverageSource).toMatch(/R045[\s\S]*S06 final proof/i);
    expect(m002CoverageSource).toMatch(/R046[\s\S]*S06 final proof/i);
  });
});

describe("M002 Playwright harness", () => {
  it("creates the Chromium-only config with serial workers and failure artifacts", () => {
    expect(existsSync("playwright.config.ts")).toBe(true);
    expect(configSource).toContain('import "dotenv/config";');
    expect(configSource).toContain('testDir: "./e2e"');
    expect(configSource).toContain("workers: 1");
    expect(configSource).toContain('name: "chromium"');
    expect(configSource).toContain('trace: "on-first-retry"');
    expect(configSource).toContain('screenshot: "only-on-failure"');
    expect(configSource).toContain('video: "retain-on-failure"');
  });

  it("derives baseURL from Playwright env, app env, then local default", () => {
    expect(configSource).toContain("process.env.PLAYWRIGHT_BASE_URL ??");
    expect(configSource).toContain("process.env.NEXT_PUBLIC_APP_URL ??");
    expect(configSource).toContain('"http://127.0.0.1:3000"');
    expect(configSource).toMatch(/use:\s*{[\s\S]*baseURL,/);
  });

  it("starts this worktree's local Next server and forbids default server reuse", () => {
    expect(configSource).toContain('command: "npm run dev -- --hostname 127.0.0.1"');
    expect(configSource).toContain("cwd: process.cwd()");
    expect(configSource).toContain("url: baseURL");
    expect(configSource).toContain(
      'process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1"',
    );
    expect(configSource).toContain("reuseExistingServer,");
    expect(configSource).toMatch(/false by default[\s\S]*parent checkout/i);
    expect(configSource).not.toMatch(/reuseExistingServer:\s*true/);
  });

  it("ignores Playwright local reports and failure artifacts", () => {
    for (const ignoredPath of [
      "test-results/",
      "playwright-report/",
      "blob-report/",
      "playwright/.cache/",
    ]) {
      expect(gitignoreSource).toContain(ignoredPath);
    }
  });
});
