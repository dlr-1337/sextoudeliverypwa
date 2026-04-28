import { describe, expect, it } from "vitest";

import {
  CHECKOUT_CONFIRMABLE_PAYMENT_METHODS,
  CHECKOUT_MAX_GENERAL_OBSERVATION_LENGTH,
  CHECKOUT_MAX_ITEM_COUNT,
  CHECKOUT_PAYMENT_METHODS,
  CHECKOUT_PAYMENT_OPTIONS,
  checkoutOrderPayloadSchema,
  formatCheckoutValidationErrors,
} from "./schemas";

function validCheckoutPayload() {
  return {
    establishmentId: " est-a ",
    items: [
      {
        productId: " product-a ",
        quantity: 2,
      },
    ],
    customerName: "  Maria Cliente  ",
    customerPhone: "  11999999999  ",
    deliveryStreet: "  Rua das Flores  ",
    deliveryNumber: "  42A  ",
    deliveryComplement: "  apto 7  ",
    deliveryNeighborhood: "  Centro  ",
    deliveryCity: "  São Paulo  ",
    deliveryState: "  SP  ",
    deliveryPostalCode: "  01001-000  ",
    deliveryReference: "  portão laranja  ",
    generalObservation: "  tocar campainha  ",
    paymentMethod: "CASH",
  };
}

