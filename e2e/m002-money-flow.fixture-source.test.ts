import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  M002_FIXTURE_REQUIRED_ENV_KEYS,
  M002_MONEY_FLOW_FIXTURE_FIELD_NAMES,
  M002_MONEY_FLOW_INTERNAL_ID_FIELD_NAMES,
  createM002MoneyFlowRunId,
} from "./m002-money-flow.fixture";

const fixtureSource = readFileSync("e2e/m002-money-flow.fixture.ts", "utf8");
const smokeSource = readFileSync("scripts/verify-m002-e2e-fixture.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");
const combinedSource = `${fixtureSource}\n${smokeSource}`;

const expectedFixtureFields = [
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

const expectedInternalIdFields = [
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

describe("M002 money-flow fixture source contract", () => {
  it("pins seed helpers and service-core imports while avoiding server-only database seams", () => {
    expect(fixtureSource).toContain('from "../prisma/seed"');
    expect(fixtureSource).toContain("createPrismaClient");
    expect(fixtureSource).toContain("formatSafeError");

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
      expect(combinedSource).not.toContain(forbiddenFragment);
    }
  });

  it("uses unique disposable run identifiers and does not depend on existing fixture rows", () => {
    const firstRunId = createM002MoneyFlowRunId();
    const secondRunId = createM002MoneyFlowRunId();

    expect(firstRunId).not.toBe(secondRunId);
    expect(firstRunId).toMatch(/^[a-z0-9]+-[a-f0-9]{8}$/u);
    expect(secondRunId).toMatch(/^[a-z0-9]+-[a-f0-9]{8}$/u);
    expect(fixtureSource).toContain("Date.now().toString(36)");
    expect(fixtureSource).toContain("randomUUID().slice(0, 8)");
    expect(fixtureSource).toContain("@example.invalid");
  });

  it("returns only the stable fields needed by the browser E2E", () => {
    expect(M002_MONEY_FLOW_FIXTURE_FIELD_NAMES).toEqual(expectedFixtureFields);
    expect(M002_MONEY_FLOW_INTERNAL_ID_FIELD_NAMES).toEqual(
      expectedInternalIdFields,
    );

    for (const fieldName of expectedFixtureFields) {
      expect(fixtureSource).toContain(`${fieldName}:`);
    }

    for (const fieldName of expectedInternalIdFields) {
      expect(fixtureSource).toContain(`${fieldName}:`);
    }

    expect(M002_MONEY_FLOW_FIXTURE_FIELD_NAMES).not.toContain("merchantEmail");
    expect(M002_MONEY_FLOW_FIXTURE_FIELD_NAMES).not.toContain("merchantPassword");
    expect(M002_MONEY_FLOW_FIXTURE_FIELD_NAMES).not.toContain("sessionToken");
  });

  it("revokes setup sessions and exposes revocation drift to the smoke proof", () => {
    expect(fixtureSource).toContain("issuedSessionTokens.push(customerData.sessionToken)");
    expect(fixtureSource).toContain("issuedSessionTokens.push(merchantData.sessionToken)");
    expect(fixtureSource).toContain("finally {");
    expect(fixtureSource).toContain("revokeIssuedSessions(auth, issuedSessionTokens)");
    expect(fixtureSource).toContain("auth.revokeSessionByToken(sessionToken)");
    expect(smokeSource).toContain("revokedAt: null");
    expect(smokeSource).toContain("setupSessionsRevoked");
  });

  it("avoids destructive database commands and ignored planning artifacts", () => {
    for (const { label, pattern } of destructiveDbPatterns) {
      expect(combinedSource, label).not.toMatch(pattern);
    }

    expect(combinedSource).not.toContain(".gsd/");
    expect(combinedSource).not.toContain(".planning/");
  });

  it("keeps secret-bearing values out of logs and package wiring", () => {
    expect(fixtureSource).not.toMatch(/console\./u);

    const consoleLines = smokeSource
      .split(/\r?\n/u)
      .filter((line) => line.includes("console."))
      .join("\n");

    expect(consoleLines).not.toMatch(
      /customerEmail|customerPassword|password|sessionToken|tokenHash|process\.env/iu,
    );
    expect(packageSource).not.toMatch(
      /echo\s+[^&|;]*\$\{?(?:DATABASE_URL|AUTH_SECRET|SESSION_COOKIE_NAME|SESSION_MAX_AGE_DAYS)\}?/iu,
    );
  });

  it("pins the fixture smoke env preflight and real setup script", () => {
    expect(M002_FIXTURE_REQUIRED_ENV_KEYS).toEqual([
      "DATABASE_URL",
      "AUTH_SECRET",
      "SESSION_COOKIE_NAME",
      "SESSION_MAX_AGE_DAYS",
    ]);
    expect(smokeSource).toContain("setupM002MoneyFlowFixture({ prisma })");
    expect(smokeSource).toContain("formatM002FixtureSafeError(error)");
    expect(packageSource).toContain("scripts/verify-m002-e2e-fixture.ts");
  });
});
