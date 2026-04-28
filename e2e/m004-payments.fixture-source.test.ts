import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  M004_PAYMENTS_FIXTURE_FIELD_NAMES,
  M004_PAYMENTS_FIXTURE_REQUIRED_ENV_KEYS,
  M004_PAYMENTS_INTERNAL_ID_FIELD_NAMES,
  createM004PaymentsRunId,
} from "./m004-payments.fixture";

const fixtureSource = readFileSync("e2e/m004-payments.fixture.ts", "utf8");
const helperSource = readFileSync("e2e/m004-payments.e2e-helper.ts", "utf8");
const combinedM004Source = `${fixtureSource}\n${helperSource}`;

const expectedFixtureFields = [
  "storeSlug",
  "storeName",
  "productName",
  "productPrice",
  "customerName",
  "customerPhone",
  "customerEmail",
  "internalIds",
] as const;

const expectedInternalIdFields = [
  "customerId",
  "merchantUserId",
  "establishmentId",
  "productId",
] as const;

const expectedRequiredEnvKeys = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "SESSION_COOKIE_NAME",
  "SESSION_MAX_AGE_DAYS",
  "FAKE_PAYMENT_PROVIDER",
  "FAKE_PAYMENT_WEBHOOK_SECRET",
  "FAKE_PAYMENT_APPROVAL_MODE",
] as const;

const destructiveDbPatterns = [
  { label: "deleteMany", pattern: /\bdeleteMany\b/u },
  { label: "truncate", pattern: /\btruncate\b|\bTRUNCATE\b/u },
  { label: "drop database", pattern: /\bdrop\s+database\b/iu },
  { label: "migrate reset", pattern: /\bmigrate\s+reset\b/iu },
  { label: "db push", pattern: /\b(?:prisma\s+)?db\s+push\b/iu },
  { label: "raw execute", pattern: /\$executeRaw\b/u },
  { label: "raw query", pattern: /\$queryRaw\b/u },
] as const;

const rawEnvPatterns = [
  { label: "stringify process.env", pattern: /JSON\.stringify\s*\(\s*process\.env\b/u },
  {
    label: "Object env iteration",
    pattern: /Object\.(?:entries|values|keys)\s*\(\s*process\.env\b/u,
  },
  { label: "for-in process.env", pattern: /for\s*\([^)]*\bin\s+process\.env\s*\)/u },
  { label: "for-of process.env", pattern: /for\s*\([^)]*\bof\s+process\.env\s*\)/u },
] as const;

const unsafeOutputPattern =
  /customerPassword|merchantPassword|sessionToken|tokenHash|passwordHash|DATABASE_URL|AUTH_SECRET|SESSION_COOKIE_NAME|SESSION_MAX_AGE_DAYS|FAKE_PAYMENT_WEBHOOK_SECRET|process\.env|providerPayload|cardNumber|cvv|expiry|sha256=/iu;

const unsafeDiagnosticProviderPattern =
  /process\.stderr\.write\([\s\S]*providerPaymentId[\s\S]*?\);/u;

