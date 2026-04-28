import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PaymentConfigError, type PaymentConfigEnv } from "./config";
import { createFakeDevPaymentProvider } from "./fake-dev-provider";
import {
  getFakeDevPaymentProvider,
  getPaymentGatewayProvider,
} from "./service";
import {
  PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
  type HostedCardPaymentInitiationInput,
  type PaymentInitiationResult,
  type PaymentInitiationSuccessData,
  type PixPaymentInitiationInput,
} from "./types";

const REQUESTED_AT = new Date("2026-04-28T15:00:00.000Z");
const PIX_EXPIRES_AT = new Date("2026-04-28T15:30:00.000Z");
const VALID_FAKE_PAYMENT_ENV = {
  FAKE_PAYMENT_PROVIDER: "enabled",
  FAKE_PAYMENT_WEBHOOK_SECRET: "0123456789abcdef0123456789abcdef",
  FAKE_PAYMENT_APPROVAL_MODE: "manual",
} as const satisfies PaymentConfigEnv;

describe("fake/dev payment provider", () => {
  it("initiates PIX with deterministic pending public instructions and persistence fields", async () => {
    const provider = createFakeDevPaymentProvider();

    const result = await provider.initiatePayment(pixInput());
    const data = expectPaymentSuccess(result, "PIX");

    expect(provider.provider).toBe(PAYMENT_GATEWAY_PROVIDER_FAKE_DEV);
    expect(data.publicInstructions).toEqual({
      method: "PIX",
      qrCode: expect.stringMatching(
        /^fake-dev-pix:\/\/fake_dev_pix_[a-f0-9]{24}\?/u,
      ),
      copyPaste: expect.stringMatching(
        /^FAKEDEVPIX\|v1\|order=PED-20260428-PIX01\|amount=123\.45\|expires=2026-04-28T15:30:00\.000Z\|payment=fake_dev_pix_[a-f0-9]{24}$/u,
      ),
      expiresAtIso: PIX_EXPIRES_AT.toISOString(),
      checkoutUrl: null,
    });
    expect(data.persistence).toEqual({
      method: "PIX",
      status: "PENDING",
      provider: PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
      providerPaymentId: expect.stringMatching(/^fake_dev_pix_[a-f0-9]{24}$/u),
      providerStatus: "pending",
      providerPayload: null,
      checkoutUrl: null,
      pixQrCode: data.publicInstructions.qrCode,
      pixCopyPaste: data.publicInstructions.copyPaste,
      pixExpiresAt: PIX_EXPIRES_AT,
      cardBrand: null,
      cardLast4: null,
      paidAt: null,
      failedAt: null,
    });

    const repeated = await provider.initiatePayment(pixInput());
    const repeatedData = expectPaymentSuccess(repeated, "PIX");
    expect(repeatedData.persistence.providerPaymentId).toBe(
      data.persistence.providerPaymentId,
    );
    expect(JSON.stringify(data.publicInstructions)).not.toContain(
      "providerPayload",
    );
    expectProviderResultHasNoSensitiveOutput(result, [
      "order-internal-pix",
      "establishment-internal",
      "Maria Cliente",
      "11999999999",
      "maria@example.com",
      "FAKE_PAYMENT_WEBHOOK_SECRET",
      VALID_FAKE_PAYMENT_ENV.FAKE_PAYMENT_WEBHOOK_SECRET,
    ]);
  });

  it("initiates hosted CARD checkout without accepting or exposing card data", async () => {
    const provider = createFakeDevPaymentProvider({
      hostedCheckoutOrigin: "https://payments.example.test/base/path",
    });

    const result = await provider.initiatePayment(cardInput());
    const data = expectPaymentSuccess(result, "CARD");

    expect(data.persistence).toEqual({
      method: "CARD",
      status: "PENDING",
      provider: PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
      providerPaymentId: expect.stringMatching(/^fake_dev_card_[a-f0-9]{24}$/u),
      providerStatus: "pending",
      providerPayload: null,
      checkoutUrl: data.publicInstructions.checkoutUrl,
      pixQrCode: null,
      pixCopyPaste: null,
      pixExpiresAt: null,
      cardBrand: null,
      cardLast4: null,
      paidAt: null,
      failedAt: null,
    });
    expect(data.publicInstructions).toEqual({
      method: "CARD",
      checkoutUrl: `https://payments.example.test/checkout/${data.persistence.providerPaymentId}`,
    });

    expect(JSON.stringify(data.publicInstructions)).not.toContain(
      "providerPayload",
    );
    expectProviderResultHasNoSensitiveOutput(result, [
      "order-internal-card",
      "establishment-internal",
      "João Cliente",
      "11988887777",
      "joao@example.com",
      "https://app.example.test/payment/success",
      "https://app.example.test/payment/cancel",
      "cardNumber",
      "cvv",
      "expiry",
      "token",
      "secret",
    ]);
  });

  it("returns typed failures for unsupported methods without partial DTOs or raw input echoes", async () => {
    const provider = createFakeDevPaymentProvider();
    const unsupportedInput: Record<string, unknown> = {
      ...cardInput(),
      method: "CASH",
      internalOrderId: "order-internal-secret",
      cardNumber: "4111111111111111",
      cvv: "123",
      expiry: "12/30",
      token: "tok_secret_should_not_leak",
      providerPayload: { secret: "payload-secret" },
    };
    const result = await provider.initiatePayment(unsupportedInput);

    expect(result).toEqual({
      ok: false,
      code: "PAYMENT_PROVIDER_UNSUPPORTED_METHOD",
      message: "Método de pagamento online não suportado.",
      retryable: false,
    });
    expect(result).not.toHaveProperty("data");
    expectProviderResultHasNoSensitiveOutput(result, [
      "order-internal-secret",
      "4111111111111111",
      "cvv",
      "12/30",
      "tok_secret_should_not_leak",
      "payload-secret",
    ]);
  });

  it("rejects invalid initiation inputs without producing partial or sensitive DTOs", async () => {
    const provider = createFakeDevPaymentProvider();

    for (const input of [
      { ...pixInput(), amountCents: 0 },
      { ...pixInput(), publicOrderCode: " " },
      { ...pixInput(), publicOrderCode: "PED-UNSAFE/<script>" },
      { ...pixInput(), expiresAt: REQUESTED_AT },
      {
        ...cardInput(),
        cardNumber: "4111111111111111",
        cvv: "123",
        expiry: "12/30",
        token: "tok_secret_should_not_leak",
      },
      { ...cardInput(), successUrl: "not-a-url" },
    ]) {
      const result = await provider.initiatePayment(input);

      expect(result).toEqual({
        ok: false,
        code: "PAYMENT_PROVIDER_INVALID_REQUEST",
        message: "Dados de pagamento online inválidos.",
        retryable: false,
      });
      expect(result).not.toHaveProperty("data");
      expectProviderResultHasNoSensitiveOutput(result, [
        "PED-UNSAFE/<script>",
        "4111111111111111",
        "cvv",
        "12/30",
        "tok_secret_should_not_leak",
        "not-a-url",
        "order-internal",
      ]);
    }
  });

  it("keeps factory config parsing lazy and returns redacted T01 config errors", async () => {
    const previousEnv = snapshotFakePaymentEnv();
    clearFakePaymentEnv();

    try {
      await expect(import("./index")).resolves.toMatchObject({
        createFakeDevPaymentProvider: expect.any(Function),
        getPaymentGatewayProvider: expect.any(Function),
      });

      const provider = getPaymentGatewayProvider({ env: VALID_FAKE_PAYMENT_ENV });
      expect(provider.provider).toBe(PAYMENT_GATEWAY_PROVIDER_FAKE_DEV);

      expect(() => getFakeDevPaymentProvider({ env: {} })).toThrow(
        PaymentConfigError,
      );

      const error = expectFactoryConfigError({
        FAKE_PAYMENT_PROVIDER: "disabled-secret-provider",
        FAKE_PAYMENT_WEBHOOK_SECRET: "weak-secret-value",
        FAKE_PAYMENT_APPROVAL_MODE: "automatic-secret-mode",
      });
      expect(error.keys).toEqual([
        "FAKE_PAYMENT_APPROVAL_MODE",
        "FAKE_PAYMENT_PROVIDER",
        "FAKE_PAYMENT_WEBHOOK_SECRET",
      ]);
      expect(JSON.stringify(error)).not.toContain("disabled-secret-provider");
      expect(JSON.stringify(error)).not.toContain("weak-secret-value");
      expect(JSON.stringify(error)).not.toContain("automatic-secret-mode");

      expect(() =>
        getPaymentGatewayProvider({
          provider: "real-gateway-secret-provider",
          env: VALID_FAKE_PAYMENT_ENV,
        }),
      ).toThrow(PaymentConfigError);
    } finally {
      restoreFakePaymentEnv(previousEnv);
    }
  });

  it("keeps checkout/order boundaries on the provider contract with lazy runtime composition", () => {
    for (const sourcePath of [
      "../orders/action-core.ts",
      "../orders/service-core.ts",
      "../orders/schemas.ts",
    ]) {
      const source = readFileSync(new URL(sourcePath, import.meta.url), "utf8");

      expect(source).not.toContain("fake-dev-provider");
      expect(source).not.toContain("getFakeDevPaymentProvider");
    }

    const serviceCoreSource = readFileSync(
      new URL("../orders/service-core.ts", import.meta.url),
      "utf8",
    );
    const runtimeServiceSource = readFileSync(
      new URL("../orders/service.ts", import.meta.url),
      "utf8",
    );
    const actionsSource = readFileSync(
      new URL("../orders/actions.ts", import.meta.url),
      "utf8",
    );

    expect(serviceCoreSource).toContain("PaymentGatewayProvider");
    expect(serviceCoreSource).toContain("getPaymentGatewayProvider");
    expect(runtimeServiceSource).toContain("getConfiguredPaymentGatewayProvider");
    expect(runtimeServiceSource).toContain(
      "getPaymentGatewayProvider: () => getConfiguredPaymentGatewayProvider()",
    );
    expect(runtimeServiceSource).toContain("generateInternalOrderId");
    expect(runtimeServiceSource).toContain("getAppBaseUrl: getCheckoutAppBaseUrl");
    expect(runtimeServiceSource).toContain(
      'const LOCAL_CHECKOUT_APP_BASE_URL = "http://localhost:3000";',
    );
    expect(runtimeServiceSource).toContain("env.NEXT_PUBLIC_APP_URL?.trim()");
    expect(runtimeServiceSource).toContain("return appBaseUrl.origin");
    expect(runtimeServiceSource).not.toContain(
      "getPaymentGatewayProvider: getConfiguredPaymentGatewayProvider",
    );
    expect(runtimeServiceSource).not.toContain("getFakeDevPaymentProvider");
    expect(actionsSource).toContain(
      "createCheckoutOrder: orderService.createCheckoutOrder",
    );
    expect(actionsSource).not.toContain(
      "createCheckoutOrder: orderService.createCashOrder",
    );
  });
});

