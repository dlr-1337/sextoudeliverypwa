import { slugify as defaultSlugify } from "../../lib/slug";

import type { AuthConfig } from "./config";
import { getAuthConfig } from "./config";
import { AuthError, AUTH_ERROR_MESSAGES, isAuthError } from "./errors";
import { hashPassword, verifyPassword } from "./password";
import {
  generateSessionToken,
  hashSessionToken,
  isValidSessionToken,
} from "./session-token";
import {
  customerRegistrationSchema,
  formatAuthValidationErrors,
  loginSchema,
  merchantRegistrationSchema,
  resolveRoleRedirect,
} from "./schemas";
import type {
  AuthCustomerRegistrationSuccess,
  AuthEstablishment,
  AuthEstablishmentStatus,
  AuthFailure,
  AuthLoginSuccess,
  AuthMerchantRegistrationSuccess,
  AuthResult,
  AuthRole,
  AuthSession,
  AuthSessionContext,
  AuthUser,
  AuthUserStatus,
} from "./types";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  role: true,
  status: true,
  phone: true,
} as const;

const SESSION_SELECT = {
  id: true,
  userId: true,
  expiresAt: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

const SESSION_WITH_USER_INCLUDE = {
  user: {
    select: USER_SELECT,
  },
} as const;

const ESTABLISHMENT_SELECT = {
  id: true,
  ownerId: true,
  name: true,
  slug: true,
  status: true,
  phone: true,
} as const;

const DEFAULT_MAX_SLUG_ATTEMPTS = 10;

const DEFAULT_AUTH_ENUMS = {
  userRole: {
    ADMIN: "ADMIN",
    MERCHANT: "MERCHANT",
    CUSTOMER: "CUSTOMER",
  },
  userStatus: {
    ACTIVE: "ACTIVE",
    INVITED: "INVITED",
    SUSPENDED: "SUSPENDED",
  },
  establishmentStatus: {
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    BLOCKED: "BLOCKED",
    INACTIVE: "INACTIVE",
  },
} as const satisfies AuthServiceEnums;

export type AuthServiceEnums = {
  userRole: Record<"ADMIN" | "MERCHANT" | "CUSTOMER", AuthRole>;
  userStatus: Record<"ACTIVE" | "INVITED" | "SUSPENDED", AuthUserStatus>;
  establishmentStatus: Record<
    "PENDING" | "ACTIVE" | "BLOCKED" | "INACTIVE",
    AuthEstablishmentStatus
  >;
};

export type AuthSessionMetadata = {
  userAgent?: string | null;
  ipAddress?: string | null;
};

export type AuthSessionLookupOptions = {
  touchLastUsedAt?: boolean;
};

export type AuthDbUser = AuthUser & {
  passwordHash: string;
};

export type AuthDbSession = AuthSession;

export type AuthDbSessionWithUser = AuthDbSession & {
  user: AuthDbUser;
};

export type AuthDbEstablishment = AuthEstablishment;

export type AuthUserCreateData = {
  name: string;
  email: string;
  passwordHash: string;
  role: AuthRole;
  status: AuthUserStatus;
  phone?: string | null;
};

export type AuthSessionCreateData = {
  userId: string;
  tokenHash: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  expiresAt: Date;
};

export type AuthEstablishmentCreateData = {
  ownerId: string;
  name: string;
  slug: string;
  status: AuthEstablishmentStatus;
  phone?: string | null;
};

export type AuthTransactionClient = {
  user: {
    findUnique(args: {
      where: { email?: string; id?: string };
      select?: unknown;
    }): Promise<AuthDbUser | null>;
    create(args: {
      data: AuthUserCreateData;
      select?: unknown;
    }): Promise<AuthDbUser>;
  };
  session: {
    create(args: {
      data: AuthSessionCreateData;
      select?: unknown;
    }): Promise<AuthDbSession>;
    findUnique(args: {
      where: { tokenHash: string };
      include?: unknown;
      select?: unknown;
    }): Promise<AuthDbSessionWithUser | null>;
    update(args: {
      where: { id?: string; tokenHash?: string };
      data: { lastUsedAt?: Date; revokedAt?: Date };
      include?: unknown;
      select?: unknown;
    }): Promise<AuthDbSession | AuthDbSessionWithUser>;
  };
  establishment: {
    findUnique(args: {
      where: { slug: string };
      select?: unknown;
    }): Promise<Pick<AuthDbEstablishment, "id"> | null>;
    create(args: {
      data: AuthEstablishmentCreateData;
      select?: unknown;
    }): Promise<AuthDbEstablishment>;
  };
};

export type AuthServiceClient = AuthTransactionClient & {
  $transaction<T>(fn: (tx: AuthTransactionClient) => Promise<T>): Promise<T>;
};

export type AuthServiceCoreDependencies = {
  db: AuthServiceClient;
  config?: AuthConfig;
  enums?: AuthServiceEnums;
  hashPasswordFn?: typeof hashPassword;
  verifyPasswordFn?: typeof verifyPassword;
  generateSessionTokenFn?: typeof generateSessionToken;
  hashSessionTokenFn?: typeof hashSessionToken;
  now?: () => Date;
  slugifyFn?: typeof defaultSlugify;
  maxSlugAttempts?: number;
};

export function createAuthServiceCore(dependencies: AuthServiceCoreDependencies) {
  const db = dependencies.db;
  const enums = dependencies.enums ?? DEFAULT_AUTH_ENUMS;
  const hashPasswordFn = dependencies.hashPasswordFn ?? hashPassword;
  const verifyPasswordFn = dependencies.verifyPasswordFn ?? verifyPassword;
  const generateSessionTokenFn =
    dependencies.generateSessionTokenFn ?? generateSessionToken;
  const hashSessionTokenFn = dependencies.hashSessionTokenFn ?? hashSessionToken;
  const now = dependencies.now ?? (() => new Date());
  const slugifyFn = dependencies.slugifyFn ?? defaultSlugify;
  const maxSlugAttempts =
    dependencies.maxSlugAttempts ?? DEFAULT_MAX_SLUG_ATTEMPTS;

  function resolveConfig() {
    return dependencies.config ?? getAuthConfig();
  }

  async function login(
    input: unknown,
    metadata: AuthSessionMetadata = {},
  ): Promise<AuthResult<AuthLoginSuccess>> {
    const parsed = loginSchema.safeParse(input);

    if (!parsed.success) {
      return authFailure("VALIDATION_FAILED", {
        validationErrors: formatAuthValidationErrors(parsed.error),
      });
    }

    let user: AuthDbUser | null;

    try {
      user = await db.user.findUnique({
        where: { email: parsed.data.email },
        select: USER_SELECT,
      });
    } catch (error) {
      return authFailureFromError(error);
    }

    if (!user) {
      return authFailure("INVALID_CREDENTIALS");
    }

    let passwordMatches = false;

    try {
      passwordMatches = await verifyPasswordFn(
        user.passwordHash,
        parsed.data.password,
      );
    } catch (error) {
      return authFailureFromError(error);
    }

    if (!passwordMatches) {
      return authFailure("INVALID_CREDENTIALS");
    }

    if (!isActiveUser(user)) {
      return authFailure("INACTIVE_USER");
    }

    try {
      const session = await createSessionRecord(db, user.id, metadata);

      return authSuccess({
        session: toAuthSession(session.session),
        sessionToken: session.sessionToken,
        user: toAuthUser(user),
        redirectTo: resolveRoleRedirect(parsed.data.next, user.role),
      });
    } catch (error) {
      return authFailureFromError(error);
    }
  }

  async function registerCustomer(
    input: unknown,
    metadata: AuthSessionMetadata = {},
  ): Promise<AuthResult<AuthCustomerRegistrationSuccess>> {
    const parsed = customerRegistrationSchema.safeParse(input);

    if (!parsed.success) {
      return authFailure("VALIDATION_FAILED", {
        validationErrors: formatAuthValidationErrors(parsed.error),
      });
    }

    const available = await ensureEmailAvailable(parsed.data.email);

    if (!available.ok) {
      return available;
    }

    const passwordHashResult = await safeHashPassword(parsed.data.password);

    if (!passwordHashResult.ok) {
      return passwordHashResult;
    }

    try {
      const registered = await db.$transaction(async (tx) => {
        await assertEmailAvailableInTransaction(tx, parsed.data.email);

        const user = await tx.user.create({
          data: {
            name: parsed.data.name,
            email: parsed.data.email,
            passwordHash: passwordHashResult.data,
            role: enums.userRole.CUSTOMER,
            status: enums.userStatus.ACTIVE,
            phone: parsed.data.phone ?? null,
          },
          select: USER_SELECT,
        });
        const session = await createSessionRecord(tx, user.id, metadata);

        return { session, user };
      });

      return authSuccess({
        session: toAuthSession(registered.session.session),
        sessionToken: registered.session.sessionToken,
        user: toAuthUser(registered.user),
        redirectTo: "/conta",
      });
    } catch (error) {
      return authFailureFromError(error);
    }
  }

  async function registerMerchant(
    input: unknown,
    metadata: AuthSessionMetadata = {},
  ): Promise<AuthResult<AuthMerchantRegistrationSuccess>> {
    const parsed = merchantRegistrationSchema.safeParse(input);

    if (!parsed.success) {
      return authFailure("VALIDATION_FAILED", {
        validationErrors: formatAuthValidationErrors(parsed.error),
      });
    }

    const available = await ensureEmailAvailable(parsed.data.email);

    if (!available.ok) {
      return available;
    }

    const passwordHashResult = await safeHashPassword(parsed.data.password);

    if (!passwordHashResult.ok) {
      return passwordHashResult;
    }

    try {
      const registered = await db.$transaction(async (tx) => {
        await assertEmailAvailableInTransaction(tx, parsed.data.email);

        const user = await tx.user.create({
          data: {
            name: parsed.data.name,
            email: parsed.data.email,
            passwordHash: passwordHashResult.data,
            role: enums.userRole.MERCHANT,
            status: enums.userStatus.ACTIVE,
            phone: parsed.data.phone ?? null,
          },
          select: USER_SELECT,
        });
        const slug = await generateUniqueEstablishmentSlug(
          tx,
          parsed.data.establishmentName,
        );
        const establishment = await tx.establishment.create({
          data: {
            ownerId: user.id,
            name: parsed.data.establishmentName,
            slug,
            status: enums.establishmentStatus.PENDING,
            phone: parsed.data.establishmentPhone ?? null,
          },
          select: ESTABLISHMENT_SELECT,
        });
        const session = await createSessionRecord(tx, user.id, metadata);

        return { establishment, session, user };
      });

      return authSuccess({
        establishment: toAuthEstablishment(registered.establishment),
        session: toAuthSession(registered.session.session),
        sessionToken: registered.session.sessionToken,
        user: toAuthUser(registered.user),
        redirectTo: "/estabelecimento",
      });
    } catch (error) {
      return authFailureFromError(error);
    }
  }

  async function getSessionByToken(
    rawToken: unknown,
    options: AuthSessionLookupOptions = {},
  ): Promise<AuthResult<AuthSessionContext>> {
    if (!isValidSessionToken(rawToken)) {
      return authFailure("TOKEN_INVALID");
    }

    let tokenHash: string;

    try {
      tokenHash = hashSessionTokenFn(rawToken, {
        authSecret: resolveConfig().authSecret,
      });
    } catch (error) {
      return authFailureFromError(error);
    }

    let session: AuthDbSessionWithUser | null;

    try {
      session = await db.session.findUnique({
        where: { tokenHash },
        include: SESSION_WITH_USER_INCLUDE,
      });
    } catch (error) {
      return authFailureFromError(error);
    }

    if (!session) {
      return authFailure("TOKEN_INVALID");
    }

    const rejectionCode = getSessionRejectionCode(session, now());

    if (rejectionCode) {
      return authFailure(rejectionCode);
    }

    let currentSession = session;

    if (options.touchLastUsedAt !== false) {
      const touchedAt = now();

      try {
        const updated = await db.session.update({
          where: { id: session.id },
          data: { lastUsedAt: touchedAt },
          include: SESSION_WITH_USER_INCLUDE,
        });

        currentSession = hasUserRelation(updated)
          ? updated
          : { ...session, lastUsedAt: touchedAt };
      } catch (error) {
        return authFailureFromError(error);
      }
    }

    return authSuccess({
      session: toAuthSession(currentSession),
      user: toAuthUser(currentSession.user),
    });
  }

  async function revokeSessionByToken(
    rawToken: unknown,
  ): Promise<AuthResult<AuthSession>> {
    if (!isValidSessionToken(rawToken)) {
      return authFailure("TOKEN_INVALID");
    }

    let tokenHash: string;

    try {
      tokenHash = hashSessionTokenFn(rawToken, {
        authSecret: resolveConfig().authSecret,
      });
    } catch (error) {
      return authFailureFromError(error);
    }

    try {
      const session = await db.session.update({
        where: { tokenHash },
        data: { revokedAt: now() },
        select: SESSION_SELECT,
      });

      return authSuccess(toAuthSession(session));
    } catch (error) {
      if (isRecord(error) && error.code === "P2025") {
        return authFailure("TOKEN_INVALID");
      }

      return authFailureFromError(error);
    }
  }

  async function ensureEmailAvailable(
    email: string,
  ): Promise<AuthResult<true>> {
    try {
      const existing = await db.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existing) {
        return authFailure("DUPLICATE_EMAIL");
      }

      return authSuccess(true);
    } catch (error) {
      return authFailureFromError(error);
    }
  }

  async function assertEmailAvailableInTransaction(
    tx: AuthTransactionClient,
    email: string,
  ) {
    const existing = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      throw new AuthError("DUPLICATE_EMAIL", "Duplicate e-mail.");
    }
  }

  async function safeHashPassword(
    password: string,
  ): Promise<AuthResult<string>> {
    try {
      return authSuccess(await hashPasswordFn(password));
    } catch (error) {
      return authFailureFromError(error);
    }
  }

  async function createSessionRecord(
    client: AuthTransactionClient,
    userId: string,
    metadata: AuthSessionMetadata,
  ) {
    const sessionToken = generateSessionTokenFn();
    const tokenHash = hashSessionTokenFn(sessionToken, {
      authSecret: resolveConfig().authSecret,
    });
    const issuedAt = now();
    const expiresAt = new Date(
      issuedAt.getTime() + resolveConfig().sessionMaxAgeSeconds * 1000,
    );
    const session = await client.session.create({
      data: {
        userId,
        tokenHash,
        userAgent: metadata.userAgent ?? null,
        ipAddress: metadata.ipAddress ?? null,
        expiresAt,
      },
      select: SESSION_SELECT,
    });

    return { session, sessionToken };
  }

  async function generateUniqueEstablishmentSlug(
    tx: AuthTransactionClient,
    establishmentName: string,
  ) {
    const baseSlug = slugifyFn(establishmentName, "estabelecimento");

    for (let attempt = 0; attempt < maxSlugAttempts; attempt += 1) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      const existing = await tx.establishment.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!existing) {
        return slug;
      }
    }

    throw new AuthError(
      "DATABASE_ERROR",
      "Não foi possível gerar um slug único para o estabelecimento.",
    );
  }

  return {
    getSessionByToken,
    login,
    registerCustomer,
    registerMerchant,
    revokeSessionByToken,
  };
}

