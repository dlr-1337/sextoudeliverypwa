import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  M002_FIXTURE_REQUIRED_ENV_KEYS,
  M002_MONEY_FLOW_FIXTURE_FIELD_NAMES,
  M002_MONEY_FLOW_INTERNAL_ID_FIELD_NAMES,
} from "./m002-money-flow.fixture";
import {
  M003_FIXTURE_REQUIRED_ENV_KEYS,
  M003_ORDER_OPERATIONS_FIXTURE_FIELD_NAMES,
  M003_ORDER_OPERATIONS_INTERNAL_ID_FIELD_NAMES,
  createM003OrderOperationsRunId,
} from "./m003-order-operations.fixture";

const fixtureSource = readFileSync("e2e/m003-order-operations.fixture.ts", "utf8");
const helperSource = readFileSync(
  "e2e/m003-order-operations.e2e-helper.ts",
  "utf8",
);
const m002FixtureSource = readFileSync("e2e/m002-money-flow.fixture.ts", "utf8");
const combinedM003Source = `${fixtureSource}\n${helperSource}`;

const expectedFixtureFields = [
  "storeSlug",
  "storeName",
  "productName",
  "productPrice",
  "customerName",
  "customerPhone",
  "customerEmail",
  "ownerMerchantEmail",
  "internalIds",
] as const;

const expectedInternalIdFields = [
  "customerId",
  "ownerMerchantUserId",
  "establishmentId",
  "productId",
] as const;

const expectedM002FixtureFields = [
  "storeSlug",
  "storeName",
  "productName",
  "productPrice",
  "customerName",
  "customerPhone",
  "customerEmail",
  "customerPassword",
  "internalIds",
] as const;