function pixInput(
  overrides: Partial<PixPaymentInitiationInput> = {},
): PixPaymentInitiationInput {
  return {
    method: "PIX",
    internalOrderId: "order-internal-pix",
    publicOrderCode: "PED-20260428-PIX01",
    establishmentId: "establishment-internal",
    amountCents: 12_345,
    currency: "BRL",
    customer: {
      name: "Maria Cliente",
      phone: "11999999999",
      email: "maria@example.com",
    },
    requestedAt: REQUESTED_AT,
    expiresAt: PIX_EXPIRES_AT,
    ...overrides,
  };
}

function cardInput(
  overrides: Partial<HostedCardPaymentInitiationInput> = {},
): HostedCardPaymentInitiationInput {
  return {
    method: "CARD",
    internalOrderId: "order-internal-card",
    publicOrderCode: "PED-20260428-CARD1",
    establishmentId: "establishment-internal",
    amountCents: 9_990,
    currency: "BRL",
    customer: {
      name: "João Cliente",
      phone: "11988887777",
      email: "joao@example.com",
    },
    requestedAt: REQUESTED_AT,
    successUrl: "https://app.example.test/payment/success",
    cancelUrl: "https://app.example.test/payment/cancel",
    ...overrides,
  };
}

function expectPaymentSuccess<TMethod extends PaymentInitiationSuccessData["method"]>(
  result: PaymentInitiationResult,
  method: TMethod,
): Extract<PaymentInitiationSuccessData, { method: TMethod }> {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.message);
  }

  expect(result.data.method).toBe(method);

  if (result.data.method !== method) {
    throw new Error(`Expected ${method} payment initiation data.`);
  }

  return result.data as Extract<PaymentInitiationSuccessData, { method: TMethod }>;
}

