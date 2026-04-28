import { describe, expect, it } from "vitest";

import type { FakeDevPaymentConfig } from "./config";
import {
  createFakeDevPaymentWebhookSignature,
  type FakeDevPaymentWebhookEvent,
} from "./webhook";
import {
  DEFAULT_FAKE_DEV_PAYMENT_WEBHOOK_MAX_BODY_BYTES,
  getPublicOrderTrackingPath,
  handleFakeDevPaymentWebhookRoute,
  type PaymentWebhookRouteService,
} from "./webhook-route-core";
import type { PaymentWebhookServiceResult } from "./webhook-service-core";

const WEBHOOK_SECRET = "0123456789abcdef0123456789abcdef";
const WRONG_WEBHOOK_SECRET = "wrong-webhook-secret-do-not-print-123456789";
const NOW = new Date("2026-04-28T16:10:00.000Z");
const TIMESTAMP = NOW.getTime().toString();
const OCCURRED_AT = "2026-04-28T16:09:30.000Z";
const PROVIDER_PAYMENT_ID = "fake_dev_pix_sensitive_provider_id";
const PUBLIC_CODE = "PED-20260428-SAFE01";
const RAW_DB_FAILURE =
  "DATABASE_URL PrismaClientKnownRequestError P2002 raw SQL stack provider-secret 4111111111111111";

const VALID_CONFIG = {
  provider: "fake-dev",
  enabled: true,
  approvalMode: "manual",
  webhookSecret: WEBHOOK_SECRET,
} as const satisfies FakeDevPaymentConfig;

