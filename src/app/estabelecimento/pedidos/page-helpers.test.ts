import { describe, expect, it } from "vitest";

import {
  getMerchantOrderEmptyState,
  getMerchantOrderInvalidFilterState,
  getMerchantOrderListTitle,
  getMerchantOrderStatusCopy,
  MERCHANT_ORDER_STATUS_VALUES,
  parseMerchantOrderStatusFilter,
} from "./page-helpers";

describe("merchant order page helpers", () => {
  it("accepts every real order status value and rejects duplicated query values", () => {
    for (const status of MERCHANT_ORDER_STATUS_VALUES) {
      expect(parseMerchantOrderStatusFilter(status)).toEqual({
        valid: true,
        status,
      });
      expect(getMerchantOrderStatusCopy(status).label).toBeTruthy();
    }

    expect(MERCHANT_ORDER_STATUS_VALUES).toContain("REJECTED");
    expect(getMerchantOrderStatusCopy("REJECTED")).toMatchObject({
      label: "Recusado",
      pluralLabel: "Recusados",
    });

    expect(parseMerchantOrderStatusFilter(undefined)).toEqual({ valid: true });
    expect(parseMerchantOrderStatusFilter(["PENDING"])).toEqual({
      valid: false,
    });
  });

  it("rejects unsupported status filters without echoing raw query values", () => {
    expect(parseMerchantOrderStatusFilter("")).toEqual({ valid: false });

    for (const invalidValue of ["pending", "UNKNOWN", "DATABASE_URL"] as const) {
      const parsed = parseMerchantOrderStatusFilter(invalidValue);

      expect(parsed).toEqual({ valid: false });
      expect(JSON.stringify(parsed)).not.toContain(invalidValue);
    }

    const invalidCopy = getMerchantOrderInvalidFilterState();

    expect(invalidCopy).toMatchObject({ title: "Filtro de pedidos inválido" });
    expect(JSON.stringify(invalidCopy)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(invalidCopy)).not.toContain("UNKNOWN");
  });

  it("builds status-aware list titles and empty-state copy", () => {
    expect(getMerchantOrderListTitle()).toBe("Todos os pedidos");
    expect(getMerchantOrderListTitle("PENDING")).toBe("Pedidos recebidos");
    expect(getMerchantOrderListTitle("READY_FOR_PICKUP")).toBe(
      "Pedidos prontos para retirada",
    );
    expect(getMerchantOrderListTitle("REJECTED")).toBe("Pedidos recusados");

    expect(getMerchantOrderEmptyState()).toMatchObject({
      title: "Nenhum pedido encontrado",
    });
    expect(getMerchantOrderEmptyState().description).toContain("caixa de entrada");

    expect(getMerchantOrderEmptyState("PENDING")).toMatchObject({
      title: "Nenhum pedido recebido encontrado",
    });
    expect(getMerchantOrderEmptyState("DELIVERED").description).toContain(
      "entregue",
    );
    expect(getMerchantOrderEmptyState("REJECTED")).toMatchObject({
      title: "Nenhum pedido recusado encontrado",
    });
    expect(getMerchantOrderEmptyState("REJECTED").description).toContain(
      "recusado",
    );
  });
});
