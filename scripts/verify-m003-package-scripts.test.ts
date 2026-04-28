import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
const scripts = packageJson.scripts;
const requireEnvSource = readFileSync("scripts/require-env.mjs", "utf8");
const configSource = readFileSync("playwright.config.ts", "utf8");
const gitignoreSource = readFileSync(".gitignore", "utf8");
const m003SmokePath = "scripts/verify-m003-order-operations.ts";
const m003SmokeSource = readFileSync(m003SmokePath, "utf8");

const e2eEnvKeys = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "SESSION_COOKIE_NAME",
  "SESSION_MAX_AGE_DAYS",
] as const;

const envPreflight = "node scripts/require-env.mjs";
const e2ePreflight = `${envPreflight} ${e2eEnvKeys.join(" ")}`;

const m002E2ECommand = `${e2ePreflight} && playwright test e2e/m002-money-flow.spec.ts`;
const m003SmokeCommand = `${envPreflight} DATABASE_URL && tsx scripts/verify-m003-order-operations.ts`;
const m003E2ECommand = `${e2ePreflight} && playwright test e2e/m003-order-operations.spec.ts`;

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

const verifyM003Steps = [
  ...verifyM001Steps,
  "npm run smoke:m002",
  "npm run smoke:m003",
  "npm run e2e:m002",
  "npm run e2e:m003",
] as const;

