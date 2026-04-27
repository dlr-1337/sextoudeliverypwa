import "dotenv/config";

import { UserRole, UserStatus } from "../src/generated/prisma/client";
import {
  buildBaseCategoryPayloads,
  createPrismaClient,
  formatSafeError,
  SeedStateError,
} from "../prisma/seed";

async function verifyS01Db() {
  const prisma = createPrismaClient();
  const expectedCategories = buildBaseCategoryPayloads();

  try {
    const [activeAdminCount, activeBaseCategories] = await Promise.all([
      prisma.user.count({
        where: {
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        },
      }),
      prisma.category.findMany({
        where: {
          isActive: true,
          OR: expectedCategories.map((category) => ({
            slug: category.slug,
            type: category.type,
          })),
        },
        select: {
          slug: true,
          type: true,
        },
      }),
    ]);

    const observedCategoryKeys = new Set(
      activeBaseCategories.map((category) => `${category.type}:${category.slug}`),
    );
    const missingCategories = expectedCategories.filter(
      (category) => !observedCategoryKeys.has(`${category.type}:${category.slug}`),
    );

    if (activeAdminCount < 1) {
      throw new SeedStateError(
        `S01 DB smoke failed: expected at least one active admin, found ${activeAdminCount}.`,
      );
    }

    if (missingCategories.length > 0) {
      throw new SeedStateError(
        `S01 DB smoke failed: expected ${expectedCategories.length} active base categories, found ${observedCategoryKeys.size}; missing ${missingCategories
          .map((category) => `${category.type}:${category.slug}`)
          .join(", ")}.`,
      );
    }

    console.info(
      `S01 DB smoke ok: activeAdmins=${activeAdminCount}; activeBaseCategories=${observedCategoryKeys.size}/${expectedCategories.length}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

verifyS01Db().catch((error: unknown) => {
  console.error(`S01 DB smoke failed: ${formatSafeError(error)}`);
  process.exitCode = 1;
});
