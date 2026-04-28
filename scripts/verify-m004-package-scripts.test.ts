import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
  scripts: Record<string, string>;
};

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
const scripts = packageJson.scripts;
const requireEnvSource = readFileSync("scripts/require-env.mjs", "utf8");
const m004SmokePath = "scripts/verify-m004-payments-webhooks.ts";
const m004SmokeSource = readFileSync(m004SmokePath, "utf8");
const m004E2EPath = "e2e/m004-payments.spec.ts";
const m004E2ESource = readFileSync(m004E2EPath, "utf8");
const m004FixturePath = "e2e/m004-payments.fixture.ts";
const m004FixtureSource = readFileSync(m004FixturePath, "utf8");
const m004HelperPath = "e2e/m004-payments.e2e-helper.ts";
const m004HelperSource = readFileSync(m004HelperPath, "utf8");
const m004FixtureSourceContractPath = "e2e/m004-payments.fixture-source.test.ts";
const m004FixtureSourceContractSource = readFileSync(
  m004FixtureSourceContractPath,
  "utf8",
);

const envPreflight = "node scripts/require-env.mjs";
const m004SmokeEnvKeys = [
  "DATABASE_URL",
  "FAKE_PAYMENT_PROVIDER",
  "FAKE_PAYMENT_WEBHOOK_SECRET",
  "FAKE_PAYMENT_APPROVAL_MODE",
] as const;
const m004E2EEnvKeys = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "SESSION_COOKIE_NAME",
  "SESSION_MAX_AGE_DAYS",
  "FAKE_PAYMENT_PROVIDER",
  "FAKE_PAYMENT_WEBHOOK_SECRET",
  "FAKE_PAYMENT_APPROVAL_MODE",
] as const;
const m004SmokeCommand = `${envPreflight} ${m004SmokeEnvKeys.join(" ")} && tsx ${m004SmokePath}`;
const m004E2ECommand = `${envPreflight} ${m004E2EEnvKeys.join(" ")} && playwright test ${m004E2EPath}`;

const verifyM001Steps = [
  "npm run db:generate",
  "npm test",
  "npm run lint",
  "npm run build",
  "npm run db:deploy",
  "npm run db:seed",
  "npm run smoke:m001",
] as const;

const verifyM003Steps = [
  ...verifyM001Steps,
  "npm run smoke:m002",
  "npm run smoke:m003",
  "npm run e2e:m002",
  "npm run e2e:m003",
] as const;

const verifyM004Steps = [
  ...verifyM001Steps,
  "npm run smoke:m002",
  "npm run smoke:m003",
  "npm run smoke:m004",
  "npm run e2e:m002",
  "npm run e2e:m003",
  "npm run e2e:m004",
] as const;

const requiredM004Files = [
  m004SmokePath,
  m004E2EPath,
  m004FixturePath,
  m004HelperPath,
  m004FixtureSourceContractPath,
] as const;

const requiredSmokeSeams = [
  "createPrismaClient",
  "formatSafeError",
  "SeedStateError",
  "createAuthServiceCore",
  "createEstablishmentServiceCore",
  "createProductServiceCore",
  "createOrderServiceCore",
  "getPaymentGatewayProvider",
  "getFakeDevPaymentConfig",
  "createPaymentWebhookServiceCore",
  "handleFakeDevPaymentWebhookRoute",
  "createFakeDevPaymentWebhookSignature",
  "FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_HEADER",
  "FAKE_DEV_PAYMENT_WEBHOOK_TIMESTAMP_HEADER",
  "getPublicOrderByCode",
] as const;

const requiredScenarioCoverage = [
  "pix-approved",
  "pix-failed",
  "pix-canceled",
  "card-approved",
  "card-failed",
  "card-canceled",
  "duplicate-approved",
  "invalid-signature",
  "malformed-json",
  "unknown-field-payload",
  "unknown-provider-payment",
  "unsupported-cash-row",
  "terminal-conflict",
  "cash-untouched-final",
  "PAYMENT_WEBHOOK_APPLIED",
  "PAYMENT_WEBHOOK_IDEMPOTENT_DUPLICATE",
  "PAYMENT_WEBHOOK_INVALID_SIGNATURE",
  "PAYMENT_WEBHOOK_MALFORMED_JSON",
  "PAYMENT_WEBHOOK_UNKNOWN_FIELD",
  "PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND",
  "PAYMENT_WEBHOOK_PAYMENT_UNSUPPORTED",
  "PAYMENT_WEBHOOK_TERMINAL_CONFLICT",
  "PaymentMethod.CASH",
  'method: "PIX"',
  'method: "CARD"',
] as const;

