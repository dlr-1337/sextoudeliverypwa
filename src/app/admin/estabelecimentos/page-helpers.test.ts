import { describe, expect, it } from "vitest";

import {
  getEstablishmentEmptyState,
  getEstablishmentListTitle,
  parseAdminEstablishmentStatusFilter,
} from "./page-helpers";

describe("admin establishment page helpers", () => {
  it("accepts only known establishment status filters", () => {
    expect(parseAdminEstablishmentStatusFilter(undefined)).toEqual({
      valid: true,
    });
    expect(parseAdminEstablishmentStatusFilter("PENDING")).toEqual({
      valid: true,
      status: "PENDING",
    });
    expect(parseAdminEstablishmentStatusFilter("DRAFT")).toEqual({
      valid: false,
    });
    expect(parseAdminEstablishmentStatusFilter(["ACTIVE", "BLOCKED"])).toEqual({
      valid: false,
    });
  });

  it("returns safe list and empty-state copy without echoing invalid raw filters", () => {
    expect(getEstablishmentListTitle()).toBe("Todos os estabelecimentos");
    expect(getEstablishmentListTitle("BLOCKED")).toBe(
      "Estabelecimentos bloqueados",
    );
    expect(getEstablishmentEmptyState("PENDING")).toEqual({
      title: "Nenhum estabelecimento pendente encontrado",
      description:
        "Não há lojas aguardando aprovação no momento. Novos cadastros de comerciantes entram nesta fila.",
    });
    expect(JSON.stringify(getEstablishmentEmptyState("PENDING"))).not.toContain(
      "DRAFT",
    );
  });
});