const e2eScriptSpecs = [
  { name: "e2e:m002", file: "e2e/m002-money-flow.spec.ts", command: m002E2ECommand },
  { name: "e2e:m003", file: "e2e/m003-order-operations.spec.ts", command: m003E2ECommand },
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

const unsafeSmokeSourcePatterns = [
  { label: "deleteMany cleanup", pattern: /\bdeleteMany\s*\(/i },
  { label: "truncate", pattern: /\btruncate\b/i },
  { label: "raw SQL", pattern: /\$(?:queryRaw|executeRaw)(?:Unsafe)?\b/i },
  { label: "migrate reset", pattern: /\bmigrate\s+reset\b/i },
  { label: "db push", pattern: /\b(?:prisma\s+)?db\s+push\b/i },
  { label: "server-only DB import", pattern: /from\s+["'][^"']*(?:server\/db|@\/server\/db)["']/i },
  { label: "raw env serialization", pattern: /JSON\.stringify\s*\(\s*process\.env\b/i },
  { label: "raw env iteration", pattern: /Object\.(?:entries|values)\s*\(\s*process\.env\b/i },
] as const;

const secretOutputPattern =
  /\b(?:smokePassword|sessionToken|passwordHash|providerPayload|process\.env)\b/i;

function requirePackageScript(name: string) {
  const script = scripts[name];

  expect(script, `${name} script should exist`).toBeTypeOf("string");

  return script;
}

function expectStepsInOrder(script: string, expectedSteps: readonly string[]) {
  let previousIndex = -1;

  for (const step of expectedSteps) {
    const currentIndex = script.indexOf(step);

    expect(currentIndex, `${step} should appear after prior verify:m003 steps`)
      .toBeGreaterThan(previousIndex);
    previousIndex = currentIndex;
  }
}

describe("M003 package verification scripts", () => {
  it("adds env-gated M003 smoke and E2E scripts with exact future file targets", () => {
    expect(requirePackageScript("smoke:m003")).toBe(m003SmokeCommand);
    expect(requirePackageScript("e2e:m003")).toBe(m003E2ECommand);

    expect(m003SmokeCommand).toContain("scripts/verify-m003-order-operations.ts");
    expect(m003E2ECommand).toContain("e2e/m003-order-operations.spec.ts");
  });

  it("keeps the M003 smoke wired through disposable service-core seams", () => {
    expect(existsSync(m003SmokePath), `${m003SmokePath} should exist`).toBe(true);

    for (const requiredSource of [
      "createPrismaClient",
      "formatSafeError",
      "SeedStateError",
      "createAuthServiceCore",
      "createEstablishmentServiceCore",
      "createProductServiceCore",
      "createOrderServiceCore",
      "generatePublicOrderCode",
      "createCashOrder",
      "transitionMerchantOrderStatusForOwner",
      "getPublicOrderByCode",
    ]) {
      expect(m003SmokeSource).toContain(requiredSource);
    }

    expect(m003SmokeSource).toContain("wrong-owner");
    expect(m003SmokeSource).toContain("STALE_STATUS");
    expect(m003SmokeSource).toContain("INVALID_TRANSITION");
    expect(m003SmokeSource).toContain("publicDtoPrivateFieldsSafe");
  });

  it("guards the M003 smoke against destructive database and secret-printing patterns", () => {
    for (const { label, pattern } of unsafeSmokeSourcePatterns) {
      expect(m003SmokeSource, `${label} must not appear in the M003 smoke`).not.toMatch(
        pattern,
      );
    }

    const consoleOutputCalls =
      m003SmokeSource.match(/console\.(?:error|info|log)\([\s\S]*?\);/g) ?? [];

    for (const outputCall of consoleOutputCalls) {
      expect(outputCall, "M003 smoke console output should stay secret-safe").not.toMatch(
        secretOutputPattern,
      );
    }
  });

  it("keeps both M002 and M003 Playwright scripts file-scoped", () => {
    for (const { name, file, command } of e2eScriptSpecs) {
      const script = requirePackageScript(name);

      expect(script).toBe(command);
      expect(script).not.toBe(`${e2ePreflight} && playwright test`);
      expect(script.endsWith(`playwright test ${file}`), `${name} should target one spec file`).toBe(true);
      expect(file.startsWith("e2e/"), `${file} should stay under the Playwright testDir`).toBe(true);
      expect(file.endsWith(".spec.ts"), `${file} should match the Playwright spec convention`).toBe(true);
      expect(file, `${file} must not traverse outside the tracked test tree`).not.toContain("..");
    }

    expect(configSource).toContain('testDir: "./e2e"');
    expect(configSource).toContain('testMatch: "**/*.spec.ts"');
  });

  it("extends the M001/M002 verification chain in the exact M003 final order", () => {
    const verifyM002Script = requirePackageScript("verify:m002");
    const verifyM003Script = requirePackageScript("verify:m003");

    expect(verifyM002Script.split(" && ")).toEqual([...verifyM002Steps]);
    expect(verifyM002Script, "verify:m002 must remain M002-only").not.toMatch(/m003/i);

    expect(verifyM003Script.split(" && ")).toEqual([...verifyM003Steps]);
    expectStepsInOrder(verifyM003Script, verifyM003Steps);
  });

  it("keeps env preflights key-only and delegates missing-key formatting to require-env", () => {
    expect(requirePackageScript("smoke:m003").startsWith(`${envPreflight} DATABASE_URL &&`)).toBe(true);
    expect(requirePackageScript("e2e:m003").startsWith(`${e2ePreflight} &&`)).toBe(true);

    expect(requireEnvSource).toContain("const requiredKeys = process.argv.slice(2);");
    expect(requireEnvSource).toContain("missingKeys.join");

    const consoleOutputCalls = requireEnvSource.match(/console\.(?:error|log)\([\s\S]*?\);/g) ?? [];

    for (const outputCall of consoleOutputCalls) {
      expect(outputCall, "require-env should print key names, not env values").not.toContain(
        "process.env",
      );
    }

    expect(requireEnvSource).not.toMatch(/JSON\.stringify\s*\(\s*process\.env\b/);
    expect(requireEnvSource).not.toMatch(/Object\.(?:entries|values)\s*\(\s*process\.env\b/);
  });

  it("rejects destructive commands, raw env reads, hidden browser installs, and secret echoes", () => {
    const commandSurface = Object.entries(scripts)
      .map(([name, command]) => `${name}: ${command}`)
      .join("\n");

    for (const { label, pattern } of unsafeCommandPatterns) {
      expect(commandSurface, `${label} must not appear in package scripts`).not.toMatch(pattern);
    }
  });

  it("keeps Playwright failure artifacts inspectable but ignored from git", () => {
    expect(packageJson.devDependencies["@playwright/test"]).toBeTypeOf("string");

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
