import { describe, expect, it } from "vitest";

import {
  formatPublicOrderDateTime,
  formatPublicOrderMoney,
  getManualCashPaymentDescription,
  getOrderStatusLabel,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  getPublicPaymentSummaryCopy,
} from "./display";
import type {
  OrderStatusValue,
  PaymentMethodValue,
  PaymentStatusValue,
} from "./service-core";

const PUBLIC_PAYMENT_COPY_FIELDS = [
  "eyebrow",
  "heading",
  "description",
  "action",
] as const;

function publicPaymentCopyText(method: unknown, status: unknown): string {
  const copy = getPublicPaymentSummaryCopy(method, status);

  return PUBLIC_PAYMENT_COPY_FIELDS.map((field) => copy[field]).join(" ");
}

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

  it("returns accessible manual cash copy without changing legacy wording", () => {
    const copy = getPublicPaymentSummaryCopy("CASH", "MANUAL_CASH_ON_DELIVERY");
    const description = getManualCashPaymentDescription(
      "CASH",
      "MANUAL_CASH_ON_DELIVERY",
    );

    expect(copy).toMatchObject({
      eyebrow: "Pagamento manual",
      heading: "Pagamento em dinheiro",
      description:
        "Pagamento em dinheiro na entrega. Se precisar de troco, combine com a loja no atendimento.",
    });
    expect(copy.action).toContain("valor combinado");
    expect(description).toBe(copy.description);
    expect(description).not.toMatch(/pix|cart[aã]o|gateway|provider|qr|last4/i);
  });

  it("returns distinct user-facing Pix copy for pending and terminal states", () => {
    expect(getPublicPaymentSummaryCopy("PIX", "PENDING")).toMatchObject({
      eyebrow: "Pagamento via Pix",
      heading: "Pix aguardando pagamento",
      description:
        "Use as instruções de Pix exibidas nesta página para pagar com segurança.",
    });
    expect(getPublicPaymentSummaryCopy("PIX", "AUTHORIZED").heading).toBe(
      "Pix em confirmação",
    );
    expect(getPublicPaymentSummaryCopy("PIX", "PAID").heading).toBe(
      "Pix confirmado",
    );
    expect(getPublicPaymentSummaryCopy("PIX", "FAILED").heading).toBe(
      "Pix não aprovado",
    );
    expect(getPublicPaymentSummaryCopy("PIX", "CANCELED").heading).toBe(
      "Pix cancelado",
    );

    const pixHeadings = [
      "PENDING",
      "AUTHORIZED",
      "PAID",
      "FAILED",
      "CANCELED",
    ].map((status) => getPublicPaymentSummaryCopy("PIX", status).heading);

    expect(new Set(pixHeadings).size).toBe(pixHeadings.length);
  });

  it("returns distinct user-facing card copy for pending and terminal states", () => {
    expect(getPublicPaymentSummaryCopy("CARD", "PENDING")).toMatchObject({
      eyebrow: "Pagamento por cartão",
      heading: "Cartão aguardando pagamento",
      description:
        "Finalize o pagamento pelo link seguro exibido nesta página quando ele estiver disponível.",
    });
    expect(getPublicPaymentSummaryCopy("CARD", "AUTHORIZED").heading).toBe(
      "Cartão autorizado",
    );
    expect(getPublicPaymentSummaryCopy("CARD", "PAID").heading).toBe(
      "Cartão confirmado",
    );
    expect(getPublicPaymentSummaryCopy("CARD", "FAILED").heading).toBe(
      "Cartão não aprovado",
    );
    expect(getPublicPaymentSummaryCopy("CARD", "CANCELED").heading).toBe(
      "Cartão cancelado",
    );

    const cardHeadings = [
      "PENDING",
      "AUTHORIZED",
      "PAID",
      "FAILED",
      "CANCELED",
    ].map((status) => getPublicPaymentSummaryCopy("CARD", status).heading);

    expect(new Set(cardHeadings).size).toBe(cardHeadings.length);
  });

  it("uses safe fallback copy for unknown or mismatched payment values", () => {
    const expectedPaymentFallback = {
      eyebrow: "Pagamento",
      heading: "Pagamento indisponível",
      description: "Pagamento indisponível para acompanhamento público.",
      action: "Acompanhe o pedido por este endereço ou fale com a loja pelo atendimento.",
    };

    expect(getOrderStatusLabel("DATABASE_URL" as OrderStatusValue)).toBe(
      "Status do pedido indisponível",
    );
    expect(getPaymentStatusLabel("PROVIDER_FAILED" as PaymentStatusValue)).toBe(
      "Status do pagamento indisponível",
    );
    expect(
      getManualCashPaymentDescription("PIX" as PaymentMethodValue, "PAID"),
    ).toBe(expectedPaymentFallback.description);
    expect(getPublicPaymentSummaryCopy("FAKE", "PENDING")).toEqual(
      expectedPaymentFallback,
    );
    expect(getPublicPaymentSummaryCopy("PIX", "PROVIDER_FAILED")).toEqual(
      expectedPaymentFallback,
    );
    expect(
      getPublicPaymentSummaryCopy("CARD", "MANUAL_CASH_ON_DELIVERY"),
    ).toEqual(expectedPaymentFallback);
    expect(publicPaymentCopyText("DATABASE_URL", "PROVIDER_FAILED")).not.toMatch(
      /DATABASE_URL|PROVIDER_FAILED/u,
    );
  });

  it("keeps generated public payment copy free of unsafe provider, debug and card-data fragments", () => {
    const samples: Array<[unknown, unknown]> = [
      ["CASH", "MANUAL_CASH_ON_DELIVERY"],
      ["CASH", "PENDING"],
      ["CASH", "AUTHORIZED"],
      ["CASH", "PAID"],
      ["CASH", "FAILED"],
      ["CASH", "REFUNDED"],
      ["CASH", "CANCELED"],
      ["PIX", "PENDING"],
      ["PIX", "AUTHORIZED"],
      ["PIX", "PAID"],
      ["PIX", "FAILED"],
      ["PIX", "REFUNDED"],
      ["PIX", "CANCELED"],
      ["CARD", "PENDING"],
      ["CARD", "AUTHORIZED"],
      ["CARD", "PAID"],
      ["CARD", "FAILED"],
      ["CARD", "REFUNDED"],
      ["CARD", "CANCELED"],
      ["providerPayload", "DATABASE_URL"],
      ["CARD", "cardLast4"],
    ];
    const unsafeFragments = [
      /provider/u,
      /gateway/u,
      /payload/u,
      /debug/u,
      /secret/u,
      /token/u,
      /cvv/u,
      /last4/u,
      /cardBrand/u,
      /cardLast4/u,
      /providerPaymentId/u,
      /providerStatus/u,
      /DATABASE_URL/u,
      /SQL/u,
      /stack/u,
      /internal id/u,
      /id interno/u,
      /raw/u,
      /enum/u,
      /n[uú]mero (?:completo )?do cart[aã]o/u,
      /validade do cart[aã]o/u,
      /expiry/u,
      /expiration/u,
      /PENDING|AUTHORIZED|PAID|FAILED|REFUNDED|CANCELED/u,
      /MANUAL_CASH_ON_DELIVERY|CASH|PIX|CARD/u,
    ];

    for (const [method, status] of samples) {
      const generatedCopy = publicPaymentCopyText(method, status);

      for (const unsafeFragment of unsafeFragments) {
        expect(generatedCopy).not.toMatch(unsafeFragment);
      }
    }
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
