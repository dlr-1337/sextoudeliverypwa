import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const initMigration = readFileSync(
  "prisma/migrations/00000000000000_init/migration.sql",
  "utf8",
);
const statusContractMigration = readFileSync(
  "prisma/migrations/00000000000001_establishment_status_contract/migration.sql",
  "utf8",
);
const logoUrlMigration = readFileSync(
  "prisma/migrations/00000000000002_establishment_logo_url/migration.sql",
  "utf8",
);
const migration = `${initMigration}\n\n${statusContractMigration}\n\n${logoUrlMigration}`;
const dbClient = readFileSync("src/server/db.ts", "utf8");
const prismaConfig = readFileSync("prisma.config.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

const requiredModels = [
  "User",
  "Session",
  "Category",
  "Establishment",
  "Product",
  "Order",
  "OrderItem",
  "OrderStatusHistory",
  "Payment",
  "MonthlyBilling",
];

const requiredEnums = [
  "UserRole",
  "UserStatus",
  "EstablishmentStatus",
  "CategoryType",
  "ProductStatus",
  "OrderStatus",
  "PaymentMethod",
  "PaymentStatus",
  "MonthlyBillingStatus",
];

function tableDefinition(tableName: string) {
  const match = migration.match(
    new RegExp(`CREATE TABLE "${tableName}" \\([\\s\\S]*?\\n\\);`),
  );

  return match?.[0] ?? "";
}

function modelDefinition(modelName: string) {
  const match = schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`));

  return match?.[0] ?? "";
}

function enumValues(enumName: string) {
  const match = schema.match(new RegExp(`enum ${enumName} \\{([\\s\\S]*?)\\n\\}`));
  const enumBody = match?.[1] ?? "";

  return enumBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"));
}

describe("Prisma database foundation contract", () => {
  it("declares the required models, enums, and explicit generated client output", () => {
    for (const model of requiredModels) {
      expect(schema).toContain(`model ${model} {`);
    }

    for (const prismaEnum of requiredEnums) {
      expect(schema).toContain(`enum ${prismaEnum} {`);
    }

    expect(schema).toContain('provider = "prisma-client"');
    expect(schema).toContain('output   = "../src/generated/prisma"');
    expect(dbClient).toContain('import "server-only";');
    expect(dbClient).toContain(
      'import { PrismaClient } from "@/generated/prisma/client";',
    );
    expect(dbClient).toContain("globalForPrisma.prisma ?? createPrismaClient()");
  });

  it("keeps DB-mutating scripts behind a secret-safe DATABASE_URL preflight", () => {
    expect(prismaConfig).toContain('import "dotenv/config";');
    expect(prismaConfig).toContain('seed: "tsx prisma/seed.ts"');
    expect(prismaConfig).toContain('env("DATABASE_URL")');
    expect(packageJson.scripts["db:deploy"]).toContain(
      "node scripts/require-env.mjs DATABASE_URL && prisma migrate deploy",
    );
    expect(packageJson.scripts["db:migrate"]).toContain(
      "node scripts/require-env.mjs DATABASE_URL && prisma migrate dev",
    );
    expect(packageJson.scripts["db:seed"]).toContain(
      "node scripts/require-env.mjs DATABASE_URL && tsx prisma/seed.ts",
    );
  });

  it("aligns establishment statuses with approval semantics without changing product draft statuses", () => {
    expect(enumValues("EstablishmentStatus")).toEqual([
      "PENDING",
      "ACTIVE",
      "BLOCKED",
      "INACTIVE",
    ]);
    expect(enumValues("EstablishmentStatus")).not.toContain("DRAFT");
    expect(enumValues("EstablishmentStatus")).not.toContain("PAUSED");
    expect(enumValues("EstablishmentStatus")).not.toContain("ARCHIVED");
    expect(enumValues("ProductStatus")).toEqual([
      "DRAFT",
      "ACTIVE",
      "PAUSED",
      "ARCHIVED",
    ]);

    const establishments = modelDefinition("Establishment");

    expect(establishments).toMatch(
      /status\s+EstablishmentStatus\s+@default\(PENDING\)/,
    );
    expect(establishments).not.toMatch(
      /status\s+EstablishmentStatus\s+@default\(DRAFT\)/,
    );
    expect(statusContractMigration).toContain(
      'ALTER TYPE "EstablishmentStatus" RENAME VALUE \'DRAFT\' TO \'PENDING\';',
    );
    expect(statusContractMigration).toContain(
      'ALTER TYPE "EstablishmentStatus" RENAME VALUE \'PAUSED\' TO \'BLOCKED\';',
    );
    expect(statusContractMigration).toContain(
      'ALTER TYPE "EstablishmentStatus" RENAME VALUE \'ARCHIVED\' TO \'INACTIVE\';',
    );
    expect(statusContractMigration).toContain(
      'ALTER TABLE "establishments" ALTER COLUMN "status" SET DEFAULT \'PENDING\'::"EstablishmentStatus";',
    );
    expect(statusContractMigration).not.toMatch(
      /DROP\s+TYPE\s+"EstablishmentStatus"/i,
    );
    expect(statusContractMigration).not.toMatch(
      /CREATE\s+TYPE\s+"EstablishmentStatus"/i,
    );
  });

  it("keeps establishment profile fields aligned with merchant operations", () => {
    const establishments = modelDefinition("Establishment");

    expect(establishments).toMatch(/logoUrl\s+String\?\s+@map\("logo_url"\)\s+@db\.Text/);
    expect(logoUrlMigration).toContain(
      'ALTER TABLE "establishments" ADD COLUMN "logo_url" TEXT;',
    );
  });

  it("stores only a hashed session token and indexes common auth lookups", () => {
    const sessions = tableDefinition("sessions");

    expect(sessions).toContain('"token_hash" TEXT NOT NULL');
    expect(sessions).not.toMatch(/"token"\s+TEXT/);
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");',
    );
    expect(migration).toContain(
      'CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");',
    );
    expect(migration).toContain(
      'CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");',
    );
  });

  it("uses PostgreSQL-native money/date types and required uniqueness/indexes", () => {
    expect(migration).toContain("DECIMAL(10,2)");
    expect(migration).toContain("TIMESTAMPTZ");
    expect(migration).toContain('"reference_month" DATE NOT NULL');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "categories_slug_type_key" ON "categories"("slug", "type");',
    );
    expect(migration).toContain(
      'CREATE INDEX "products_establishment_id_status_idx" ON "products"("establishment_id", "status");',
    );
    expect(migration).toContain(
      'CREATE INDEX "orders_establishment_id_status_idx" ON "orders"("establishment_id", "status");',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "monthly_billings_establishment_id_reference_month_key" ON "monthly_billings"("establishment_id", "reference_month");',
    );
  });
});
