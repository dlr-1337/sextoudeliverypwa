import "dotenv/config";

import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { slugify } from "../src/lib/slug";
import {
  CategoryType,
  PrismaClient,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/client";

const REQUIRED_SEED_ENV_KEYS = [
  "SEED_ADMIN_NAME",
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
] as const;

const SENSITIVE_ENV_KEY = /(DATABASE_URL|PASSWORD|SECRET|TOKEN|HASH)/i;
const ARGON2_HASH_PATTERN = /\$argon2id\$[^\s'"`]+/g;
const HASH_TIMEOUT_MS = 15_000;

export const BASE_CATEGORY_NAMES = [
  "Bebidas",
  "Petiscos",
  "Churrascos",
  "Outros",
] as const;

export class SeedConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedConfigError";
  }
}

export class SeedHashError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SeedHashError";
  }
}

export class SeedStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedStateError";
  }
}

export type SeedEnv = {
  adminName: string;
  adminEmail: string;
  adminPassword: string;
};

export type BaseCategoryPayload = {
  name: string;
  slug: string;
  type: CategoryType;
  displayOrder: number;
  isActive: true;
};

type SeedPrismaClient = Pick<PrismaClient, "$disconnect"> & {
  user: Pick<PrismaClient["user"], "upsert" | "count">;
  category: Pick<PrismaClient["category"], "upsert" | "count">;
};

type HashFunction = (
  password: string,
  options: { type: typeof argon2.argon2id },
) => Promise<string>;

const seedEnvSchema = z
  .object({
    SEED_ADMIN_NAME: z.string().trim().min(1, "cannot be blank"),
    SEED_ADMIN_EMAIL: z
      .string()
      .trim()
      .min(1, "cannot be blank")
      .email("must be a valid email address")
      .transform((email) => email.toLowerCase()),
    SEED_ADMIN_PASSWORD: z
      .string()
      .refine((value) => value.trim().length > 0, "cannot be blank"),
  })
  .transform((env) => ({
    adminName: env.SEED_ADMIN_NAME,
    adminEmail: env.SEED_ADMIN_EMAIL,
    adminPassword: env.SEED_ADMIN_PASSWORD,
  }));

function formatIssuePath(pathSegments: PropertyKey[]) {
  return pathSegments.length > 0 ? String(pathSegments[0]) : "seed environment";
}