describe("M004 payment fixture/helper source contract", () => {
  it("pins required auth, database, and fake payment env keys without exposing values", () => {
    expect(M004_PAYMENTS_FIXTURE_REQUIRED_ENV_KEYS).toEqual(expectedRequiredEnvKeys);
    expect(fixtureSource).toContain("M004_PAYMENTS_FIXTURE_REQUIRED_ENV_KEYS");
    expect(fixtureSource).toContain("getAuthConfig(env)");

    for (const { label, pattern } of rawEnvPatterns) {
      expect(combinedM004Source, label).not.toMatch(pattern);
    }
  });

  it("uses seed helpers and service-core seams while avoiding server-only database imports", () => {
    expect(fixtureSource).toContain('from "../prisma/seed"');
    expect(fixtureSource).toContain("createPrismaClient");
    expect(fixtureSource).toContain("formatSafeError");
    expect(helperSource).toContain("createM004FixturePrismaClient");
    expect(helperSource).toContain("formatM004FixtureSafeError");

    for (const expectedImport of [
      "../src/modules/auth/service-core",
      "../src/modules/establishments/service-core",
      "../src/modules/products/service-core",
      "../src/modules/catalog/service-core",
      "../src/modules/orders/service-core",
    ]) {
      expect(combinedM004Source).toContain(expectedImport);
    }

    for (const forbiddenFragment of [
      "../src/server/db",
      "@/server/db",
      "server-only",
      "src/server/db",
    ]) {
      expect(combinedM004Source).not.toContain(forbiddenFragment);
    }
  });

  it("creates unique disposable run ids and generated fixture identities", () => {
    const firstRunId = createM004PaymentsRunId();
    const secondRunId = createM004PaymentsRunId();

    expect(firstRunId).not.toBe(secondRunId);
    expect(firstRunId).toMatch(/^[a-z0-9]+-[a-f0-9]{8}$/u);
    expect(secondRunId).toMatch(/^[a-z0-9]+-[a-f0-9]{8}$/u);
    expect(fixtureSource).toContain("Date.now().toString(36)");
    expect(fixtureSource).toContain("randomUUID().slice(0, 8)");
    expect(fixtureSource).toContain("m004-customer-${runId}@example.invalid");
    expect(fixtureSource).toContain("m004-merchant-${runId}@example.invalid");
  });

  it("returns only browser-safe fixture fields plus helper-owned internal ids", () => {
    expect(M004_PAYMENTS_FIXTURE_FIELD_NAMES).toEqual(expectedFixtureFields);
    expect(M004_PAYMENTS_INTERNAL_ID_FIELD_NAMES).toEqual(expectedInternalIdFields);

    for (const fieldName of expectedFixtureFields) {
      expect(fixtureSource).toContain(`${fieldName}:`);
    }

    for (const fieldName of expectedInternalIdFields) {
      expect(fixtureSource).toContain(`${fieldName}:`);
    }

    expect(M004_PAYMENTS_FIXTURE_FIELD_NAMES).not.toContain("customerPassword");
    expect(M004_PAYMENTS_FIXTURE_FIELD_NAMES).not.toContain("merchantPassword");
    expect(M004_PAYMENTS_FIXTURE_FIELD_NAMES).not.toContain("sessionToken");
    expect(M004_PAYMENTS_FIXTURE_FIELD_NAMES).not.toContain("providerPaymentId");
    expect(helperSource).toContain("writeJson({ fixture })");
  });

  it("creates active customer, approved merchant store, active product, and visible catalog records", () => {
    for (const requiredSetupFragment of [
      "auth.registerCustomer",
      "auth.registerMerchant",
      "establishmentService.approve",
      "approved.status !== EstablishmentStatus.ACTIVE",
      "productService.createForOwner",
      "product.status !== ProductStatus.ACTIVE",
      "catalogService.getActiveStoreCatalog",
      "catalog.products.some",
    ]) {
      expect(fixtureSource).toContain(requiredSetupFragment);
    }
  });

  it("revokes setup sessions on success or failure before browser work begins", () => {
    expect(fixtureSource).toContain("issuedSessionTokens.push(customerData.sessionToken)");
    expect(fixtureSource).toContain("issuedSessionTokens.push(merchantData.sessionToken)");
    expect(fixtureSource).toContain("finally {");
    expect(fixtureSource).toContain("revokeIssuedSessions(auth, issuedSessionTokens)");
    expect(fixtureSource).toContain("auth.revokeSessionByToken(sessionToken)");
    expect(fixtureSource).toContain("setup session revocation");
  });

  it("implements setup, read-online-payment, and assert-terminal-payment commands with safe malformed-input failures", () => {
    expect(helperSource).toContain('command === "setup"');
    expect(helperSource).toContain('command === "read-online-payment"');
    expect(helperSource).toContain('command === "assert-terminal-payment"');
    expect(helperSource).toContain("Unsupported M004 E2E helper command.");
    expect(helperSource).toContain("Malformed M004 helper JSON input.");
    expect(helperSource).toContain("Malformed M004 helper input for ${command}.");
    expect(helperSource).toContain("readOnlinePaymentInputSchema");
    expect(helperSource).toContain("assertTerminalPaymentInputSchema");
  });

  it("summarizes pending online payments with provider correlation and public instruction checks", () => {
    for (const expectedFragment of [
      "providerCorrelation",
      "providerPaymentId",
      "assertPendingOnlinePayment",
      "PaymentStatus.PENDING",
      "payment.providerStatus !== \"pending\"",
      "PAYMENT_GATEWAY_PROVIDER_FAKE_DEV",
      "PIX instruction shape mismatch",
      "CARD instruction shape mismatch",
      "getPublicOrderByCode",
      "publicTrackingInstructionsPresent",
    ]) {
      expect(helperSource).toContain(expectedFragment);
    }
  });

  it("asserts terminal approved, failed, and canceled outcomes without exposing provider ids in diagnostics", () => {
    for (const expectedFragment of [
      "assertTerminalOnlinePayment",
      "TerminalPaymentStatus",
      "providerStatusForPaymentStatus",
      "case \"PAID\"",
      "case \"FAILED\"",
      "case \"CANCELED\"",
      "matchTerminalTimestampExpectation",
      "providerPaymentIdPresent",
      "terminalTimestampsMatchStatus",
      "failSafe(context",
    ]) {
      expect(helperSource).toContain(expectedFragment);
    }

    expect(helperSource).not.toMatch(unsafeDiagnosticProviderPattern);
  });

  it("uses narrow Prisma selects and rejects destructive database commands or ignored planning artifacts", () => {
    expect(helperSource).toContain("select: {");
    expect(helperSource).toContain("payment: {");
    expect(helperSource).toContain("statusHistory: {");
    expect(helperSource).not.toContain("include:");

    for (const { label, pattern } of destructiveDbPatterns) {
      expect(combinedM004Source, label).not.toMatch(pattern);
    }

    expect(combinedM004Source).not.toContain(".gsd/");
    expect(combinedM004Source).not.toContain(".planning/");
  });

  it("keeps console logging and secret-bearing values out of fixture/helper output paths", () => {
    expect(fixtureSource).not.toMatch(/console\./u);
    expect(helperSource).not.toMatch(/console\./u);

    const outputCalls =
      helperSource.match(/process\.(?:stdout|stderr)\.write\([\s\S]*?\);/g) ?? [];

    expect(outputCalls.length).toBeGreaterThan(0);

    for (const outputCall of outputCalls) {
      expect(outputCall, "helper output should stay secret-safe").not.toMatch(
        unsafeOutputPattern,
      );
    }
  });
});