describe("fake/dev payment webhook route core", () => {
  it("applies a valid signed event, revalidates the public tracking path and returns stable safe metadata", async () => {
    const rawBody = eventBody();
    const service = createRouteService({ result: serviceSuccess({ changed: true }) });
    const revalidatedPaths: string[] = [];

    const result = await handleFakeDevPaymentWebhookRoute({
      rawBody,
      headers: signedHeaders(rawBody),
      getConfig: () => VALID_CONFIG,
      service,
      now: () => NOW,
      revalidatePath: (path) => {
        revalidatedPaths.push(path);
      },
    });

    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        code: "PAYMENT_WEBHOOK_APPLIED",
        message: "Evento de pagamento aplicado.",
        data: {
          changed: true,
          paymentStatus: "PAID",
          publicCode: PUBLIC_CODE,
          revalidated: true,
        },
      },
    });
    expect(service.calls).toEqual([
      {
        provider: "fake-dev",
        eventId: "evt_fake_20260428_safe",
        providerPaymentId: PROVIDER_PAYMENT_ID,
        status: "approved",
        occurredAt: new Date(OCCURRED_AT),
      },
    ]);
    expect(revalidatedPaths).toEqual([`/pedido/${PUBLIC_CODE}`]);
    expectNoSensitiveOutput(result, defaultForbiddenFragments());
  });

  it("treats duplicate same-target deliveries as 200 no-op successes without revalidation", async () => {
    const rawBody = eventBody();
    const service = createRouteService({ result: serviceSuccess({ changed: false }) });
    const revalidatedPaths: string[] = [];

    const result = await handleFakeDevPaymentWebhookRoute({
      rawBody,
      headers: signedHeaders(rawBody),
      getConfig: () => VALID_CONFIG,
      service,
      now: () => NOW,
      revalidatePath: (path) => {
        revalidatedPaths.push(path);
      },
    });

    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        code: "PAYMENT_WEBHOOK_IDEMPOTENT_DUPLICATE",
        message: "Evento de pagamento já estava aplicado.",
        data: {
          changed: false,
          paymentStatus: "PAID",
          publicCode: PUBLIC_CODE,
          revalidated: false,
        },
      },
    });
    expect(revalidatedPaths).toEqual([]);
    expectNoSensitiveOutput(result, defaultForbiddenFragments());
  });

  it("returns a 200 revalidation warning when post-commit path revalidation throws", async () => {
    const rawBody = eventBody();

    const result = await handleFakeDevPaymentWebhookRoute({
      rawBody,
      headers: signedHeaders(rawBody),
      getConfig: () => VALID_CONFIG,
      service: createRouteService({ result: serviceSuccess({ changed: true }) }),
      now: () => NOW,
      revalidatePath: () => {
        throw new Error("next/cache revalidate failed with stack and SQL details");
      },
    });

    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        code: "PAYMENT_WEBHOOK_REVALIDATION_FAILED",
        message:
          "Evento de pagamento aplicado; a atualização pública será retomada automaticamente.",
        data: {
          changed: true,
          paymentStatus: "PAID",
          publicCode: PUBLIC_CODE,
          revalidated: false,
        },
      },
    });
    expectNoSensitiveOutput(result, [
      ...defaultForbiddenFragments(),
      "next/cache revalidate failed",
      "SQL",
      "stack",
    ]);
  });

  it("encodes only the service public code when building tracking revalidation paths", () => {
    expect(getPublicOrderTrackingPath("PED/2026 04?safe=1")).toBe(
      "/pedido/PED%2F2026%2004%3Fsafe%3D1",
    );
  });

  it("rejects oversized or malformed body sizes before config, signature or service work", async () => {
    const tinyRawBody = eventBody();
    const service = createRouteService({ result: serviceSuccess({ changed: true }) });
    const configCalls: string[] = [];

    const oversizedHeaderResult = await handleFakeDevPaymentWebhookRoute({
      rawBody: tinyRawBody,
      headers: new Headers({ "content-length": "5" }),
      getConfig: () => {
        configCalls.push("oversized-header");
        return VALID_CONFIG;
      },
      service,
      now: () => NOW,
      maxBodyBytes: 4,
    });
    const malformedHeaderResult = await handleFakeDevPaymentWebhookRoute({
      rawBody: tinyRawBody,
      headers: new Headers({ "content-length": "not-a-number" }),
      getConfig: () => {
        configCalls.push("malformed-header");
        return VALID_CONFIG;
      },
      service,
      now: () => NOW,
    });
    const oversizedActualBodyResult = await handleFakeDevPaymentWebhookRoute({
      rawBody: "é".repeat(DEFAULT_FAKE_DEV_PAYMENT_WEBHOOK_MAX_BODY_BYTES),
      headers: new Headers(),
      getConfig: () => {
        configCalls.push("oversized-body");
        return VALID_CONFIG;
      },
      service,
      now: () => NOW,
    });

    expect(oversizedHeaderResult).toEqual({
      status: 413,
      body: {
        ok: false,
        code: "PAYMENT_WEBHOOK_BODY_TOO_LARGE",
        message: "Corpo do webhook fake/dev excede o limite permitido.",
      },
    });
    expect(malformedHeaderResult).toEqual({
      status: 400,
      body: {
        ok: false,
        code: "PAYMENT_WEBHOOK_INVALID_BODY_SIZE",
        message: "Tamanho do webhook fake/dev inválido.",
      },
    });
    expect(oversizedActualBodyResult).toEqual(oversizedHeaderResult);
    expect(configCalls).toEqual([]);
    expect(service.calls).toEqual([]);
    expectNoSensitiveOutput(
      [oversizedHeaderResult, malformedHeaderResult, oversizedActualBodyResult],
      defaultForbiddenFragments(),
    );
  });

  it("maps invalid fake/dev config to 503 without leaking env keys or secret values", async () => {
    const rawBody = eventBody();

    const result = await handleFakeDevPaymentWebhookRoute({
      rawBody,
      headers: signedHeaders(rawBody),
      getConfig: () => {
        throw new Error(
          "FAKE_PAYMENT_WEBHOOK_SECRET weak-secret-do-not-print DATABASE_URL",
        );
      },
      service: createRouteService({ result: serviceSuccess({ changed: true }) }),
      now: () => NOW,
    });

    expect(result).toEqual({
      status: 503,
      body: {
        ok: false,
        code: "PAYMENT_WEBHOOK_CONFIG_INVALID",
        message: "Configuração de pagamento indisponível. Contate o suporte.",
      },
    });
    expectNoSensitiveOutput(result, [
      ...defaultForbiddenFragments(),
      "FAKE_PAYMENT_WEBHOOK_SECRET",
      "weak-secret-do-not-print",
      "DATABASE_URL",
    ]);
  });

  it("verifies signatures over the raw body before payload parsing or service calls", async () => {
    const malformedRawBody = "{not-json";
    const service = createRouteService({ result: serviceSuccess({ changed: true }) });

    const result = await handleFakeDevPaymentWebhookRoute({
      rawBody: malformedRawBody,
      headers: new Headers({
        "content-length": Buffer.byteLength(malformedRawBody, "utf8").toString(),
        "x-sextou-fake-payment-signature": `sha256=${"1".repeat(64)}`,
        "x-sextou-fake-payment-timestamp": TIMESTAMP,
      }),
      getConfig: () => VALID_CONFIG,
      service,
      now: () => NOW,
    });

    expect(result).toEqual({
      status: 401,
      body: {
        ok: false,
        code: "PAYMENT_WEBHOOK_INVALID_SIGNATURE",
        message: "Assinatura do webhook fake/dev inválida.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("PAYMENT_WEBHOOK_MALFORMED_JSON");
    expect(service.calls).toEqual([]);
  });

  it("maps missing, malformed, invalid and replayed signatures to stable 401 responses", async () => {
    const rawBody = eventBody();
    const scenarios = [
      {
        name: "missing signature",
        headers: new Headers({
          "x-sextou-fake-payment-timestamp": TIMESTAMP,
        }),
        code: "PAYMENT_WEBHOOK_MISSING_SIGNATURE",
      },
      {
        name: "missing timestamp",
        headers: new Headers({
          "x-sextou-fake-payment-signature": signedHeaders(rawBody).get(
            "x-sextou-fake-payment-signature",
          )!,
        }),
        code: "PAYMENT_WEBHOOK_MISSING_TIMESTAMP",
      },
      {
        name: "malformed signature",
        headers: signedHeaders(rawBody, { signature: "sha256=not-hex" }),
        code: "PAYMENT_WEBHOOK_MALFORMED_SIGNATURE",
      },
      {
        name: "invalid timestamp",
        headers: signedHeaders(rawBody, { timestamp: "not-ms" }),
        code: "PAYMENT_WEBHOOK_INVALID_TIMESTAMP",
      },
      {
        name: "replayed timestamp",
        headers: signedHeaders(rawBody, {
          timestamp: (NOW.getTime() - 300_001).toString(),
          secret: WEBHOOK_SECRET,
        }),
        code: "PAYMENT_WEBHOOK_TIMESTAMP_OUT_OF_RANGE",
      },
      {
        name: "wrong secret",
        headers: signedHeaders(rawBody, { secret: WRONG_WEBHOOK_SECRET }),
        code: "PAYMENT_WEBHOOK_INVALID_SIGNATURE",
      },
    ] as const;

    for (const scenario of scenarios) {
      const service = createRouteService({ result: serviceSuccess({ changed: true }) });
      const result = await handleFakeDevPaymentWebhookRoute({
        rawBody,
        headers: scenario.headers,
        getConfig: () => VALID_CONFIG,
        service,
        now: () => NOW,
      });

      expect(result, scenario.name).toEqual({
        status: 401,
        body: {
          ok: false,
          code: scenario.code,
          message: "Assinatura do webhook fake/dev inválida.",
        },
      });
      expect(service.calls, scenario.name).toEqual([]);
      expectNoSensitiveOutput(result, defaultForbiddenFragments());
    }
  });

  it("maps schema-invalid payloads after valid signatures to stable redacted 400 responses", async () => {
    const scenarios = [
      {
        name: "empty body",
        rawBody: "",
        code: "PAYMENT_WEBHOOK_EMPTY_BODY",
        forbidden: ["providerPaymentId", PROVIDER_PAYMENT_ID],
      },
      {
        name: "malformed JSON",
        rawBody: "{not-json",
        code: "PAYMENT_WEBHOOK_MALFORMED_JSON",
        forbidden: ["{not-json"],
      },
      {
        name: "extra card/provider payload fields",
        rawBody: eventBody({
          providerPayload: { token: "provider-payload-secret-do-not-print" },
          cardNumber: "4111111111111111",
          cvv: "123",
          expiry: "12/30",
          token: "tok_secret_should_not_leak",
        }),
        code: "PAYMENT_WEBHOOK_UNKNOWN_FIELD",
        forbidden: [
          "providerPayload",
          "provider-payload-secret-do-not-print",
          "cardNumber",
          "4111111111111111",
          "cvv",
          "123",
          "expiry",
          "12/30",
          "tok_secret_should_not_leak",
        ],
      },
      {
        name: "unknown provider payment id field missing",
        rawBody: eventBody({ providerPaymentId: "" }),
        code: "PAYMENT_WEBHOOK_MISSING_PROVIDER_PAYMENT_ID",
        forbidden: [PROVIDER_PAYMENT_ID],
      },
    ] as const;

    for (const scenario of scenarios) {
      const service = createRouteService({ result: serviceSuccess({ changed: true }) });
      const result = await handleFakeDevPaymentWebhookRoute({
        rawBody: scenario.rawBody,
        headers: signedHeaders(scenario.rawBody),
        getConfig: () => VALID_CONFIG,
        service,
        now: () => NOW,
      });

      expect(result, scenario.name).toEqual({
        status: 400,
        body: {
          ok: false,
          code: scenario.code,
          message: "Evento de pagamento fake/dev inválido.",
        },
      });
      expect(service.calls, scenario.name).toEqual([]);
      expectNoSensitiveOutput(result, [
        ...defaultForbiddenFragments(),
        ...scenario.forbidden,
      ]);
    }
  });

  it("maps service not-found, unsupported, conflict, stale and DB failures to honest statuses", async () => {
    const rawBody = eventBody();
    const scenarios = [
      {
        name: "not found",
        serviceResult: serviceFailure({
          code: "PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND",
          message: "Pagamento não encontrado para o webhook fake/dev.",
        }),
        status: 404,
      },
      {
        name: "unsupported payment",
        serviceResult: serviceFailure({
          code: "PAYMENT_WEBHOOK_PAYMENT_UNSUPPORTED",
          message: "Pagamento não suportado para webhook fake/dev.",
        }),
        status: 404,
      },
      {
        name: "terminal conflict",
        serviceResult: serviceFailure({
          code: "PAYMENT_WEBHOOK_TERMINAL_CONFLICT",
          message: "Pagamento já está em status terminal diferente.",
        }),
        status: 409,
      },
      {
        name: "stale update",
        serviceResult: serviceFailure({
          code: "PAYMENT_WEBHOOK_STALE_UPDATE",
          message: "Pagamento foi atualizado por outra operação. Tente novamente.",
          retryable: true,
        }),
        status: 409,
      },
      {
        name: "database error",
        serviceResult: serviceFailure({
          code: "PAYMENT_WEBHOOK_DATABASE_ERROR",
          message:
            "Não foi possível aplicar o webhook de pagamento agora. Tente novamente.",
          retryable: true,
        }),
        status: 500,
      },
    ] as const;

    for (const scenario of scenarios) {
      const result = await handleFakeDevPaymentWebhookRoute({
        rawBody,
        headers: signedHeaders(rawBody),
        getConfig: () => VALID_CONFIG,
        service: createRouteService({ result: scenario.serviceResult }),
        now: () => NOW,
      });

      expect(result, scenario.name).toEqual({
        status: scenario.status,
        body: {
          ok: false,
          code: scenario.serviceResult.code,
          message: scenario.serviceResult.message,
        },
      });
      expect(result.body).not.toHaveProperty("data");
      expect(result.body).not.toHaveProperty("retryable");
      expectNoSensitiveOutput(result, [
        ...defaultForbiddenFragments(),
        RAW_DB_FAILURE,
      ]);
    }
  });

  it("collapses thrown or malformed service outcomes to a redacted stable 500", async () => {
    const rawBody = eventBody();
    const thrownResult = await handleFakeDevPaymentWebhookRoute({
      rawBody,
      headers: signedHeaders(rawBody),
      getConfig: () => VALID_CONFIG,
      service: createRouteService({
        error: new Error(RAW_DB_FAILURE),
      }),
      now: () => NOW,
    });
    const malformedResult = await handleFakeDevPaymentWebhookRoute({
      rawBody,
      headers: signedHeaders(rawBody),
      getConfig: () => VALID_CONFIG,
      service: createRouteService({
        result: {
          ok: false,
          code: "PAYMENT_WEBHOOK_UNKNOWN_INTERNAL_CODE",
          message: RAW_DB_FAILURE,
          retryable: true,
        } as unknown as PaymentWebhookServiceResult,
      }),
      now: () => NOW,
    });

    for (const result of [thrownResult, malformedResult]) {
      expect(result).toEqual({
        status: 500,
        body: {
          ok: false,
          code: "PAYMENT_WEBHOOK_SERVICE_ERROR",
          message:
            "Não foi possível processar o webhook de pagamento agora. Tente novamente.",
        },
      });
      expectNoSensitiveOutput(result, [
        ...defaultForbiddenFragments(),
        RAW_DB_FAILURE,
        "PAYMENT_WEBHOOK_UNKNOWN_INTERNAL_CODE",
      ]);
    }
  });
});

function eventBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    provider: "fake-dev",
    eventId: "evt_fake_20260428_safe",
    providerPaymentId: PROVIDER_PAYMENT_ID,
    status: "approved",
    occurredAt: OCCURRED_AT,
    ...overrides,
  });
}