describe("checkout order schemas", () => {
  it("normalizes valid CASH, PIX, and CARD checkout payloads without authority fields", () => {
    for (const paymentMethod of CHECKOUT_CONFIRMABLE_PAYMENT_METHODS) {
      expect(
        checkoutOrderPayloadSchema.parse({
          ...validCheckoutPayload(),
          paymentMethod,
        }),
      ).toEqual({
        establishmentId: "est-a",
        items: [
          {
            productId: "product-a",
            quantity: 2,
          },
        ],
        customerName: "Maria Cliente",
        customerPhone: "11999999999",
        deliveryStreet: "Rua das Flores",
        deliveryNumber: "42A",
        deliveryComplement: "apto 7",
        deliveryNeighborhood: "Centro",
        deliveryCity: "São Paulo",
        deliveryState: "SP",
        deliveryPostalCode: "01001-000",
        deliveryReference: "portão laranja",
        generalObservation: "tocar campainha",
        paymentMethod,
      });
    }

    expect(
      checkoutOrderPayloadSchema.parse({
        ...validCheckoutPayload(),
        paymentMethod: "PIX",
        items: [{ productId: " product-a ", quantity: 1 }],
        deliveryComplement: " ",
        deliveryReference: " ",
        generalObservation: " ",
      }),
    ).toMatchObject({
      paymentMethod: "PIX",
      items: [{ productId: "product-a", quantity: 1 }],
      deliveryComplement: null,
      deliveryReference: null,
      generalObservation: null,
    });
  });

  it("keeps CASH, PIX, and CARD visible as confirmable options and never exposes FAKE", () => {
    expect(CHECKOUT_PAYMENT_METHODS).toEqual(["CASH", "PIX", "CARD"]);
    expect(CHECKOUT_CONFIRMABLE_PAYMENT_METHODS).toEqual(["CASH", "PIX", "CARD"]);
    expect(CHECKOUT_PAYMENT_METHODS).not.toContain("FAKE");

    expect(CHECKOUT_PAYMENT_OPTIONS).toEqual([
      expect.objectContaining({
        method: "CASH",
        isConfirmable: true,
        disabledReason: null,
      }),
      expect.objectContaining({
        method: "PIX",
        isConfirmable: true,
        disabledReason: null,
      }),
      expect.objectContaining({
        method: "CARD",
        isConfirmable: true,
        disabledReason: null,
      }),
    ]);
  });

  it("rejects malformed ids, empty carts, invalid quantities, and oversized text", () => {
    const malformed = checkoutOrderPayloadSchema.safeParse({
      ...validCheckoutPayload(),
      establishmentId: " ",
      items: [
        { productId: " ", quantity: 0 },
        { productId: "product-b", quantity: -1 },
        { productId: "product-c", quantity: 1.5 },
      ],
      customerName: " ",
      customerPhone: " ",
      deliveryStreet: " ",
      generalObservation: "x".repeat(CHECKOUT_MAX_GENERAL_OBSERVATION_LENGTH + 1),
    });

    expect(malformed.success).toBe(false);

    if (!malformed.success) {
      const errors = formatCheckoutValidationErrors(malformed.error);
      expect(errors.fieldErrors.establishmentId).toContain(
        "Informe o identificador da loja.",
      );
      expect(errors.fieldErrors["items.0.productId"]).toContain(
        "Informe o identificador do produto.",
      );
      expect(errors.fieldErrors["items.0.quantity"]).toContain(
        "Informe pelo menos 1 item.",
      );
      expect(errors.fieldErrors["items.1.quantity"]).toContain(
        "Informe pelo menos 1 item.",
      );
      expect(errors.fieldErrors["items.2.quantity"]).toContain(
        "Informe uma quantidade inteira.",
      );
      expect(errors.fieldErrors.customerName).toContain(
        "Informe o nome para entrega.",
      );
      expect(errors.fieldErrors.customerPhone).toContain(
        "Informe o telefone para contato.",
      );
      expect(errors.fieldErrors.deliveryStreet).toContain(
        "Informe a rua da entrega.",
      );
      expect(errors.fieldErrors.generalObservation).toContain(
        `Informe uma observação com até ${CHECKOUT_MAX_GENERAL_OBSERVATION_LENGTH} caracteres.`,
      );
    }

    const emptyCart = checkoutOrderPayloadSchema.safeParse({
      ...validCheckoutPayload(),
      items: [],
    });

    expect(emptyCart.success).toBe(false);

    if (!emptyCart.success) {
      expect(
        formatCheckoutValidationErrors(emptyCart.error).fieldErrors.items,
      ).toContain("Adicione pelo menos um item ao pedido.");
    }

    const oversizedCart = checkoutOrderPayloadSchema.safeParse({
      ...validCheckoutPayload(),
      items: Array.from({ length: CHECKOUT_MAX_ITEM_COUNT + 1 }, (_, index) => ({
        productId: `product-${index}`,
        quantity: 1,
      })),
    });

    expect(oversizedCart.success).toBe(false);

    if (!oversizedCart.success) {
      expect(
        formatCheckoutValidationErrors(oversizedCart.error).fieldErrors.items,
      ).toContain(`Informe até ${CHECKOUT_MAX_ITEM_COUNT} itens por pedido.`);
    }
  });

  it("rejects FAKE and unknown methods for order creation", () => {
    for (const paymentMethod of ["FAKE", "BOLETO"]) {
      const result = checkoutOrderPayloadSchema.safeParse({
        ...validCheckoutPayload(),
        paymentMethod,
      });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(
          formatCheckoutValidationErrors(result.error).fieldErrors.paymentMethod,
        ).toContain("Escolha dinheiro, PIX ou cartão para concluir este pedido.");
      }
    }
  });

  it("maps forged authority fields to sanitized field errors", () => {
    const providerSecret = "provider-secret-token-123";
    const result = checkoutOrderPayloadSchema.safeParse({
      ...validCheckoutPayload(),
      items: [
        {
          productId: "product-a",
          quantity: 1,
          price: "0.01",
          subtotal: "0.01",
          total: "0.01",
          discount: "100.00",
        },
      ],
      price: "0.01",
      subtotal: "0.01",
      total: "0.01",
      discount: "100.00",
      status: "DELIVERED",
      paymentStatus: "PAID",
      customerId: "forged-customer",
      publicCode: "PED-000001",
      provider: "forged-provider",
      providerStatus: "APPROVED",
      providerPaymentId: "pay_secret_123",
      providerPayload: { token: providerSecret },
      cardNumber: "4242424242424242",
      cardCvv: "123",
      cardExpiry: "12/99",
      cardToken: "tok_secret_123",
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      const errors = formatCheckoutValidationErrors(result.error);

      for (const field of [
        "price",
        "subtotal",
        "total",
        "discount",
        "status",
        "paymentStatus",
        "customerId",
        "publicCode",
        "provider",
        "providerStatus",
        "providerPaymentId",
        "providerPayload",
        "cardNumber",
        "cardCvv",
        "cardExpiry",
        "cardToken",
        "items.0.price",
        "items.0.subtotal",
        "items.0.total",
        "items.0.discount",
      ]) {
        expect(errors.fieldErrors[field]).toContain("Campo não permitido.");
      }

      const serializedErrors = JSON.stringify(errors);
      expect(serializedErrors).not.toContain(providerSecret);
      expect(serializedErrors).not.toContain("forged-provider");
      expect(serializedErrors).not.toContain("pay_secret_123");
      expect(serializedErrors).not.toContain("4242424242424242");
      expect(serializedErrors).not.toContain("tok_secret_123");
      expect(serializedErrors).not.toContain("PED-000001");
      expect(errors.formErrors).toEqual([]);
    }
  });
});
