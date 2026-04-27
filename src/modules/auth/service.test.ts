import { describe, expect, it } from "vitest";

import {
  createAuthServiceCore,
  type AuthDbEstablishment,
  type AuthDbSession,
  type AuthDbSessionWithUser,
  type AuthDbUser,
  type AuthServiceClient,
  type AuthTransactionClient,
} from "./service-core";
import type { AuthFailure, AuthResult } from "./types";

const NOW = new Date("2026-04-26T21:30:00.000Z");
const AUTH_CONFIG = {
  authSecret: "0123456789abcdef0123456789abcdef",
  sessionCookieName: "sextou_session",
  sessionMaxAgeDays: 30,
  sessionMaxAgeSeconds: 30 * 24 * 60 * 60,
  secureCookies: false,
};

function makeToken(character: string) {
  return character.repeat(43);
}

function fakeHashToken(rawToken: string) {
  return `hash:${rawToken.length}:${rawToken.charCodeAt(0)}`;
}

describe("auth service core", () => {
  it("returns generic invalid-login failures for missing users and bad passwords", async () => {
    const fakeDb = createFakeAuthDb({
      users: [buildUser({ email: "maria@example.com" })],
    });
    const service = createTestAuthService(fakeDb);

    expectFailure(
      await service.login({ email: "missing@example.com", password: "correct" }),
      "INVALID_CREDENTIALS",
    );
    expectFailure(
      await service.login({ email: "maria@example.com", password: "wrong" }),
      "INVALID_CREDENTIALS",
    );
  });

  it("rejects suspended users after password verification succeeds", async () => {
    const fakeDb = createFakeAuthDb({
      users: [
        buildUser({
          email: "blocked@example.com",
          status: "SUSPENDED",
        }),
      ],
    });
    const service = createTestAuthService(fakeDb);

    expectFailure(
      await service.login({ email: "blocked@example.com", password: "correct" }),
      "INACTIVE_USER",
    );
  });

  it("logs in active users with raw tokens only in the caller payload", async () => {
    const token = makeToken("a");
    const fakeDb = createFakeAuthDb({
      users: [buildUser({ email: "cliente@example.com" })],
    });
    const service = createTestAuthService(fakeDb, [token]);

    const result = expectOk(
      await service.login({
        email: " Cliente@Example.COM ",
        password: "correct",
        next: "/conta?tab=pedidos",
      }),
    );

    expect(result.sessionToken).toBe(token);
    expect(result.redirectTo).toBe("/conta?tab=pedidos");
    expect(result.user.email).toBe("cliente@example.com");
    expect(fakeDb.state.sessions).toHaveLength(1);
    expect(fakeDb.state.sessions[0]?.tokenHash).toBe(fakeHashToken(token));
    expect(fakeDb.state.sessions[0]?.tokenHash).not.toBe(token);
  });

  it("rejects duplicate customer e-mail and role/status injection attempts", async () => {
    const fakeDb = createFakeAuthDb({
      users: [buildUser({ email: "same@example.com" })],
    });
    const service = createTestAuthService(fakeDb, [makeToken("b")]);

    expectFailure(
      await service.registerCustomer({
        name: "Cliente Existente",
        email: " Same@Example.com ",
        password: "strong-password",
      }),
      "DUPLICATE_EMAIL",
    );

    const injected = expectFailure(
      await service.registerCustomer({
        name: "Cliente Novo",
        email: "novo@example.com",
        password: "strong-password",
        role: "ADMIN",
        status: "SUSPENDED",
      }),
      "VALIDATION_FAILED",
    );

    expect(injected.validationErrors?.fieldErrors.role).toContain(
      "Campo não permitido.",
    );
    expect(injected.validationErrors?.fieldErrors.status).toContain(
      "Campo não permitido.",
    );
  });

  it("hardcodes customer role/status and creates a session transactionally", async () => {
    const token = makeToken("c");
    const fakeDb = createFakeAuthDb();
    const service = createTestAuthService(fakeDb, [token]);

    const result = expectOk(
      await service.registerCustomer({
        name: "Maria Cliente",
        email: " MARIA@Example.com ",
        password: "strong-password",
        phone: "11999999999",
      }),
    );

    expect(result.user.role).toBe("CUSTOMER");
    expect(result.user.status).toBe("ACTIVE");
    expect(result.sessionToken).toBe(token);
    expect(fakeDb.state.users).toMatchObject([
      {
        email: "maria@example.com",
        role: "CUSTOMER",
        status: "ACTIVE",
        phone: "11999999999",
      },
    ]);
    expect(fakeDb.state.sessions).toHaveLength(1);
    expect(fakeDb.state.sessions[0]?.tokenHash).toBe(fakeHashToken(token));
  });

  it("hardcodes merchant role/status and creates one pending establishment with slug suffixing", async () => {
    const token = makeToken("d");
    const fakeDb = createFakeAuthDb({
      establishments: [
        buildEstablishment({
          id: "existing-establishment",
          ownerId: "other-user",
          name: "Sextou Bar",
          slug: "sextou-bar",
          status: "ACTIVE",
        }),
      ],
    });
    const service = createTestAuthService(fakeDb, [token]);

    const result = expectOk(
      await service.registerMerchant({
        name: "João Comerciante",
        email: "joao@example.com",
        password: "strong-password",
        establishmentName: "Sextou Bar",
        establishmentPhone: "1133334444",
      }),
    );

    expect(result.user.role).toBe("MERCHANT");
    expect(result.user.status).toBe("ACTIVE");
    expect(result.establishment).toMatchObject({
      ownerId: result.user.id,
      name: "Sextou Bar",
      slug: "sextou-bar-2",
      status: "PENDING",
      phone: "1133334444",
    });
    expect(fakeDb.state.establishments).toHaveLength(2);
    expect(
      fakeDb.state.establishments.filter(
        (establishment) => establishment.ownerId === result.user.id,
      ),
    ).toHaveLength(1);
    expect(fakeDb.state.sessions[0]?.tokenHash).toBe(fakeHashToken(token));
  });

  it("rolls back merchant user creation when establishment creation fails", async () => {
    const fakeDb = createFakeAuthDb({ failNextEstablishmentCreate: true });
    const service = createTestAuthService(fakeDb, [makeToken("e")]);

    expectFailure(
      await service.registerMerchant({
        name: "Comerciante Falho",
        email: "falho@example.com",
        password: "strong-password",
        establishmentName: "Falha Lanchonete",
      }),
      "DATABASE_ERROR",
    );

    expect(fakeDb.state.users).toHaveLength(0);
    expect(fakeDb.state.establishments).toHaveLength(0);
    expect(fakeDb.state.sessions).toHaveLength(0);
  });

  it("rejects expired sessions, revokes active sessions, and rejects revoked lookups", async () => {
    const token = makeToken("f");
    const expiredToken = makeToken("g");
    const user = buildUser({ id: "user-expirable", email: "sessao@example.com" });
    const fakeDb = createFakeAuthDb({
      users: [user],
      sessions: [
        buildSession({
          id: "expired-session",
          userId: user.id,
          tokenHash: fakeHashToken(expiredToken),
          expiresAt: new Date(NOW.getTime() - 1000),
        }),
        buildSession({
          id: "active-session",
          userId: user.id,
          tokenHash: fakeHashToken(token),
          expiresAt: new Date(NOW.getTime() + 1000),
        }),
      ],
    });
    const service = createTestAuthService(fakeDb);

    expectFailure(
      await service.getSessionByToken(expiredToken, { touchLastUsedAt: false }),
      "SESSION_EXPIRED",
    );

    expectOk(await service.getSessionByToken(token));
    expect(fakeDb.state.sessions[1]?.lastUsedAt).toEqual(NOW);
    expectOk(await service.revokeSessionByToken(token));
    expect(fakeDb.state.sessions[1]?.revokedAt).toEqual(NOW);
    expectFailure(
      await service.getSessionByToken(token, { touchLastUsedAt: false }),
      "SESSION_REVOKED",
    );
  });
});