function signedHeaders(
  rawBody: string,
  options: {
    timestamp?: string;
    signature?: string;
    secret?: string;
  } = {},
) {
  const timestamp = options.timestamp ?? TIMESTAMP;
  const signature =
    options.signature ??
    createFakeDevPaymentWebhookSignature({
      rawBody,
      timestamp,
      secret: options.secret ?? WEBHOOK_SECRET,
    });

  return new Headers({
    "content-length": Buffer.byteLength(rawBody, "utf8").toString(),
    "x-sextou-fake-payment-signature": signature,
    "x-sextou-fake-payment-timestamp": timestamp,
  });
}

function serviceSuccess({ changed }: { changed: boolean }): PaymentWebhookServiceResult {
  return {
    ok: true,
    code: changed
      ? "PAYMENT_WEBHOOK_APPLIED"
      : "PAYMENT_WEBHOOK_IDEMPOTENT_DUPLICATE",
    message: changed
      ? "Evento de pagamento aplicado."
      : "Evento de pagamento já estava aplicado.",
    retryable: false,
    data: {
      changed,
      paymentStatus: "PAID",
      publicCode: PUBLIC_CODE,
    },
  };
}

function serviceFailure({
  code,
  message,
  retryable = false,
}: Extract<PaymentWebhookServiceResult, { ok: false }>): PaymentWebhookServiceResult {
  return {
    ok: false,
    code,
    message,
    retryable,
  };
}