const requiredM004E2ECoverage = [
  "M004_E2E_REQUIRED_ENV_KEYS",
  "approves a PIX checkout through the signed fake/dev webhook route",
  "fails a hosted-card checkout through the signed fake/dev webhook route",
  "read-online-payment",
  "assert-terminal-payment",
  "postSignedFakeDevWebhook",
  "createFakeDevPaymentWebhookSignature",
  "monitorBrowserDiagnostics",
  "expectNoBrowserDiagnostics",
  "assertPendingPixTrackingPage",
  "assertPendingCardTrackingPage",
  "assertTerminalTrackingPage",
  "assertNoCardCollectionFields",
  "assertPublicPageDoesNotLeakSensitiveData",
  'changed: true',
  'paymentStatus: "PAID"',
  'paymentStatus: "FAILED"',
  "publicCode",
  "providerPaymentId",
] as const;

const routeSignalCoverage = [
  "body.data.changed",
  "body.data.paymentStatus",
  "body.data.publicCode",
  "body.data.revalidated",
  "getPublicOrderTrackingPath(publicCode)",
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
      /\becho\s+[^&|;]*\$\{?(?:DATABASE_URL|AUTH_SECRET|SESSION_COOKIE_NAME|SESSION_MAX_AGE_DAYS|FAKE_PAYMENT_WEBHOOK_SECRET|FAKE_PAYMENT_PROVIDER|FAKE_PAYMENT_APPROVAL_MODE|SEED_ADMIN_PASSWORD|[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD)[A-Z0-9_]*)\}?\b/i,
  },
] as const;

