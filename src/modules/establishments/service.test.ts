import { describe, expect, it } from "vitest";

import {
  createEstablishmentServiceCore,
  type EstablishmentDbCategory,
  type EstablishmentDbOwner,
  type EstablishmentDbRow,
  type EstablishmentFailure,
  type EstablishmentResult,
  type EstablishmentServiceClient,
  type EstablishmentServiceCore,
  type EstablishmentStatusValue,
} from "./service-core";

const NOW = new Date("2026-04-26T21:46:00.000Z");
const LATER = new Date("2026-04-26T21:47:00.000Z");

describe("establishment admin service core", () => {
  it("returns bounded dashboard and filtered list DTOs without secret fields", async () => {
    const fakeDb = createFakeEstablishmentDb({
      establishments: [
        buildEstablishment({ id: "pending-1", status: "PENDING", createdAt: LATER }),
        buildEstablishment({ id: "active-1", status: "ACTIVE" }),
        buildEstablishment({ id: "blocked-1", status: "BLOCKED" }),
        buildEstablishment({ id: "inactive-1", status: "INACTIVE" }),
      ],
    });
    const service = createEstablishmentServiceCore({ db: fakeDb });

    const dashboard = expectOk(await service.getDashboard());
    expect(dashboard.countsByStatus).toEqual({
      PENDING: 1,
      ACTIVE: 1,
      BLOCKED: 1,
      INACTIVE: 1,
    });
    expect(dashboard.recentPending.map((item) => item.id)).toEqual([
      "pending-1",
    ]);

    const listed = expectOk(
      await service.list({ status: "PENDING", limit: "1" }),
    );

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: "pending-1",
      status: "PENDING",
      owner: {
        id: "owner-1",
        name: "Maria Comerciante",
        email: "maria@example.com",
      },
      category: {
        id: "category-1",
        type: "ESTABLISHMENT",
      },
    });
    expect(JSON.stringify(listed)).not.toContain("passwordHash");
    expect(JSON.stringify(listed)).not.toContain("tokenHash");
    expect(JSON.stringify(listed)).not.toContain("sessions");
  });

  it("validates list filters before querying and keeps ordering deterministic", async () => {
    const fakeDb = createFakeEstablishmentDb({
      establishments: [
        buildEstablishment({ id: "b", name: "B Bar", createdAt: NOW }),
        buildEstablishment({ id: "a", name: "A Bar", createdAt: NOW }),
      ],
    });
    const service = createEstablishmentServiceCore({ db: fakeDb });

    const invalidStatus = expectFailure(
      await service.list({ status: "DRAFT" }),
      "VALIDATION_FAILED",
    );
    expect(invalidStatus.validationErrors?.fieldErrors.status).toContain(
      "Selecione um status de estabelecimento válido.",
    );
    expect(fakeDb.state.findManyCalls).toBe(0);

    const listed = expectOk(await service.list({ limit: 10 }));
    expect(listed.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("returns safe establishment detail DTOs and omits hashes/session data", async () => {
    const service = createEstablishmentServiceCore({
      db: createFakeEstablishmentDb({
        establishments: [
          buildEstablishment({
            id: "detail-1",
            description: "Churrasco de sexta",
            deliveryFee: fakeDecimal("7.50"),
            minimumOrder: fakeDecimal("30.00"),
          }),
        ],
      }),
    });

    const detail = expectOk(await service.getById({ id: "detail-1" }));

    expect(detail).toMatchObject({
      id: "detail-1",
      description: "Churrasco de sexta",
      deliveryFee: "7.50",
      minimumOrder: "30.00",
      owner: {
        email: "maria@example.com",
        phone: "11999999999",
      },
      category: {
        name: "Restaurantes",
        slug: "restaurantes",
      },
    });
    expect(JSON.stringify(detail)).not.toContain("passwordHash");
    expect(JSON.stringify(detail)).not.toContain("tokenHash");
    expect(JSON.stringify(detail)).not.toContain("DATABASE_URL");
  });

  it("locks named establishment transitions, including idempotent target states", async () => {
    const cases: Array<{
      action: EstablishmentTransitionAction;
      start: EstablishmentStatusValue;
      expected?: EstablishmentStatusValue;
      code?: EstablishmentFailure["code"];
      updateCount: number;
    }> = [
      { action: "approve", start: "PENDING", expected: "ACTIVE", updateCount: 1 },
      { action: "approve", start: "ACTIVE", expected: "ACTIVE", updateCount: 0 },
      { action: "approve", start: "BLOCKED", code: "INVALID_TRANSITION", updateCount: 0 },
      { action: "block", start: "PENDING", expected: "BLOCKED", updateCount: 1 },
      { action: "block", start: "ACTIVE", expected: "BLOCKED", updateCount: 1 },
      { action: "block", start: "BLOCKED", expected: "BLOCKED", updateCount: 0 },
      { action: "block", start: "INACTIVE", code: "INVALID_TRANSITION", updateCount: 0 },
      { action: "reactivate", start: "BLOCKED", expected: "ACTIVE", updateCount: 1 },
      { action: "reactivate", start: "INACTIVE", expected: "ACTIVE", updateCount: 1 },
      { action: "reactivate", start: "ACTIVE", expected: "ACTIVE", updateCount: 0 },
      { action: "reactivate", start: "PENDING", code: "INVALID_TRANSITION", updateCount: 0 },
      { action: "inactivate", start: "PENDING", expected: "INACTIVE", updateCount: 1 },
      { action: "inactivate", start: "ACTIVE", expected: "INACTIVE", updateCount: 1 },
      { action: "inactivate", start: "BLOCKED", expected: "INACTIVE", updateCount: 1 },
      { action: "inactivate", start: "INACTIVE", expected: "INACTIVE", updateCount: 0 },
    ];

    for (const testCase of cases) {
      const fakeDb = createFakeEstablishmentDb({
        establishments: [
          buildEstablishment({ id: "transition-1", status: testCase.start }),
        ],
      });
      const service = createEstablishmentServiceCore({ db: fakeDb });
      const result = await service[testCase.action]({ id: "transition-1" });

      expect(fakeDb.state.updateCalls).toBe(testCase.updateCount);

      if (testCase.expected) {
        expect(expectOk(result).status).toBe(testCase.expected);
      } else {
        expectFailure(result, testCase.code ?? "INVALID_TRANSITION");
      }
    }
  });

  it("returns safe failures for missing, malformed, and concurrently removed establishments", async () => {
    const fakeDb = createFakeEstablishmentDb({
      establishments: [buildEstablishment({ id: "gone-during-update" })],
      failNextUpdateAsNotFound: true,
    });
    const service = createEstablishmentServiceCore({ db: fakeDb });

    expectFailure(await service.getById({ id: "missing" }), "NOT_FOUND");
    expectFailure(await service.approve({ id: " " }), "VALIDATION_FAILED");
    expectFailure(await service.approve({ id: "missing" }), "NOT_FOUND");
    expectFailure(
      await service.approve({ id: "gone-during-update" }),
      "NOT_FOUND",
    );
  });
});

type EstablishmentTransitionAction = Extract<
  keyof EstablishmentServiceCore,
  "approve" | "block" | "reactivate" | "inactivate"
>;

type FakeEstablishmentState = {
  establishments: EstablishmentDbRow[];
  failNextUpdateAsNotFound: boolean;
  findManyCalls: number;
  updateCalls: number;
};

type FakeEstablishmentDb = EstablishmentServiceClient & {
  state: FakeEstablishmentState;
};

function createFakeEstablishmentDb(
  initial: Partial<
    Pick<FakeEstablishmentState, "establishments" | "failNextUpdateAsNotFound">
  > = {},
): FakeEstablishmentDb {
  const state: FakeEstablishmentState = {
    establishments: initial.establishments?.map(cloneEstablishment) ?? [],
    failNextUpdateAsNotFound: initial.failNextUpdateAsNotFound ?? false,
    findManyCalls: 0,
    updateCalls: 0,
  };
  const client: FakeEstablishmentDb = {
    state,
    establishment: {
      async count(args = {}) {
        return filterByWhere(state.establishments, args.where).length;
      },
      async findMany(args = {}) {
        state.findManyCalls += 1;

        return filterByWhere(state.establishments, args.where)
          .sort(compareEstablishmentRows)
          .slice(0, args.take)
          .map(cloneEstablishment);
      },
      async findUnique(args) {
        const establishment = state.establishments.find(
          (candidate) => candidate.id === args.where.id,
        );

        return establishment ? cloneEstablishment(establishment) : null;
      },
      async update(args) {
        state.updateCalls += 1;

        if (state.failNextUpdateAsNotFound) {
          state.failNextUpdateAsNotFound = false;
          throw notFound();
        }

        const establishment = state.establishments.find(
          (candidate) => candidate.id === args.where.id,
        );

        if (!establishment) {
          throw notFound();
        }

        if (args.data.status !== undefined) {
          establishment.status = args.data.status;
        }

        establishment.updatedAt = NOW;

        return cloneEstablishment(establishment);
      },
    },
  };

  return client;
}

function filterByWhere(
  establishments: EstablishmentDbRow[],
  where: { status?: EstablishmentStatusValue } = {},
) {
  return establishments.filter((establishment) => {
    if (where.status && establishment.status !== where.status) {
      return false;
    }

    return true;
  });
}

function buildEstablishment(
  overrides: Partial<EstablishmentDbRow> = {},
): EstablishmentDbRow {
  return {
    id: "establishment-1",
    ownerId: "owner-1",
    categoryId: "category-1",
    name: "Sextou Bar",
    slug: "sextou-bar",
    description: null,
    status: "PENDING",
    phone: "1133334444",
    whatsapp: "11999999999",
    addressLine1: "Rua das Sextas, 10",
    addressLine2: null,
    city: "São Paulo",
    state: "SP",
    postalCode: "01000-000",
    deliveryFee: fakeDecimal("5.00"),
    minimumOrder: fakeDecimal("25.00"),
    createdAt: NOW,
    updatedAt: NOW,
    owner: buildOwner(),
    category: buildCategory(),
    ...overrides,
  };
}

function buildOwner(overrides: Partial<EstablishmentDbOwner> = {}) {
  return {
    id: "owner-1",
    name: "Maria Comerciante",
    email: "maria@example.com",
    role: "MERCHANT",
    status: "ACTIVE",
    phone: "11999999999",
    passwordHash: "hash:must-not-leak",
    sessions: [{ tokenHash: "session-token-hash" }],
    ...overrides,
  } satisfies EstablishmentDbOwner;
}

function buildCategory(overrides: Partial<EstablishmentDbCategory> = {}) {
  return {
    id: "category-1",
    name: "Restaurantes",
    slug: "restaurantes",
    type: "ESTABLISHMENT",
    isActive: true,
    ...overrides,
  } satisfies EstablishmentDbCategory;
}

function fakeDecimal(value: string) {
  return {
    toString() {
      return value;
    },
  };
}

function compareEstablishmentRows(
  first: EstablishmentDbRow,
  second: EstablishmentDbRow,
) {
  return (
    second.createdAt.getTime() - first.createdAt.getTime() ||
    first.name.localeCompare(second.name, "pt-BR") ||
    first.id.localeCompare(second.id, "pt-BR")
  );
}

function notFound() {
  return Object.assign(new Error("Record not found"), { code: "P2025" });
}

function cloneEstablishment(
  establishment: EstablishmentDbRow,
): EstablishmentDbRow {
  return {
    ...establishment,
    deliveryFee: establishment.deliveryFee,
    minimumOrder: establishment.minimumOrder,
    createdAt: new Date(establishment.createdAt.getTime()),
    updatedAt: new Date(establishment.updatedAt.getTime()),
    owner: { ...establishment.owner },
    category: establishment.category ? { ...establishment.category } : null,
  };
}

function expectOk<TData>(result: EstablishmentResult<TData>) {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(`Expected success, got ${result.code}`);
  }

  return result.data;
}

function expectFailure<TData>(
  result: EstablishmentResult<TData>,
  code: EstablishmentFailure["code"],
) {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected failure, got success.");
  }

  expect(result.code).toBe(code);
  expect(result.message).not.toContain("Record not found");
  expect(result.message).not.toContain("passwordHash");
  expect(result.message).not.toContain("DATABASE_URL");

  return result;
}