const expectedM002InternalIdFields = [
  "customerId",
  "merchantUserId",
  "establishmentId",
  "productId",
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

const forbiddenFixtureFieldPattern =
  /(?:password|session|token|hash|databaseUrl|DATABASE_URL|provider|pix|card|gsd|planning)/iu;

describe("M003 order-operations fixture source contract", () => {
  it("pins required auth/database env keys without exposing values", () => {
    expect(M003_FIXTURE_REQUIRED_ENV_KEYS).toEqual([
      "DATABASE_URL",
      "AUTH_SECRET",
      "SESSION_COOKIE_NAME",
      "SESSION_MAX_AGE_DAYS",
    ]);

    expect(fixtureSource).toContain("M003_FIXTURE_REQUIRED_ENV_KEYS");
    expect(fixtureSource).toContain("getAuthConfig(env)");
    expect(helperSource).not.toMatch(/JSON\.stringify\s*\(\s*process\.env\b/u);
    expect(helperSource).not.toMatch(/Object\.(?:entries|values)\s*\(\s*process\.env\b/u);
  });

  it("uses seed helpers and service-core seams while avoiding server-only database imports", () => {
    expect(fixtureSource).toContain('from "../prisma/seed"');
    expect(fixtureSource).toContain("createPrismaClient");
    expect(fixtureSource).toContain("formatSafeError");
    expect(helperSource).toContain("createM003FixturePrismaClient");
    expect(helperSource).toContain("formatM003FixtureSafeError");

    for (const expectedImport of [
      "../src/modules/auth/service-core",
      "../src/modules/establishments/service-core",
      "../src/modules/products/service-core",
      "../src/modules/catalog/service-core",
    ]) {
      expect(fixtureSource).toContain(expectedImport);
    }

    for (const forbiddenFragment of [
      "../src/server/db",
      "@/server/db",
      "server-only",
      "src/server/db",
    ]) {
      expect(combinedM003Source).not.toContain(forbiddenFragment);
    }
  });

  it("creates unique disposable run ids and generated fixture identities", () => {
    const firstRunId = createM003OrderOperationsRunId();
    const secondRunId = createM003OrderOperationsRunId();

    expect(firstRunId).not.toBe(secondRunId);
    expect(firstRunId).toMatch(/^[a-z0-9]+-[a-f0-9]{8}$/u);
    expect(secondRunId).toMatch(/^[a-z0-9]+-[a-f0-9]{8}$/u);
    expect(fixtureSource).toContain("Date.now().toString(36)");
    expect(fixtureSource).toContain("randomUUID().slice(0, 8)");
    expect(fixtureSource).toContain("m003-customer-${runId}@example.invalid");
    expect(fixtureSource).toContain("m003-owner-${runId}@example.invalid");
  });

  it("returns only browser-safe fixture fields plus helper-only ids", () => {
    expect(M003_ORDER_OPERATIONS_FIXTURE_FIELD_NAMES).toEqual(expectedFixtureFields);
    expect(M003_ORDER_OPERATIONS_INTERNAL_ID_FIELD_NAMES).toEqual(
      expectedInternalIdFields,
    );

    for (const fieldName of expectedFixtureFields) {
      expect(fieldName, `${fieldName} should be safe for helper stdout`).not.toMatch(
        forbiddenFixtureFieldPattern,
      );
      expect(fixtureSource).toContain(`${fieldName}:`);
    }

    for (const fieldName of expectedInternalIdFields) {
      expect(fixtureSource).toContain(`${fieldName}:`);
    }

    expect(M003_ORDER_OPERATIONS_FIXTURE_FIELD_NAMES).not.toContain("customerPassword");
    expect(M003_ORDER_OPERATIONS_FIXTURE_FIELD_NAMES).not.toContain("ownerMerchantPassword");
    expect(M003_ORDER_OPERATIONS_FIXTURE_FIELD_NAMES).not.toContain("sessionToken");
    expect(helperSource).toContain("writeJson({ fixture })");
  });

  it("creates active customer, approved owner merchant store, active product, and visible catalog records", () => {
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
    expect(fixtureSource).toContain(
      "issuedSessionTokens.push(ownerMerchantData.sessionToken)",
    );
    expect(fixtureSource).toContain("finally {");
    expect(fixtureSource).toContain("revokeIssuedSessions(auth, issuedSessionTokens)");
    expect(fixtureSource).toContain("auth.revokeSessionByToken(sessionToken)");
    expect(fixtureSource).toContain("setup session revocation");
  });

  it("implements setup and assert-order-operated helper commands with safe malformed-input failures", () => {
    expect(helperSource).toContain('command === "setup"');
    expect(helperSource).toContain('command === "assert-order-operated"');
    expect(helperSource).toContain("Unsupported M003 E2E helper command.");
    expect(helperSource).toContain("Malformed M003 helper JSON input.");
    expect(helperSource).toContain("readRequiredString(input.publicCode, \"public code\")");
    expect(helperSource).toContain("readFixture(input.fixture)");
    expect(helperSource).toContain("fixture owner merchant user id");
  });

  it("summarizes post-operation database state without printing private rows", () => {
    for (const expectedSummaryField of [
      "orderExists",
      "acceptedAtSet",
      "updatedAtMatchesAcceptedAt",
      "terminalTimestampsNull",
      "storeMatchesFixture",
      "customerMatchesFixture",
      "itemProductMatchesFixture",
      "historyCount",
      "initialHistoryActorMatchesCustomer",
      "acceptedHistoryActorMatchesMerchant",
      "acceptedHistoryNoteMatchesExpected",
      "providerFieldsNull",
      "pixFieldsNull",
      "cardFieldsNull",
      "settlementFieldsNull",
    ]) {
      expect(helperSource).toContain(expectedSummaryField);
    }

    expect(helperSource).toContain("payment.provider === null");
    expect(helperSource).toContain("payment.pixCopyPaste === null");
    expect(helperSource).toContain("payment.cardLast4 === null");
    expect(helperSource).toContain("return emptySummary();");
  });

  it("avoids destructive database commands, raw SQL, and ignored planning artifacts", () => {
    for (const { label, pattern } of destructiveDbPatterns) {
      expect(combinedM003Source, label).not.toMatch(pattern);
    }

    expect(combinedM003Source).not.toContain(".gsd/");
    expect(combinedM003Source).not.toContain(".planning/");
  });

  it("keeps generated secrets out of fixture/helper output paths", () => {
    expect(fixtureSource).not.toMatch(/console\./u);
    expect(helperSource).not.toMatch(/console\./u);

    const outputCalls =
      helperSource.match(/process\.(?:stdout|stderr)\.write\([\s\S]*?\);/g) ?? [];

    for (const outputCall of outputCalls) {
      expect(outputCall, "helper output should stay secret-safe").not.toMatch(
        /customerPassword|ownerMerchantPassword|sessionToken|tokenHash|passwordHash|DATABASE_URL|AUTH_SECRET|SESSION_COOKIE_NAME|SESSION_MAX_AGE_DAYS|process\.env/iu,
      );
    }
  });

  it("preserves the M002 fixture privacy contract while adding M003 owner-merchant email", () => {
    expect(M002_FIXTURE_REQUIRED_ENV_KEYS).toEqual([
      "DATABASE_URL",
      "AUTH_SECRET",
      "SESSION_COOKIE_NAME",
      "SESSION_MAX_AGE_DAYS",
    ]);
    expect(M002_MONEY_FLOW_FIXTURE_FIELD_NAMES).toEqual(expectedM002FixtureFields);
    expect(M002_MONEY_FLOW_INTERNAL_ID_FIELD_NAMES).toEqual(
      expectedM002InternalIdFields,
    );
    expect(m002FixtureSource).toContain("customerPassword:");
    expect(m002FixtureSource).not.toContain("ownerMerchantEmail:");
    expect(M003_ORDER_OPERATIONS_FIXTURE_FIELD_NAMES).toContain(
      "ownerMerchantEmail",
    );
  });
});