const unsafeRuntimeSourcePatterns = [
  { label: "deleteMany cleanup", pattern: /\bdeleteMany\s*\(/i },
  { label: "truncate", pattern: /\btruncate\b/i },
  { label: "raw SQL", pattern: /\$(?:queryRaw|executeRaw)(?:Unsafe)?\b/i },
  { label: "migrate reset", pattern: /\bmigrate\s+reset\b/i },
  { label: "db push", pattern: /\b(?:prisma\s+)?db\s+push\b/i },
  { label: "server-only DB import", pattern: /from\s+["'][^"']*(?:server\/db|@\/server\/db)["']/i },
  { label: "raw env serialization", pattern: /JSON\.stringify\s*\(\s*process\.env\b/i },
  { label: "raw env iteration", pattern: /Object\.(?:entries|keys|values)\s*\(\s*process\.env\b/i },
  { label: "ignored GSD artifact import", pattern: /\.gsd\//i },
  { label: "ignored planning artifact import", pattern: /\.planning\//i },
] as const;

const secretOutputPattern =
  /\b(?:DATABASE_URL|AUTH_SECRET|SESSION_COOKIE_NAME|SESSION_MAX_AGE_DAYS|FAKE_PAYMENT_WEBHOOK_SECRET|FAKE_PAYMENT_PROVIDER|FAKE_PAYMENT_APPROVAL_MODE|process\.env|webhookSecret|providerPaymentId|providerPayload|rawBody|signature|sha256|cardNumber|cardBrand|cardLast4|cvv|expiry|sessionToken|passwordHash|smokePassword|deliveryAddress|customerPhone)\b/i;

const runtimeSourceSurfaces = [
  { path: m004SmokePath, source: m004SmokeSource },
  { path: m004E2EPath, source: m004E2ESource },
  { path: m004FixturePath, source: m004FixtureSource },
  { path: m004HelperPath, source: m004HelperSource },
] as const;

function requirePackageScript(name: string) {
  const script = scripts[name];

  expect(script, `${name} script should exist`).toBeTypeOf("string");

  return script;
}

function expectStepsInOrder(script: string, expectedSteps: readonly string[]) {
  let previousIndex = -1;

  for (const step of expectedSteps) {
    const currentIndex = script.indexOf(step);

    expect(currentIndex, `${step} should appear after prior verify:m004 steps`)
      .toBeGreaterThan(previousIndex);
    previousIndex = currentIndex;
  }
}

describe("M004 package verification scripts", () => {
  it("adds the key-only env-gated M004 PostgreSQL smoke package entrypoint", () => {
    expect(requirePackageScript("smoke:m004")).toBe(m004SmokeCommand);
    expect(requirePackageScript("smoke:m004").startsWith(`${envPreflight} ${m004SmokeEnvKeys.join(" ")} &&`)).toBe(true);
    expect(requirePackageScript("smoke:m004")).toContain(m004SmokePath);
  });

  it("adds the final key-only env-gated M004 Chromium E2E package entrypoint", () => {
    const e2eScript = requirePackageScript("e2e:m004");

    expect(e2eScript).toBe(m004E2ECommand);
    expect(e2eScript.startsWith(`${envPreflight} ${m004E2EEnvKeys.join(" ")} &&`)).toBe(true);
    expect(e2eScript).toContain(m004E2EPath);
    expect(e2eScript).not.toBe(`${envPreflight} ${m004E2EEnvKeys.join(" ")} && playwright test`);
    expect(e2eScript).not.toMatch(/\bplaywright\s+install\b/i);
  });

  it("finalizes verify:m004 after prior milestone regressions with S06 Chromium coverage last", () => {
    const verifyM003Script = requirePackageScript("verify:m003");
    const verifyM004Script = requirePackageScript("verify:m004");

    expect(verifyM003Script.split(" && ")).toEqual([...verifyM003Steps]);
    expect(verifyM003Script, "verify:m003 must remain M003-only").not.toMatch(/m004/i);

    expect(verifyM004Script.split(" && ")).toEqual([...verifyM004Steps]);
    expectStepsInOrder(verifyM004Script, verifyM004Steps);
    expect(verifyM004Script, "S06 final proof must include M004 Chromium E2E").toContain("npm run e2e:m004");
    expect(verifyM004Script.endsWith("npm run e2e:m004"), "M004 E2E should be the final acceptance boundary").toBe(true);
  });

  it("requires the final M004 E2E, helper, fixture, and source-contract files", () => {
    for (const requiredFile of requiredM004Files) {
      expect(existsSync(requiredFile), `${requiredFile} should exist`).toBe(true);
    }

    expect(m004FixtureSource).toContain("M004_PAYMENTS_FIXTURE_REQUIRED_ENV_KEYS");
    expect(m004HelperSource).toContain('command === "setup"');
    expect(m004HelperSource).toContain('command === "read-online-payment"');
    expect(m004HelperSource).toContain('command === "assert-terminal-payment"');
    expect(m004FixtureSourceContractSource).toContain("M004 payment fixture/helper source contract");
  });

  it("keeps the M004 smoke wired through disposable service-core and webhook-route seams", () => {
    expect(existsSync(m004SmokePath), `${m004SmokePath} should exist`).toBe(true);

    for (const requiredSource of requiredSmokeSeams) {
      expect(m004SmokeSource, `${requiredSource} should appear in the M004 smoke source`).toContain(
        requiredSource,
      );
    }
  });

  it("covers expected M004 webhook scenarios, result codes, public tracking, and payment methods", () => {
    for (const requiredSource of requiredScenarioCoverage) {
      expect(m004SmokeSource, `${requiredSource} should be covered by the M004 smoke`).toContain(
        requiredSource,
      );
    }

    for (const requiredSignal of routeSignalCoverage) {
      expect(m004SmokeSource, `${requiredSignal} should be asserted by the M004 smoke`).toContain(
        requiredSignal,
      );
    }
  });

  it("covers expected M004 Chromium checkout, webhook, tracking, and diagnostics paths", () => {
    for (const requiredSource of requiredM004E2ECoverage) {
      expect(m004E2ESource, `${requiredSource} should be covered by the M004 E2E`).toContain(
        requiredSource,
      );
    }
  });

  it("keeps env preflights key-only and delegates missing-key formatting to require-env", () => {
    expect(requireEnvSource).toContain("const requiredKeys = process.argv.slice(2);");
    expect(requireEnvSource).toContain("missingKeys.join");

    const consoleOutputCalls = requireEnvSource.match(/console\.(?:error|log)\([\s\S]*?\);/g) ?? [];

    for (const outputCall of consoleOutputCalls) {
      expect(outputCall, "require-env should print key names, not env values").not.toContain(
        "process.env",
      );
    }

    expect(requireEnvSource).not.toMatch(/JSON\.stringify\s*\(\s*process\.env\b/);
    expect(requireEnvSource).not.toMatch(/Object\.(?:entries|keys|values)\s*\(\s*process\.env\b/);
  });

  it("rejects destructive commands, raw env reads, hidden browser installs, and secret echoes", () => {
    const commandSurface = Object.entries(scripts)
      .map(([name, command]) => `${name}: ${command}`)
      .join("\n");

    for (const { label, pattern } of unsafeCommandPatterns) {
      expect(commandSurface, `${label} must not appear in package scripts`).not.toMatch(pattern);
    }
  });

  it("guards M004 runtime sources against destructive database and unsafe env/source patterns", () => {
    for (const { path, source } of runtimeSourceSurfaces) {
      for (const { label, pattern } of unsafeRuntimeSourcePatterns) {
        expect(source, `${label} must not appear in ${path}`).not.toMatch(pattern);
      }
    }
  });

  it("keeps M004 smoke and helper output paths secret-safe", () => {
    const outputCalls = [
      ...(m004SmokeSource.match(/console\.(?:error|info|log)\([\s\S]*?\);/g) ?? []),
      ...(m004HelperSource.match(/process\.(?:stdout|stderr)\.write\([\s\S]*?\);/g) ?? []),
    ];

    expect(outputCalls.length, "M004 smoke/helper should expose observable status").toBeGreaterThan(0);

    for (const outputCall of outputCalls) {
      expect(outputCall, "M004 output paths should stay secret-safe").not.toMatch(
        secretOutputPattern,
      );
    }
  });
});