export function parseSeedEnv(env: NodeJS.ProcessEnv): SeedEnv {
  const missingKeys = REQUIRED_SEED_ENV_KEYS.filter(
    (key) => env[key] === undefined,
  );

  if (missingKeys.length > 0) {
    throw new SeedConfigError(
      `Missing required seed environment variable(s): ${missingKeys.join(", ")}`,
    );
  }

  const parsed = seedEnvSchema.safeParse({
    SEED_ADMIN_NAME: env.SEED_ADMIN_NAME,
    SEED_ADMIN_EMAIL: env.SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: env.SEED_ADMIN_PASSWORD,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${formatIssuePath(issue.path)} ${issue.message}`)
      .join("; ");

    throw new SeedConfigError(
      `Invalid seed environment variable(s): ${issues}`,
    );
  }

  return parsed.data;
}

export function buildBaseCategoryPayloads(
  names: readonly string[] = BASE_CATEGORY_NAMES,
): BaseCategoryPayload[] {
  const payloads = [CategoryType.ESTABLISHMENT, CategoryType.PRODUCT].flatMap(
    (type) =>
      names.map((name, index) => {
        const normalizedName = name.trim();
        const slug = slugify(normalizedName, "");

        if (normalizedName.length === 0 || slug.length === 0) {
          throw new SeedConfigError(
            `Invalid base category name at index ${index}: name must contain letters or numbers.`,
          );
        }

        return {
          name: normalizedName,
          slug,
          type,
          displayOrder: index + 1,
          isActive: true as const,
        };
      }),
  );

  const uniqueKeys = new Set(payloads.map((payload) => categoryKey(payload)));

  if (uniqueKeys.size !== payloads.length) {
    throw new SeedConfigError(
      "Duplicate base category slug/type pairs were generated.",
    );
  }

  return payloads;
}

export async function hashAdminPassword(
  password: string,
  options: { hashFn?: HashFunction; timeoutMs?: number } = {},
) {
  const hashFn = options.hashFn ?? argon2.hash;
  const timeoutMs = options.timeoutMs ?? HASH_TIMEOUT_MS;

  try {
    return await withTimeout(
      hashFn(password, { type: argon2.argon2id }),
      timeoutMs,
      "Argon2id hashing timed out.",
    );
  } catch (error) {
    throw new SeedHashError(
      `Argon2id hashing failed (${getErrorClass(error)}).`,
      { cause: error },
    );
  }
}

export function createPrismaClient(env: NodeJS.ProcessEnv = process.env) {
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new SeedConfigError(
      "Missing required environment variable(s): DATABASE_URL",
    );
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });

  return new PrismaClient({ adapter });
}

export function redactSecrets(
  message: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  let redacted = message.replace(ARGON2_HASH_PATTERN, "[redacted:password_hash]");

  for (const [key, value] of Object.entries(env)) {
    if (!value || value.length < 3 || !SENSITIVE_ENV_KEY.test(key)) {
      continue;
    }

    redacted = redacted.split(value).join(`[redacted:${key}]`);
  }

  return redacted;
}

export function formatSafeError(
  error: unknown,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (error instanceof Error) {
    return `${error.name}: ${redactSecrets(error.message, env)}`;
  }

  return `Error: ${redactSecrets(String(error), env)}`;
}

export async function seedDatabase(
  prisma: SeedPrismaClient,
  seedEnv: SeedEnv,
) {
  const categoryPayloads = buildBaseCategoryPayloads();
  const passwordHash = await hashAdminPassword(seedEnv.adminPassword);

  await prisma.user.upsert({
    where: { email: seedEnv.adminEmail },
    create: {
      name: seedEnv.adminName,
      email: seedEnv.adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
    update: {
      name: seedEnv.adminName,
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
    select: {
      id: true,
      role: true,
      status: true,
    },
  });

  for (const category of categoryPayloads) {
    await prisma.category.upsert({
      where: {
        slug_type: {
          slug: category.slug,
          type: category.type,
        },
      },
      create: category,
      update: {
        name: category.name,
        displayOrder: category.displayOrder,
        isActive: true,
      },
      select: {
        id: true,
        slug: true,
        type: true,
      },
    });
  }

  const [activeAdminCount, baseCategoryCount] = await Promise.all([
    prisma.user.count({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    }),
    prisma.category.count({
      where: {
        isActive: true,
        OR: categoryPayloads.map((category) => ({
          slug: category.slug,
          type: category.type,
        })),
      },
    }),
  ]);

  if (activeAdminCount < 1) {
    throw new SeedStateError(
      "Seed verification failed: expected at least one active admin.",
    );
  }

  if (baseCategoryCount !== categoryPayloads.length) {
    throw new SeedStateError(
      `Seed verification failed: expected ${categoryPayloads.length} active base categories, found ${baseCategoryCount}.`,
    );
  }

  return {
    activeAdminCount,
    baseCategoryCount,
    expectedBaseCategoryCount: categoryPayloads.length,
  };
}

export async function runSeed(env: NodeJS.ProcessEnv = process.env) {
  const seedEnv = parseSeedEnv(env);
  const prisma = createPrismaClient(env);

  try {
    console.info("Seed started: validated admin seed environment.");
    const result = await seedDatabase(prisma, seedEnv);
    console.info(
      `Seed completed: activeAdmins=${result.activeAdminCount}; activeBaseCategories=${result.baseCategoryCount}/${result.expectedBaseCategoryCount}.`,
    );
    return result;
  } finally {
    await prisma.$disconnect();
  }
}

function categoryKey(payload: Pick<BaseCategoryPayload, "slug" | "type">) {
  return `${payload.type}:${payload.slug}`;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function getErrorClass(error: unknown) {
  if (error instanceof Error && error.name) {
    return error.name;
  }

  return "Error";
}

function isDirectExecution() {
  const entrypoint = process.argv[1];

  if (!entrypoint) {
    return false;
  }

  const currentFile = normalizePath(fileURLToPath(import.meta.url));
  const entrypointPath = normalizePath(entrypoint);

  return (
    currentFile === entrypointPath || entrypointPath.endsWith("/prisma/seed.ts")
  );
}

function normalizePath(value: string) {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}

if (isDirectExecution()) {
  runSeed().catch((error: unknown) => {
    console.error(`Seed failed: ${formatSafeError(error)}`);
    process.exitCode = 1;
  });
}
