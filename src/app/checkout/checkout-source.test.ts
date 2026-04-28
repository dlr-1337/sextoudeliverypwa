import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const checkoutPageSource = readFileSync("src/app/checkout/page.tsx", "utf8");
const checkoutFormSource = readFileSync(
  "src/app/checkout/checkout-form.tsx",
  "utf8",
);
const checkoutSchemaSource = readFileSync("src/modules/orders/schemas.ts", "utf8");

const forbiddenClientImports = [
  { label: "auth modules", pattern: /@\/modules\/auth/u },
  { label: "database module", pattern: /@\/server\/db/u },
  { label: "Prisma runtime", pattern: /@prisma|Prisma/u },
  { label: "Next headers", pattern: /next\/headers/u },
  {
    label: "payment provider/config modules",
    pattern: /@\/modules\/payments|payments\/config|payments\/service|fake-dev-provider/u,
  },
] as const;

describe("checkout route source boundaries", () => {
  it("keeps the route dynamic and protects it with the CUSTOMER server guard", () => {
    expect(checkoutPageSource).toContain('export const dynamic = "force-dynamic"');
    expect(checkoutPageSource).toContain("readSessionCookieValue");
    expect(checkoutPageSource).toContain("requireCustomerSession");
    expect(checkoutPageSource).toContain(
      'redirect(resolveAuthErrorRedirect(error, "/checkout"))',
    );
    expect(checkoutPageSource).toContain("customerDefaults");
    expect(checkoutPageSource).toContain("auth.user.name");
    expect(checkoutPageSource).toContain('auth.user.phone ?? ""');
  });

  it("keeps browser storage and action state inside a focused client island", () => {
    expect(checkoutFormSource.startsWith('"use client";')).toBe(true);
    expect(checkoutPageSource).not.toContain("window.localStorage");

    for (const expectedFragment of [
      "useActionState(",
      "submitCheckoutAction",
      "CHECKOUT_ACTION_IDLE_STATE",
      "useFormStatus",
      "useRouter",
      "CART_STORAGE_KEY",
      "parseStoredCart",
      "toCheckoutCartPayload",
      "window.localStorage.getItem",
      "window.localStorage.removeItem",
      'role="status"',
      'role="alert"',
    ]) {
      expect(checkoutFormSource).toContain(expectedFragment);
    }

    for (const { label, pattern } of forbiddenClientImports) {
      expect(checkoutFormSource, label).not.toMatch(pattern);
    }
  });

  it("submits only hidden checkout cart authority fields from the local cart projection", () => {
    expect(checkoutFormSource).toContain("toCheckoutCartPayload(cart)");
    expect(checkoutFormSource).toContain('name="establishmentId"');
    expect(checkoutFormSource).toContain('name={`items.${index}.productId`}');
    expect(checkoutFormSource).toContain('name={`items.${index}.quantity`}');

    for (const forbiddenHiddenFragment of [
      'name={`items.${index}.name`}',
      'name={`items.${index}.price`}',
      'name={`items.${index}.imageUrl`}',
      'name="subtotal"',
      'name="total"',
      'name="status"',
      'name="paymentStatus"',
      'name="publicCode"',
      'name="provider"',
      'name="providerPaymentId"',
      'name="providerStatus"',
      'name="providerPayload"',
      'name="checkoutUrl"',
      'name="pixQrCode"',
      'name="pixCopyPaste"',
    ]) {
      expect(checkoutFormSource).not.toContain(forbiddenHiddenFragment);
    }
  });

  it("renders the checkout schema field names and field-error surfaces", () => {
    for (const fieldName of [
      "customerName",
      "customerPhone",
      "deliveryStreet",
      "deliveryNumber",
      "deliveryComplement",
      "deliveryNeighborhood",
      "deliveryCity",
      "deliveryState",
      "deliveryPostalCode",
      "deliveryReference",
      "generalObservation",
      "paymentMethod",
      "items",
    ]) {
      expect(checkoutFormSource).toContain(fieldName);
    }

    expect(checkoutFormSource).toContain("function FieldError");
    expect(checkoutFormSource).toContain("aria-invalid");
    expect(checkoutFormSource).toContain("aria-describedby");
    expect(checkoutFormSource).toContain("fieldErrors.paymentMethod");
    expect(checkoutFormSource).toContain("fieldErrors.items");
  });

  it("uses the payment option contract for enabled CASH, PIX, and CARD checkout", () => {
    expect(checkoutSchemaSource).toContain(
      "export const CHECKOUT_CONFIRMABLE_PAYMENT_METHODS",
    );
    expect(checkoutSchemaSource).toContain('"CASH"');
    expect(checkoutSchemaSource).toContain('"PIX"');
    expect(checkoutSchemaSource).toContain('"CARD"');
    expect(checkoutSchemaSource).toContain('method: "CASH"');
    expect(checkoutSchemaSource).toContain('method: "PIX"');
    expect(checkoutSchemaSource).toContain('method: "CARD"');
    expect(checkoutSchemaSource).toContain("isConfirmable: true");
    expect(checkoutSchemaSource).not.toContain('method: "FAKE"');
    expect(checkoutFormSource).toContain("CHECKOUT_PAYMENT_OPTIONS.map");
    expect(checkoutFormSource).toContain("option.isConfirmable");
    expect(checkoutFormSource).toContain("option.disabledReason");
    expect(checkoutFormSource).toContain("disabled={!option.isConfirmable}");
    expect(checkoutFormSource).toContain("Dinheiro fica manual na entrega");
    expect(checkoutFormSource).toContain("PIX e cartão iniciam um pagamento");
    expect(checkoutFormSource).toContain('return paymentOption?.method ?? "CASH"');
    expect(checkoutFormSource).toContain('"Criar pedido"');
    expect(checkoutFormSource).not.toContain("Criar pedido em dinheiro");
  });

  it("does not render card-data, provider, or payment-authority form fields", () => {
    for (const forbiddenFormField of [
      "cardNumber",
      "card-number",
      "cvv",
      "cvc",
      "expiry",
      "expiration",
      "cardExpiry",
      "cardToken",
      "paymentToken",
      "providerPayload",
      "providerPaymentId",
      "providerStatus",
      "checkoutUrl",
      "pixQrCode",
      "pixCopyPaste",
    ]) {
      expect(checkoutFormSource).not.toContain(forbiddenFormField);
    }
  });

  it("clears only the matching current-store cart after a created action state", () => {
    for (const expectedFragment of [
      'state.status !== "created"',
      "handledCreatedCodeRef",
      "state.publicCode",
      "state.redirectPath",
      "storedCart.status === \"valid\"",
      "storedCart.cart.store.establishmentId === cart.store.establishmentId",
      "window.localStorage.removeItem(CART_STORAGE_KEY)",
      "setCart(null)",
    ]) {
      expect(checkoutFormSource).toContain(expectedFragment);
    }
  });

  it("renders created-state recovery, stable S05 route navigation, and no fake confirmation state", () => {
    for (const expectedFragment of [
      "Valores e disponibilidade são estimativas",
      "servidor recalculará tudo",
      "CART_READ_FAILURE_MESSAGE",
      "CART_CLEAR_STORAGE_FAILURE_MESSAGE",
      "CART_INVALID_PAYLOAD_MESSAGE",
      "CART_CREATED_CLEAR_FAILURE_MESSAGE",
      "CART_CREATED_NAVIGATION_FAILURE_MESSAGE",
      "Pedido criado",
      'href={state.redirectPath}',
      "router.push(state.redirectPath)",
      "/pedido/",
    ]) {
      expect(checkoutFormSource).toContain(expectedFragment);
    }

    for (const forbiddenFragment of [
      "orderId",
      "providerPayload",
      "/confirmacao",
      "window.location",
      "Nenhum pedido foi criado ainda",
    ]) {
      expect(checkoutFormSource).not.toContain(forbiddenFragment);
    }
  });
});
