import { describe, expect, it } from "vitest";

import {
  formatPublicOrderDateTime,
  formatPublicOrderMoney,
  getManualCashPaymentDescription,
  getOrderStatusLabel,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
} from "./display";
import type {
  OrderStatusValue,
  PaymentMethodValue,
  PaymentStatusValue,
} from "./service-core";

describe("public order display helpers", () => {
  it("maps every order status to Portuguese user-facing labels", () => {
    const expectedLabels = new Map<OrderStatusValue, string>([
      ["DRAFT", "Rascunho"],
      ["PENDING", "Pedido recebido"],
      ["ACCEPTED", "Pedido aceito"],
      ["PREPARING", "Em preparo"],
      ["READY_FOR_PICKUP", "Pronto para retirada"],
      ["OUT_FOR_DELIVERY", "Saiu para entrega"],
      ["DELIVERED", "Entregue"],
      ["REJECTED", "Pedido recusado"],
      ["CANCELED", "Cancelado"],
    ]);

    for (const [status, label] of expectedLabels) {
      expect(getOrderStatusLabel(status)).toBe(label);
      expect(getOrderStatusLabel(status)).not.toBe(status);
    }
  });

  it("maps every payment method and status to Portuguese labels without raw enum copy", () => {
    const methodLabels = new Map<PaymentMethodValue, string>([
      ["CASH", "Dinheiro"],
      ["PIX", "Pix"],
      ["CARD", "Cartão"],
      ["FAKE", "Pagamento de teste"],
    ]);
    const statusLabels = new Map<PaymentStatusValue, string>([
      ["PENDING", "Pagamento pendente"],
      ["MANUAL_CASH_ON_DELIVERY", "Pagamento em dinheiro na entrega"],
      ["AUTHORIZED", "Pagamento autorizado"],
      ["PAID", "Pago"],
      ["FAILED", "Pagamento não aprovado"],
      ["REFUNDED", "Pagamento estornado"],
      ["CANCELED", "Pagamento cancelado"],
    ]);

    for (const [method, label] of methodLabels) {
      expect(getPaymentMethodLabel(method)).toBe(label);
      expect(getPaymentMethodLabel(method)).not.toBe(method);
    }

    for (const [status, label] of statusLabels) {
      expect(getPaymentStatusLabel(status)).toBe(label);
      expect(getPaymentStatusLabel(status)).not.toBe(status);
    }
  });

  it("describes manual cash-on-delivery without mentioning providers, Pix or card data", () => {
    const description = getManualCashPaymentDescription(
      "CASH",
      "MANUAL_CASH_ON_DELIVERY",
    );

    expect(description).toBe(
      "Pagamento em dinheiro na entrega. Se precisar de troco, combine com a loja no atendimento.",
    );
    expect(description).not.toMatch(/pix|cart[aã]o|gateway|provider|qr|last4/i);
  });

  it("uses safe fallback copy for unknown enum values instead of leaking raw values", () => {
    expect(getOrderStatusLabel("DATABASE_URL" as OrderStatusValue)).toBe(
      "Status do pedido indisponível",
    );
    expect(getPaymentStatusLabel("PROVIDER_FAILED" as PaymentStatusValue)).toBe(
      "Status do pagamento indisponível",
    );
    expect(
      getManualCashPaymentDescription("PIX" as PaymentMethodValue, "PAID"),
    ).toBe("Pagamento indisponível para acompanhamento público.");
  });

  it("formats valid public money values and hides malformed persisted values", () => {
    expect(formatPublicOrderMoney("0.00")).toBe("R$ 0,00");
    expect(formatPublicOrderMoney("25.40")).toBe("R$ 25,40");
    expect(formatPublicOrderMoney({ toString: () => "1000.05" })).toBe(
      "R$ 1.000,05",
    );

    for (const malformed of ["not-money", "25.999", Number.NaN, -1, null]) {
      expect(formatPublicOrderMoney(malformed)).toBe("Valor indisponível");
    }
  });

  it("formats valid public timestamps and hides malformed date values", () => {
    expect(
      formatPublicOrderDateTime(new Date("2026-04-27T15:30:00.000Z")),
    ).toBe("27/04/2026, 12:30");

    for (const malformed of ["not-date", new Date("invalid"), null, undefined]) {
      expect(formatPublicOrderDateTime(malformed)).toBe("Data indisponível");
    }
  });
});