type StoredSession = AuthDbSession & {
  tokenHash: string;
  userAgent: string | null;
  ipAddress: string | null;
};

type FakeState = {
  users: AuthDbUser[];
  sessions: StoredSession[];
  establishments: AuthDbEstablishment[];
  userSeq: number;
  sessionSeq: number;
  establishmentSeq: number;
  failNextEstablishmentCreate: boolean;
};

type FakeDb = AuthServiceClient & {
  state: FakeState;
};

function createTestAuthService(fakeDb: FakeDb, tokens: string[] = []) {
  const tokenQueue = [...tokens];

  return createAuthServiceCore({
    db: fakeDb,
    config: AUTH_CONFIG,
    now: () => NOW,
    generateSessionTokenFn: () => tokenQueue.shift() ?? makeToken("z"),
    hashSessionTokenFn: (rawToken) => fakeHashToken(rawToken),
    hashPasswordFn: async (password) => `hash:${password}`,
    verifyPasswordFn: async (passwordHash, password) =>
      passwordHash === `hash:${password}`,
  });
}

function createFakeAuthDb(
  initial: Partial<
    Pick<
      FakeState,
      "users" | "sessions" | "establishments" | "failNextEstablishmentCreate"
    >
  > = {},
): FakeDb {
  const state: FakeState = {
    users: initial.users ? initial.users.map(cloneUser) : [],
    sessions: initial.sessions ? initial.sessions.map(cloneSession) : [],
    establishments: initial.establishments
      ? initial.establishments.map(cloneEstablishment)
      : [],
    userSeq: initial.users?.length ?? 0,
    sessionSeq: initial.sessions?.length ?? 0,
    establishmentSeq: initial.establishments?.length ?? 0,
    failNextEstablishmentCreate: initial.failNextEstablishmentCreate ?? false,
  };
  const client = makeFakeClient(state) as FakeDb;

  client.state = state;

  return client;
}

