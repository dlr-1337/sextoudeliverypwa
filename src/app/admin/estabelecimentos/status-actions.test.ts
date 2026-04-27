import { describe, expect, it } from "vitest";

import type { EstablishmentStatusValue } from "@/modules/establishments/service-core";

import {
  canRunEstablishmentStatusAction,
  getEstablishmentStatusActions,
  type EstablishmentStatusActionId,
} from "./status-actions";

const VALID_ACTIONS_BY_STATUS = {
  PENDING: ["approve", "block", "inactivate"],
  ACTIVE: ["block", "inactivate"],
  BLOCKED: ["reactivate", "inactivate"],
  INACTIVE: ["reactivate"],
} as const satisfies Record<
  EstablishmentStatusValue,
  readonly EstablishmentStatusActionId[]
>;

describe("establishment status actions", () => {
  it("shows only valid named actions for each establishment status", () => {
    for (const [status, actionIds] of Object.entries(
      VALID_ACTIONS_BY_STATUS,
    ) as Array<
      [EstablishmentStatusValue, readonly EstablishmentStatusActionId[]]
    >) {
      expect(getEstablishmentStatusActions(status).map((action) => action.id)).toEqual(
        actionIds,
      );
    }
  });

  it("keeps disallowed transition buttons hidden", () => {
    expect(canRunEstablishmentStatusAction("ACTIVE", "approve")).toBe(false);
    expect(canRunEstablishmentStatusAction("BLOCKED", "approve")).toBe(false);
    expect(canRunEstablishmentStatusAction("INACTIVE", "block")).toBe(false);
    expect(canRunEstablishmentStatusAction("PENDING", "reactivate")).toBe(false);
  });
});
