import "dotenv/config";

import { randomUUID } from "node:crypto";

import {
  EstablishmentStatus,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/client";
import {
  createAuthServiceCore,
  type AuthServiceClient,
} from "../src/modules/auth/service-core";
import {
  createPrismaClient,
  formatSafeError,
  SeedStateError,
} from "../prisma/seed";

const SMOKE_AUTH_CONFIG = {
  authSecret: "s02-smoke-session-secret-0123456789",
  sessionCookieName: "s02_smoke_session",
  sessionMaxAgeDays: 1,
  sessionMaxAgeSeconds: 24 * 60 * 60,
  secureCookies: false,
};

async function verifyS02Auth() {
  const prisma = createPrismaClient();
  const auth = createAuthServiceCore({
    db: prisma as unknown as AuthServiceClient,
    config: SMOKE_AUTH_CONFIG,
    enums: {
      userRole: UserRole,
      userStatus: UserStatus,
      establishmentStatus: EstablishmentStatus,
    },
  });
  const issuedSessionTokens: string[] = [];

  try {
    const activeAdminCount = await prisma.user.count({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    if (activeAdminCount < 1) {
      throw new SeedStateError(
        `S02 auth smoke failed: expected at least one active admin, found ${activeAdminCount}.`,
      );
    }

    const adminLogin = await verifyAdminLoginIfSeedCredentialsExist(auth);
    const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const smokePassword = `Sextou-${runId}-Senha!42`;

    const customer = await auth.registerCustomer({
      name: "Smoke Cliente S02",
      email: `s02-customer-${runId}@example.invalid`,
      password: smokePassword,
      phone: "11999999999",
    });

    if (!customer.ok) {
      throw new SeedStateError(
        `S02 auth smoke failed: customer registration returned ${customer.code}.`,
      );
    }

    issuedSessionTokens.push(customer.data.sessionToken);

    const customerLookup = await auth.getSessionByToken(customer.data.sessionToken, {
      touchLastUsedAt: false,
    });

    if (!customerLookup.ok || customerLookup.data.user.role !== UserRole.CUSTOMER) {
      throw new SeedStateError(
        `S02 auth smoke failed: customer session lookup returned ${customerLookup.ok ? customerLookup.data.user.role : customerLookup.code}.`,
      );
    }

    const merchant = await auth.registerMerchant({
      name: "Smoke Comerciante S02",
      email: `s02-merchant-${runId}@example.invalid`,
      password: smokePassword,
      establishmentName: `Smoke Sextou S02 ${runId}`,
      establishmentPhone: "1133334444",
    });

    if (!merchant.ok) {
      throw new SeedStateError(
        `S02 auth smoke failed: merchant registration returned ${merchant.code}.`,
      );
    }

    issuedSessionTokens.push(merchant.data.sessionToken);

    const merchantLookup = await auth.getSessionByToken(merchant.data.sessionToken, {
      touchLastUsedAt: false,
    });

    if (!merchantLookup.ok || merchantLookup.data.user.role !== UserRole.MERCHANT) {
      throw new SeedStateError(
        `S02 auth smoke failed: merchant session lookup returned ${merchantLookup.ok ? merchantLookup.data.user.role : merchantLookup.code}.`,
      );
    }

    const pendingMerchantEstablishments = await prisma.establishment.count({
      where: {
        ownerId: merchant.data.user.id,
        status: EstablishmentStatus.PENDING,
      },
    });

    if (pendingMerchantEstablishments !== 1) {
      throw new SeedStateError(
        `S02 auth smoke failed: expected one pending merchant establishment, found ${pendingMerchantEstablishments}.`,
      );
    }

    const revokedCustomer = await auth.revokeSessionByToken(
      customer.data.sessionToken,
    );

    if (!revokedCustomer.ok) {
      throw new SeedStateError(
        `S02 auth smoke failed: customer logout returned ${revokedCustomer.code}.`,
      );
    }

    const revokedLookup = await auth.getSessionByToken(customer.data.sessionToken, {
      touchLastUsedAt: false,
    });

    if (revokedLookup.ok || revokedLookup.code !== "SESSION_REVOKED") {
      throw new SeedStateError(
        `S02 auth smoke failed: revoked customer lookup returned ${revokedLookup.ok ? "ACTIVE" : revokedLookup.code}.`,
      );
    }

    const revokedMerchant = await auth.revokeSessionByToken(
      merchant.data.sessionToken,
    );

    if (!revokedMerchant.ok) {
      throw new SeedStateError(
        `S02 auth smoke failed: merchant logout returned ${revokedMerchant.code}.`,
      );
    }

    const [customerSessionCount, merchantSessionCount, revokedSessionCount] =
      await Promise.all([
        prisma.session.count({ where: { userId: customer.data.user.id } }),
        prisma.session.count({ where: { userId: merchant.data.user.id } }),
        prisma.session.count({
          where: {
            userId: { in: [customer.data.user.id, merchant.data.user.id] },
            revokedAt: { not: null },
          },
        }),
      ]);

    console.info(
      `S02 auth smoke ok: activeAdmins=${activeAdminCount}; adminLogin=${adminLogin}; customerSessions=${customerSessionCount}; merchantSessions=${merchantSessionCount}; merchantPendingEstablishments=${pendingMerchantEstablishments}; revokedSmokeSessions=${revokedSessionCount}.`,
    );
  } finally {
    await revokeIssuedSessions(auth, issuedSessionTokens);
    await prisma.$disconnect();
  }
}

async function revokeIssuedSessions(
  auth: ReturnType<typeof createAuthServiceCore>,
  sessionTokens: string[],
) {
  for (const sessionToken of sessionTokens) {
    await auth.revokeSessionByToken(sessionToken);
  }
}

async function verifyAdminLoginIfSeedCredentialsExist(
  auth: ReturnType<typeof createAuthServiceCore>,
) {
  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL;
  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!seedAdminEmail || !seedAdminPassword) {
    return "skipped";
  }

  const login = await auth.login({
    email: seedAdminEmail,
    password: seedAdminPassword,
    next: "/admin",
  });

  if (!login.ok) {
    throw new SeedStateError(
      `S02 auth smoke failed: seeded admin login returned ${login.code}.`,
    );
  }

  if (login.data.user.role !== UserRole.ADMIN) {
    throw new SeedStateError(
      `S02 auth smoke failed: seeded admin login returned role ${login.data.user.role}.`,
    );
  }

  const logout = await auth.revokeSessionByToken(login.data.sessionToken);

  if (!logout.ok) {
    throw new SeedStateError(
      `S02 auth smoke failed: seeded admin logout returned ${logout.code}.`,
    );
  }

  return "checked";
}

verifyS02Auth().catch((error: unknown) => {
  console.error(`S02 auth smoke failed: ${formatSafeError(error)}`);
  process.exitCode = 1;
});