function makeFakeClient(state: FakeState): AuthServiceClient {
  return {
    user: {
      async findUnique(args) {
        const found = state.users.find((user) => {
          if (args.where.email) {
            return user.email === args.where.email;
          }

          if (args.where.id) {
            return user.id === args.where.id;
          }

          return false;
        });

        return found ? cloneUser(found) : null;
      },
      async create(args) {
        if (state.users.some((user) => user.email === args.data.email)) {
          throw uniqueConstraint(["email"]);
        }

        const user = buildUser({
          ...args.data,
          id: `user-${state.userSeq + 1}`,
        });

        state.userSeq += 1;
        state.users.push(user);

        return cloneUser(user);
      },
    },
    session: {
      async create(args) {
        if (
          state.sessions.some(
            (session) => session.tokenHash === args.data.tokenHash,
          )
        ) {
          throw uniqueConstraint(["tokenHash"]);
        }

        const session = buildSession({
          ...args.data,
          id: `session-${state.sessionSeq + 1}`,
          createdAt: NOW,
          ipAddress: args.data.ipAddress ?? null,
          lastUsedAt: null,
          revokedAt: null,
          userAgent: args.data.userAgent ?? null,
        });

        state.sessionSeq += 1;
        state.sessions.push(session);

        return toDbSession(session);
      },
      async findUnique(args) {
        const session = state.sessions.find(
          (candidate) => candidate.tokenHash === args.where.tokenHash,
        );

        if (!session) {
          return null;
        }

        return withUser(state, session);
      },
      async update(args) {
        const session = state.sessions.find((candidate) => {
          if (args.where.id) {
            return candidate.id === args.where.id;
          }

          if (args.where.tokenHash) {
            return candidate.tokenHash === args.where.tokenHash;
          }

          return false;
        });

        if (!session) {
          throw notFound();
        }

        if (args.data.lastUsedAt !== undefined) {
          session.lastUsedAt = args.data.lastUsedAt;
        }

        if (args.data.revokedAt !== undefined) {
          session.revokedAt = args.data.revokedAt;
        }

        return args.include ? withUser(state, session) : toDbSession(session);
      },
    },
    establishment: {
      async findUnique(args) {
        const found = state.establishments.find(
          (establishment) => establishment.slug === args.where.slug,
        );

        return found ? { id: found.id } : null;
      },
      async create(args) {
        if (state.failNextEstablishmentCreate) {
          state.failNextEstablishmentCreate = false;
          throw new Error("simulated establishment write failure");
        }

        if (
          state.establishments.some(
            (establishment) => establishment.slug === args.data.slug,
          )
        ) {
          throw uniqueConstraint(["slug"]);
        }

        const establishment = buildEstablishment({
          ...args.data,
          id: `establishment-${state.establishmentSeq + 1}`,
        });

        state.establishmentSeq += 1;
        state.establishments.push(establishment);

        return cloneEstablishment(establishment);
      },
    },
    async $transaction<T>(fn: (tx: AuthTransactionClient) => Promise<T>) {
      const snapshot = cloneState(state);

      try {
        return await fn(makeFakeClient(state));
      } catch (error) {
        restoreState(state, snapshot);
        throw error;
      }
    },
  };
}