function createRouteService({
  result,
  error,
}: {
  result?: PaymentWebhookServiceResult;
  error?: Error;
}): PaymentWebhookRouteService & { calls: FakeDevPaymentWebhookEvent[] } {
  const calls: FakeDevPaymentWebhookEvent[] = [];

  return {
    calls,
    async applyFakeDevPaymentWebhookEvent(event) {
      calls.push(event);

      if (error) {
        throw error;
      }

      return result ?? serviceSuccess({ changed: true });
    },
  };
}

function defaultForbiddenFragments() {
  return [
    WEBHOOK_SECRET,
    WRONG_WEBHOOK_SECRET,
    PROVIDER_PAYMENT_ID,
    "providerPayload",
    "provider-payload-secret-do-not-print",
    "cardNumber",
    "4111111111111111",
    "cardBrand",
    "cardLast4",
    "cvv",
    "expiry",
    "token",
    "tok_secret_should_not_leak",
    "expectedSignature",
    "providedSignature",
    "sha256=",
    "DATABASE_URL",
    "PrismaClientKnownRequestError",
    "P2002",
    "raw SQL",
  ];
}

function expectNoSensitiveOutput(value: unknown, forbiddenFragments: readonly string[]) {
  const serialized = JSON.stringify(value);

  for (const fragment of forbiddenFragments) {
    expect(serialized).not.toContain(fragment);
  }
}
