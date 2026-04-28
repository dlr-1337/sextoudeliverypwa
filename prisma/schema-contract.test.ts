import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsRoot = projectPath("prisma", "migrations");

function projectPath(...segments: string[]) {
  return join(projectRoot, ...segments);
}

const schema = readFileSync(projectPath("prisma", "schema.prisma"), "utf8");
const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    name: entry.name,
    sql: readFileSync(join(migrationsRoot, entry.name, "migration.sql"), "utf8"),
  }))
  .sort((left, right) => left.name.localeCompare(right.name));
const migration = migrations.map(({ sql }) => sql).join("\n\n");
const statusContractMigration = migrationByName(
  "00000000000001_establishment_status_contract",
);
const logoUrlMigration = migrationByName("00000000000002_establishment_logo_url");
const orderPaymentContractMigration = migrationByName(
  "00000000000003_order_payment_contract",
);
const orderRejectedStatusMigration = migrationByName(
  "00000000000004_order_rejected_status",
);
const paymentCheckoutUrlMigration = migrationByName(
  "00000000000005_payment_checkout_url",
);
const dbClient = readFileSync(projectPath("src", "server", "db.ts"), "utf8");
const prismaConfig = readFileSync(projectPath("prisma.config.ts"), "utf8");
const generatedClient = readFileSync(
  projectPath("src", "generated", "prisma", "client.ts"),
  "utf8",
);
const generatedEnums = readFileSync(
  projectPath("src", "generated", "prisma", "enums.ts"),
  "utf8",
);
const generatedOrder = readFileSync(
  projectPath("src", "generated", "prisma", "models", "Order.ts"),
  "utf8",
);
const generatedPayment = readFileSync(
  projectPath("src", "generated", "prisma", "models", "Payment.ts"),
  "utf8",
);
const generatedClientClass = readFileSync(
  projectPath("src", "generated", "prisma", "internal", "class.ts"),
  "utf8",
);
const generatedPrismaNamespace = readFileSync(
  projectPath("src", "generated", "prisma", "internal", "prismaNamespace.ts"),
  "utf8",
);
const generatedModels = readFileSync(
  projectPath("src", "generated", "prisma", "models.ts"),
  "utf8",
);
const packageJson = JSON.parse(readFileSync(projectPath("package.json"), "utf8")) as {
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

function migrationByName(name: string) {
  return migrations.find((candidate) => candidate.name === name)?.sql ?? "";
}

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

function envWithoutDatabaseUrl() {
  const env = { ...process.env };
  env.DATABASE_URL = "";

  return env;
}

describe("Prisma database foundation contract", () => {
  it("loads every migration in sorted order for drift-sensitive contract checks", () => {
    const migrationNames = migrations.map(({ name }) => name);

    expect(migrationNames).toEqual([...migrationNames].sort());
    expect(migrationNames).toContain("00000000000000_init");
    expect(migrationNames).toContain(
      "00000000000001_establishment_status_contract",
    );
    expect(migrationNames).toContain("00000000000002_establishment_logo_url");
    expect(migrationNames).toContain("00000000000003_order_payment_contract");
    expect(migrationNames).toContain("00000000000004_order_rejected_status");
    expect(migrationNames).toContain("00000000000005_payment_checkout_url");
    expect(orderPaymentContractMigration).toContain(
      "-- S01 order/payment contract",
    );
    for (const { name, sql } of migrations) {
      if (name !== "00000000000005_payment_checkout_url") {
        expect(sql, `${name} should not be edited for checkoutUrl`).not.toContain(
          "checkout_url",
        );
      }
    }
  });

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
    expect(generatedClient).toContain("export const PrismaClient");
  });

  it("keeps DB-mutating scripts behind a secret-safe DATABASE_URL preflight", () => {
    expect(prismaConfig).toContain('import "dotenv/config";');
    expect(prismaConfig).toContain('seed: "tsx prisma/seed.ts"');
    expect(prismaConfig).toContain('env("DATABASE_URL")');
    expect(prismaConfig).toContain("schemaOnlyPlaceholderUrl");
    expect(packageJson.scripts["db:generate"]).toBe("prisma generate");
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

  it("fails the db:deploy preflight before Prisma when DATABASE_URL is missing without leaking secrets", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/require-env.mjs", "DATABASE_URL"],
      {
        cwd: projectRoot,
        encoding: "utf8",
        env: envWithoutDatabaseUrl(),
      },
    );
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();

    expect(result.status).not.toBe(0);
    expect(output).toBe("Missing required environment variable(s): DATABASE_URL");
    expect(output).not.toMatch(/postgres(?:ql)?:\/\//i);
    expect(output).not.toMatch(/prisma/i);
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

  it("evolves order and payment enums through rename/additive-compatible migration SQL", () => {
    expect(enumValues("OrderStatus")).toEqual([
      "DRAFT",
      "PENDING",
      "ACCEPTED",
      "PREPARING",
      "READY_FOR_PICKUP",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "REJECTED",
      "CANCELED",
    ]);
    expect(enumValues("OrderStatus")).not.toContain("PLACED");
    expect(enumValues("PaymentMethod")).toEqual(["CASH", "PIX", "CARD", "FAKE"]);
    expect(enumValues("PaymentStatus")).toEqual([
      "PENDING",
      "MANUAL_CASH_ON_DELIVERY",
      "AUTHORIZED",
      "PAID",
      "FAILED",
      "REFUNDED",
      "CANCELED",
    ]);

    expect(orderPaymentContractMigration).toContain(
      'ALTER TYPE "OrderStatus" RENAME VALUE \'PLACED\' TO \'PENDING\';',
    );
    expect(orderPaymentContractMigration).toContain(
      'ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS \'MANUAL_CASH_ON_DELIVERY\';',
    );
    expect(orderRejectedStatusMigration).toContain(
      'ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS \'REJECTED\' AFTER \'DELIVERED\';',
    );
    expect(orderRejectedStatusMigration).not.toMatch(/DROP\s+TYPE\s+"OrderStatus"/i);
    expect(orderRejectedStatusMigration).not.toMatch(/CREATE\s+TYPE\s+"OrderStatus"/i);
    expect(orderPaymentContractMigration).not.toMatch(/DROP\s+TYPE\s+"OrderStatus"/i);
    expect(orderPaymentContractMigration).not.toMatch(/DROP\s+TYPE\s+"PaymentMethod"/i);
    expect(orderPaymentContractMigration).not.toMatch(/DROP\s+TYPE\s+"PaymentStatus"/i);
  });

  it("exposes public order code, required customer relation, detailed delivery and order payment summaries", () => {
    const orders = modelDefinition("Order");

    expect(orders).toMatch(/publicCode\s+String\s+@unique\s+@map\("public_code"\)\s+@db\.Text/);
    expect(orders).not.toMatch(/\n\s+code\s+String/);
    expect(orders).toMatch(/customerId\s+String\s+@map\("customer_id"\)\s+@db\.Text/);
    expect(orders).toMatch(
      /customer\s+User\s+@relation\("CustomerOrders", fields: \[customerId\], references: \[id\], onDelete: Restrict\)/,
    );

    for (const field of [
      /deliveryStreet\s+String\s+@map\("delivery_street"\)\s+@db\.Text/,
      /deliveryNumber\s+String\s+@map\("delivery_number"\)\s+@db\.Text/,
      /deliveryComplement\s+String\?\s+@map\("delivery_complement"\)\s+@db\.Text/,
      /deliveryNeighborhood\s+String\s+@map\("delivery_neighborhood"\)\s+@db\.Text/,
      /deliveryCity\s+String\s+@map\("delivery_city"\)\s+@db\.Text/,
      /deliveryState\s+String\s+@map\("delivery_state"\)\s+@db\.Text/,
      /deliveryPostalCode\s+String\s+@map\("delivery_postal_code"\)\s+@db\.Text/,
      /deliveryReference\s+String\?\s+@map\("delivery_reference"\)\s+@db\.Text/,
      /generalObservation\s+String\?\s+@map\("general_observation"\)\s+@db\.Text/,
      /paymentMethod\s+PaymentMethod\s+@map\("payment_method"\)/,
      /paymentStatus\s+PaymentStatus\s+@map\("payment_status"\)/,
    ]) {
      expect(orders).toMatch(field);
    }

    expect(orders).toContain("@@index([paymentStatus])");
    expect(orders).toContain("@@index([establishmentId, paymentStatus])");
    expect(orderPaymentContractMigration).toContain(
      'ALTER TABLE "orders" RENAME COLUMN "code" TO "public_code";',
    );
    expect(orderPaymentContractMigration).toContain(
      'ALTER INDEX "orders_code_key" RENAME TO "orders_public_code_key";',
    );
    expect(orderPaymentContractMigration).toContain(
      'ALTER TABLE "orders" ALTER COLUMN "customer_id" SET NOT NULL;',
    );
    expect(orderPaymentContractMigration).toContain(
      'ON DELETE RESTRICT ON UPDATE CASCADE;',
    );

    for (const requiredColumn of [
      '"delivery_street" TEXT NOT NULL',
      '"delivery_number" TEXT NOT NULL',
      '"delivery_neighborhood" TEXT NOT NULL',
      '"delivery_city" TEXT NOT NULL',
      '"delivery_state" TEXT NOT NULL',
      '"delivery_postal_code" TEXT NOT NULL',
      '"payment_method" "PaymentMethod" NOT NULL',
      '"payment_status" "PaymentStatus" NOT NULL',
    ]) {
      expect(orderPaymentContractMigration).toContain(requiredColumn);
      expect(orderPaymentContractMigration).not.toContain(`${requiredColumn} DEFAULT`);
    }

    expect(migration).toContain(
      'CREATE INDEX "orders_payment_status_idx" ON "orders"("payment_status");',
    );
    expect(migration).toContain(
      'CREATE INDEX "orders_establishment_id_payment_status_idx" ON "orders"("establishment_id", "payment_status");',
    );
  });

  it("exposes provider, PIX and card-ready payment fields plus payment status/provider indexes", () => {
    const payments = modelDefinition("Payment");

    for (const field of [
      /provider\s+String\?\s+@db\.Text/,
      /providerPaymentId\s+String\?\s+@unique\s+@map\("provider_payment_id"\)\s+@db\.Text/,
      /providerStatus\s+String\?\s+@map\("provider_status"\)\s+@db\.Text/,
      /providerPayload\s+Json\?\s+@map\("provider_payload"\)\s+@db\.JsonB/,
      /checkoutUrl\s+String\?\s+@map\("checkout_url"\)\s+@db\.Text/,
      /pixQrCode\s+String\?\s+@map\("pix_qr_code"\)\s+@db\.Text/,
      /pixCopyPaste\s+String\?\s+@map\("pix_copy_paste"\)\s+@db\.Text/,
      /pixExpiresAt\s+DateTime\?\s+@map\("pix_expires_at"\)\s+@db\.Timestamptz/,
      /cardBrand\s+String\?\s+@map\("card_brand"\)\s+@db\.Text/,
      /cardLast4\s+String\?\s+@map\("card_last4"\)\s+@db\.Text/,
    ]) {
      expect(payments).toMatch(field);
    }

    expect(payments).toContain("@@index([status, provider])");
    expect(payments).toContain("@@index([provider])");
    expect(paymentCheckoutUrlMigration).toContain(
      'ALTER TABLE "payments" ADD COLUMN "checkout_url" TEXT;',
    );
    expect(paymentCheckoutUrlMigration).not.toMatch(/DROP\s+(?:TABLE|COLUMN)/i);
    expect(paymentCheckoutUrlMigration).not.toMatch(/CREATE\s+TABLE/i);
    expect(migration).toContain(
      'CREATE INDEX "payments_status_provider_idx" ON "payments"("status", "provider");',
    );
    expect(migration).toContain(
      'CREATE INDEX "payments_provider_idx" ON "payments"("provider");',
    );
  });

  it("regenerates Prisma client exports for the order/payment contract", () => {
    for (const expected of [
      "PENDING: 'PENDING'",
      "REJECTED: 'REJECTED'",
      "MANUAL_CASH_ON_DELIVERY: 'MANUAL_CASH_ON_DELIVERY'",
      "FAKE: 'FAKE'",
    ]) {
      expect(generatedEnums).toContain(expected);
    }
    expect(generatedClientClass).toContain("REJECTED\\n  CANCELED");
    expect(generatedEnums).not.toContain("PLACED: 'PLACED'");

    for (const expected of [
      "publicCode: string",
      "customerId: string",
      "deliveryStreet: string",
      "deliveryNumber: string",
      "deliveryNeighborhood: string",
      "deliveryCity: string",
      "deliveryState: string",
      "deliveryPostalCode: string",
      "generalObservation: string | null",
      "paymentMethod: $Enums.PaymentMethod",
      "paymentStatus: $Enums.PaymentStatus",
    ]) {
      expect(generatedOrder).toContain(expected);
    }
    expect(generatedOrder).not.toMatch(/^  code: string$/m);
    expect(generatedOrder).toMatch(/scalars:[\s\S]*customerId: string[\s\S]*paymentStatus: \$Enums\.PaymentStatus/);
    expect(generatedOrder).toMatch(
      /export type OrderCreateInput = \{[\s\S]*customer: Prisma\.UserCreateNestedOneWithoutCustomerOrdersInput/,
    );
    expect(generatedOrder).toMatch(
      /export type OrderUncheckedCreateInput = \{[\s\S]*customerId: string/,
    );

    for (const expected of [
      "providerStatus: string | null",
      "providerPayload: runtime.JsonValue | null",
      "checkoutUrl: string | null",
      "pixQrCode: string | null",
      "pixCopyPaste: string | null",
      "pixExpiresAt: Date | null",
      "cardBrand: string | null",
      "cardLast4: string | null",
    ]) {
      expect(generatedPayment).toContain(expected);
    }

    expect(generatedPrismaNamespace).toContain("checkoutUrl: 'checkoutUrl'");
    expect(generatedModels).toContain("export type * from './models/Payment'");
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
      'ALTER INDEX "orders_code_key" RENAME TO "orders_public_code_key";',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "monthly_billings_establishment_id_reference_month_key" ON "monthly_billings"("establishment_id", "reference_month");',
    );
  });
});