function buildUser(overrides: Partial<AuthDbUser> = {}): AuthDbUser {
  return {
    id: "user-1",
    name: "Maria Cliente",
    email: "maria@example.com",
    passwordHash: "hash:correct",
    role: "CUSTOMER",
    status: "ACTIVE",
    phone: null,
    ...overrides,
  };
}

function buildSession(
  overrides: Partial<StoredSession> & Pick<StoredSession, "tokenHash" | "userId">,
): StoredSession {
  return {
    id: "session-1",
    userId: overrides.userId,
    tokenHash: overrides.tokenHash,
    expiresAt: new Date(NOW.getTime() + AUTH_CONFIG.sessionMaxAgeSeconds * 1000),
    lastUsedAt: null,
    revokedAt: null,
    createdAt: NOW,
    userAgent: null,
    ipAddress: null,
    ...overrides,
  };
}

function buildEstablishment(
  overrides: Partial<AuthDbEstablishment> = {},
): AuthDbEstablishment {
  return {
    id: "establishment-1",
    ownerId: "user-1",
    name: "Sextou Bar",
    slug: "sextou-bar",
    status: "PENDING",
    phone: null,
    ...overrides,
  };
}

function withUser(
  state: FakeState,
  session: StoredSession,
): AuthDbSessionWithUser {
  const user = state.users.find((candidate) => candidate.id === session.userId);

  if (!user) {
    throw new Error("fake session without user");
  }

  return {
    ...toDbSession(session),
    user: cloneUser(user),
  };
}

function toDbSession(session: StoredSession): AuthDbSession {
  return {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
    lastUsedAt: session.lastUsedAt,
    revokedAt: session.revokedAt,
    createdAt: session.createdAt,
  };
}

function uniqueConstraint(target: string[]) {
  return Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
    meta: { target },
  });
}

function notFound() {
  return Object.assign(new Error("Record not found"), { code: "P2025" });
}

function cloneState(state: FakeState): FakeState {
  return {
    users: state.users.map(cloneUser),
    sessions: state.sessions.map(cloneSession),
    establishments: state.establishments.map(cloneEstablishment),
    userSeq: state.userSeq,
    sessionSeq: state.sessionSeq,
    establishmentSeq: state.establishmentSeq,
    failNextEstablishmentCreate: state.failNextEstablishmentCreate,
  };
}

function restoreState(state: FakeState, snapshot: FakeState) {
  state.users = snapshot.users.map(cloneUser);
  state.sessions = snapshot.sessions.map(cloneSession);
  state.establishments = snapshot.establishments.map(cloneEstablishment);
  state.userSeq = snapshot.userSeq;
  state.sessionSeq = snapshot.sessionSeq;
  state.establishmentSeq = snapshot.establishmentSeq;
  state.failNextEstablishmentCreate = snapshot.failNextEstablishmentCreate;
}

function cloneUser(user: AuthDbUser): AuthDbUser {
  return { ...user };
}

function cloneSession(session: StoredSession): StoredSession {
  return {
    ...session,
    expiresAt: new Date(session.expiresAt.getTime()),
    lastUsedAt: session.lastUsedAt
      ? new Date(session.lastUsedAt.getTime())
      : null,
    revokedAt: session.revokedAt ? new Date(session.revokedAt.getTime()) : null,
    createdAt: new Date(session.createdAt.getTime()),
  };
}

function cloneEstablishment(
  establishment: AuthDbEstablishment,
): AuthDbEstablishment {
  return { ...establishment };
}

function expectOk<TData>(result: AuthResult<TData>) {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(`Expected success, got ${result.code}`);
  }

  return result.data;
}

function expectFailure<TData>(
  result: AuthResult<TData>,
  code: AuthFailure["code"],
) {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected failure, got success.");
  }

  expect(result.code).toBe(code);
  expect(result.message).not.toContain("correct");
  expect(result.message).not.toContain("strong-password");

  return result;
}