function expectProviderResultHasNoSensitiveOutput(
  result: unknown,
  forbiddenFragments: readonly string[],
) {
  const serialized = JSON.stringify(result);

  for (const fragment of forbiddenFragments) {
    expect(serialized).not.toContain(fragment);
  }
}

function expectFactoryConfigError(env: PaymentConfigEnv) {
  try {
    getFakeDevPaymentProvider({ env });
  } catch (error) {
    expect(error).toBeInstanceOf(PaymentConfigError);
    return error as PaymentConfigError;
  }

  throw new Error("Expected fake/dev provider factory config error.");
}

function snapshotFakePaymentEnv() {
  return Object.fromEntries(
    Object.keys(VALID_FAKE_PAYMENT_ENV).map((key) => [key, process.env[key]]),
  ) as Record<keyof typeof VALID_FAKE_PAYMENT_ENV, string | undefined>;
}

function clearFakePaymentEnv() {
  for (const key of Object.keys(VALID_FAKE_PAYMENT_ENV)) {
    delete process.env[key];
  }
}

function restoreFakePaymentEnv(
  snapshot: Record<keyof typeof VALID_FAKE_PAYMENT_ENV, string | undefined>,
) {
  for (const key of Object.keys(snapshot) as Array<keyof typeof snapshot>) {
    const value = snapshot[key];

    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}