export type AuthServiceCore = ReturnType<typeof createAuthServiceCore>;

function authSuccess<TData>(data: TData): AuthResult<TData> {
  return { ok: true, data };
}

function authFailure(
  code: AuthFailure["code"],
  options: Pick<AuthFailure, "validationErrors"> = {},
): AuthFailure {
  return {
    ok: false,
    code,
    message: AUTH_ERROR_MESSAGES[code],
    ...options,
  };
}

function authFailureFromError(error: unknown): AuthFailure {
  if (isAuthError(error)) {
    return authFailure(error.code);
  }

  if (isUniqueConstraintError(error) && errorTargetsField(error, "email")) {
    return authFailure("DUPLICATE_EMAIL");
  }

  return authFailure("DATABASE_ERROR");
}

function getSessionRejectionCode(
  session: AuthDbSessionWithUser,
  currentTime: Date,
): AuthFailure["code"] | undefined {
  if (session.revokedAt) {
    return "SESSION_REVOKED";
  }

  if (session.expiresAt.getTime() <= currentTime.getTime()) {
    return "SESSION_EXPIRED";
  }

  if (!isActiveUser(session.user)) {
    return "INACTIVE_USER";
  }

  return undefined;
}

function isActiveUser(user: Pick<AuthDbUser, "status">) {
  return user.status === "ACTIVE";
}

function toAuthUser(user: AuthDbUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    phone: user.phone ?? null,
  };
}

function toAuthSession(session: AuthDbSession): AuthSession {
  return {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
    lastUsedAt: session.lastUsedAt ?? null,
    revokedAt: session.revokedAt ?? null,
    createdAt: session.createdAt,
  };
}

function toAuthEstablishment(
  establishment: AuthDbEstablishment,
): AuthEstablishment {
  return {
    id: establishment.id,
    ownerId: establishment.ownerId,
    name: establishment.name,
    slug: establishment.slug,
    status: establishment.status,
    phone: establishment.phone ?? null,
  };
}

function hasUserRelation(
  session: AuthDbSession | AuthDbSessionWithUser,
): session is AuthDbSessionWithUser {
  return "user" in session && Boolean(session.user);
}

function isUniqueConstraintError(error: unknown) {
  return isRecord(error) && error.code === "P2002";
}

function errorTargetsField(error: unknown, field: string) {
  if (!isRecord(error)) {
    return false;
  }

  const meta = error.meta;

  if (!isRecord(meta)) {
    return false;
  }

  const target = meta.target;

  if (Array.isArray(target)) {
    return target.some((value) => String(value).includes(field));
  }

  return typeof target === "string" && target.includes(field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
