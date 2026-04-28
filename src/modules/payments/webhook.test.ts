import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  FAKE_DEV_PAYMENT_WEBHOOK_MAX_TIMESTAMP_SKEW_MS,
  FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_HEADER,
  FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_PREFIX,
  FAKE_DEV_PAYMENT_WEBHOOK_STATUS_TO_PAYMENT_STATUS,
  FAKE_DEV_PAYMENT_WEBHOOK_TIMESTAMP_HEADER,
  createFakeDevPaymentWebhookSignature,
  getFakeDevPaymentWebhookPaymentStatus,
  safeParseFakeDevPaymentWebhookEvent,
  verifyAndParseFakeDevPaymentWebhookEvent,
  verifyFakeDevPaymentWebhookSignature,
  type FakeDevPaymentWebhookParseFailureCode,
  type FakeDevPaymentWebhookSignatureFailureCode,
} from "./webhook";

const WEBHOOK_SECRET = "fake-webhook-secret-do-not-print-1234567890";
const WRONG_WEBHOOK_SECRET = "wrong-webhook-secret-do-not-print-123456789";
const NOW = new Date("2026-04-28T16:00:00.000Z");
const TIMESTAMP = NOW.getTime().toString();
const OCCURRED_AT = "2026-04-28T15:59:30.000Z";

describe("fake/dev payment webhook contract", () => {
  it("exports the fake/dev webhook header constants and replay skew", () => {
    expect(FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_HEADER).toBe(
      "x-sextou-fake-payment-signature",
    );
    expect(FAKE_DEV_PAYMENT_WEBHOOK_TIMESTAMP_HEADER).toBe(
      "x-sextou-fake-payment-timestamp",
    );
    expect(FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_PREFIX).toBe("sha256=");
    expect(FAKE_DEV_PAYMENT_WEBHOOK_MAX_TIMESTAMP_SKEW_MS).toBe(300_000);
  });

  it("parses valid approved, failed, and canceled events into domain statuses", () => {
    const expectedDomainStatus = {
      approved: "PAID",
      failed: "FAILED",
      canceled: "CANCELED",
    } as const;

    for (const webhookStatus of ["approved", "failed", "canceled"] as const) {
      const domainStatus = expectedDomainStatus[webhookStatus];
      const result = safeParseFakeDevPaymentWebhookEvent(
        eventBody({ status: webhookStatus }),
      );

      expect(result.ok).toBe(true);

      if (!result.ok) {
        throw new Error(result.message);
      }

      expect(result.event).toEqual({
        provider: "fake-dev",
        eventId: "evt_fake_20260428_approved",
        providerPaymentId: "fake_dev_pix_0123456789abcdef01234567",
        status: webhookStatus,
        occurredAt: new Date(OCCURRED_AT),
      });
      expect(getFakeDevPaymentWebhookPaymentStatus(result.event.status)).toBe(
        domainStatus,
      );
      expect(FAKE_DEV_PAYMENT_WEBHOOK_STATUS_TO_PAYMENT_STATUS[webhookStatus]).toBe(
        domainStatus,
      );
    }
  });

  it("signs and verifies raw body bytes over timestamp.rawBody before parsing", () => {
    const rawBody = eventBody({ status: "approved" });
    const signature = createFakeDevPaymentWebhookSignature({
      rawBody,
      timestamp: TIMESTAMP,
      secret: WEBHOOK_SECRET,
    });

    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/u);
    expect(
      verifyFakeDevPaymentWebhookSignature({
        rawBody,
        timestamp: TIMESTAMP,
        signature,
        secret: WEBHOOK_SECRET,
        now: NOW,
      }),
    ).toEqual({ ok: true });
    expect(
      verifyAndParseFakeDevPaymentWebhookEvent({
        rawBody,
        timestamp: TIMESTAMP,
        signature,
        secret: WEBHOOK_SECRET,
        now: NOW,
      }),
    ).toMatchObject({
      ok: true,
      event: {
        provider: "fake-dev",
        status: "approved",
      },
    });
  });

  it("returns payload failure codes for malformed or unsupported event JSON", () => {
    expectParseFailure("", ["PAYMENT_WEBHOOK_EMPTY_BODY"]);
    expectParseFailure("   ", ["PAYMENT_WEBHOOK_EMPTY_BODY"]);
    expectParseFailure("not-json", ["PAYMENT_WEBHOOK_MALFORMED_JSON"]);
    expectParseFailure("[]", ["PAYMENT_WEBHOOK_INVALID_PAYLOAD"]);
    expectParseFailure("{}", [
      "PAYMENT_WEBHOOK_UNKNOWN_PROVIDER",
      "PAYMENT_WEBHOOK_UNSUPPORTED_STATUS",
      "PAYMENT_WEBHOOK_MISSING_EVENT_ID",
      "PAYMENT_WEBHOOK_MISSING_PROVIDER_PAYMENT_ID",
      "PAYMENT_WEBHOOK_INVALID_OCCURRED_AT",
    ]);
    expectParseFailure(eventBody({ provider: "real-gateway" }), [
      "PAYMENT_WEBHOOK_UNKNOWN_PROVIDER",
    ]);
    expectParseFailure(eventBody({ status: "pending" }), [
      "PAYMENT_WEBHOOK_UNSUPPORTED_STATUS",
    ]);
    expectParseFailure(eventBody({ eventId: "" }), [
      "PAYMENT_WEBHOOK_MISSING_EVENT_ID",
    ]);
    expectParseFailure(eventBody({ providerPaymentId: "" }), [
      "PAYMENT_WEBHOOK_MISSING_PROVIDER_PAYMENT_ID",
    ]);
    expectParseFailure(eventBody({ occurredAt: "not-a-date" }), [
      "PAYMENT_WEBHOOK_INVALID_OCCURRED_AT",
    ]);
    expectParseFailure(eventBody({ occurredAt: "2026-02-31T15:59:30.000Z" }), [
      "PAYMENT_WEBHOOK_INVALID_OCCURRED_AT",
    ]);
  });

  it("rejects extra webhook payload keys without leaking their names or values", () => {
    const providerPayloadSecret = "provider-payload-secret-do-not-print";
    const result = expectParseFailure(
      eventBody({
        providerPayload: { secret: providerPayloadSecret },
        cardNumber: "4111111111111111",
        cvv: "123",
        token: "tok_secret_should_not_leak",
      }),
      ["PAYMENT_WEBHOOK_UNKNOWN_FIELD"],
    );

    expectNoSensitiveOutput(result, [
      "providerPayload",
      providerPayloadSecret,
      "cardNumber",
      "4111111111111111",
      "cvv",
      "123",
      "tok_secret_should_not_leak",
    ]);
  });

  it("returns signature failure codes for missing, malformed, invalid, and replayed signatures", () => {
    const rawBody = eventBody({ status: "approved" });
    const signature = createFakeDevPaymentWebhookSignature({
      rawBody,
      timestamp: TIMESTAMP,
      secret: WEBHOOK_SECRET,
    });

    expectSignatureFailure({ rawBody, signature: null }, [
      "PAYMENT_WEBHOOK_MISSING_SIGNATURE",
    ]);
    expectSignatureFailure({ rawBody, signature, timestamp: null }, [
      "PAYMENT_WEBHOOK_MISSING_TIMESTAMP",
    ]);
    expectSignatureFailure({ rawBody, signature, timestamp: "not-ms" }, [
      "PAYMENT_WEBHOOK_INVALID_TIMESTAMP",
    ]);
    expectSignatureFailure({ rawBody, signature: `sha1=${"a".repeat(64)}` }, [
      "PAYMENT_WEBHOOK_MALFORMED_SIGNATURE",
    ]);
    expectSignatureFailure({ rawBody, signature: "sha256=not-hex" }, [
      "PAYMENT_WEBHOOK_MALFORMED_SIGNATURE",
    ]);
    expectSignatureFailure(
      {
        rawBody,
        signature: createFakeDevPaymentWebhookSignature({
          rawBody,
          timestamp: staleTimestamp(),
          secret: WEBHOOK_SECRET,
        }),
        timestamp: staleTimestamp(),
      },
      ["PAYMENT_WEBHOOK_TIMESTAMP_OUT_OF_RANGE"],
    );
    expectSignatureFailure(
      {
        rawBody,
        signature: createFakeDevPaymentWebhookSignature({
          rawBody,
          timestamp: futureTimestamp(),
          secret: WEBHOOK_SECRET,
        }),
        timestamp: futureTimestamp(),
      },
      ["PAYMENT_WEBHOOK_TIMESTAMP_OUT_OF_RANGE"],
    );
    expectSignatureFailure(
      {
        rawBody,
        signature: createFakeDevPaymentWebhookSignature({
          rawBody,
          timestamp: TIMESTAMP,
          secret: WRONG_WEBHOOK_SECRET,
        }),
      },
      ["PAYMENT_WEBHOOK_INVALID_SIGNATURE"],
    );
    expectSignatureFailure(
      {
        rawBody,
        signature: createWrongOrderSignature(rawBody, TIMESTAMP, WEBHOOK_SECRET),
      },
      ["PAYMENT_WEBHOOK_INVALID_SIGNATURE"],
    );
  });

  it("uses timing-safe comparison for equal-length signature mismatches without throwing", () => {
    const rawBody = eventBody({ status: "approved" });
    const wrongButWellFormedSignature = `sha256=${"0".repeat(64)}`;

    expect(() =>
      verifyFakeDevPaymentWebhookSignature({
        rawBody,
        timestamp: TIMESTAMP,
        signature: wrongButWellFormedSignature,
        secret: WEBHOOK_SECRET,
        now: NOW,
      }),
    ).not.toThrow();
    expectSignatureFailure(
      { rawBody, signature: wrongButWellFormedSignature },
      ["PAYMENT_WEBHOOK_INVALID_SIGNATURE"],
    );
  });

  it("does not parse malformed JSON until a valid signature has been verified", () => {
    const malformedRawBody = "{not-json";
    const invalidSignature = `sha256=${"1".repeat(64)}`;

    const result = verifyAndParseFakeDevPaymentWebhookEvent({
      rawBody: malformedRawBody,
      timestamp: TIMESTAMP,
      signature: invalidSignature,
      secret: WEBHOOK_SECRET,
      now: NOW,
    });

    expect(result).toMatchObject({
      ok: false,
      stage: "signature",
      code: "PAYMENT_WEBHOOK_INVALID_SIGNATURE",
    });
    expect(JSON.stringify(result)).not.toContain("PAYMENT_WEBHOOK_MALFORMED_JSON");
  });

  it("redacts secrets, signatures, and raw payload fragments from failures", () => {
    const rawBody = eventBody({
      eventId: "internal-order-id-do-not-print",
      providerPaymentId: "fake_dev_pix_sensitive_provider_id",
      status: "approved",
    });
    const providedSignature = createFakeDevPaymentWebhookSignature({
      rawBody,
      timestamp: TIMESTAMP,
      secret: WRONG_WEBHOOK_SECRET,
    });
    const expectedSignature = createFakeDevPaymentWebhookSignature({
      rawBody,
      timestamp: TIMESTAMP,
      secret: WEBHOOK_SECRET,
    });
    const signatureFailure = verifyFakeDevPaymentWebhookSignature({
      rawBody,
      timestamp: TIMESTAMP,
      signature: providedSignature,
      secret: WEBHOOK_SECRET,
      now: NOW,
    });

    expect(signatureFailure.ok).toBe(false);
    expectNoSensitiveOutput(signatureFailure, [
      WEBHOOK_SECRET,
      WRONG_WEBHOOK_SECRET,
      providedSignature,
      providedSignature.slice(FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_PREFIX.length),
      expectedSignature,
      expectedSignature.slice(FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_PREFIX.length),
      "internal-order-id-do-not-print",
      "fake_dev_pix_sensitive_provider_id",
    ]);

    const payloadFailure = expectParseFailure(
      eventBody({
        eventId: "internal-order-id-do-not-print",
        providerPaymentId: "fake_dev_pix_sensitive_provider_id",
        status: "pending",
      }),
      ["PAYMENT_WEBHOOK_UNSUPPORTED_STATUS"],
    );

    expectNoSensitiveOutput(payloadFailure, [
      "internal-order-id-do-not-print",
      "fake_dev_pix_sensitive_provider_id",
      "pending",
    ]);
  });
});

function eventBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    provider: "fake-dev",
    eventId: "evt_fake_20260428_approved",
    providerPaymentId: "fake_dev_pix_0123456789abcdef01234567",
    status: "approved",
    occurredAt: OCCURRED_AT,
    ...overrides,
  });
}

function expectParseFailure(
  rawBody: string,
  expectedCodes: readonly FakeDevPaymentWebhookParseFailureCode[],
) {
  const result = safeParseFakeDevPaymentWebhookEvent(rawBody);

  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected fake/dev webhook payload to be invalid.");
  }

  expect(result.resultCodes).toEqual(expectedCodes);
  expect(result.issues.map((issue) => issue.code)).toEqual(
    expect.arrayContaining([...expectedCodes]),
  );
  expect(result.issues).toHaveLength(expectedCodes.length);
  expect(result.message).toBe("Evento de pagamento fake/dev inválido.");
  expect(result).not.toHaveProperty("event");

  return result;
}

function expectSignatureFailure(
  input: {
    rawBody: string;
    signature?: string | null;
    timestamp?: string | null;
  },
  expectedCodes: readonly FakeDevPaymentWebhookSignatureFailureCode[],
) {
  const result = verifyFakeDevPaymentWebhookSignature({
    rawBody: input.rawBody,
    timestamp: input.timestamp === undefined ? TIMESTAMP : input.timestamp,
    signature: input.signature === undefined ? undefined : input.signature,
    secret: WEBHOOK_SECRET,
    now: NOW,
  });

  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected fake/dev webhook signature to be invalid.");
  }

  expect([result.code]).toEqual(expectedCodes);
  expect(result.message).toBe("Assinatura do webhook fake/dev inválida.");
  expect(result).not.toHaveProperty("expectedSignature");
  expect(result).not.toHaveProperty("providedSignature");

  return result;
}

function staleTimestamp() {
  return (
    NOW.getTime() -
    FAKE_DEV_PAYMENT_WEBHOOK_MAX_TIMESTAMP_SKEW_MS -
    1
  ).toString();
}

function futureTimestamp() {
  return (
    NOW.getTime() +
    FAKE_DEV_PAYMENT_WEBHOOK_MAX_TIMESTAMP_SKEW_MS +
    1
  ).toString();
}

function createWrongOrderSignature(
  rawBody: string,
  timestamp: string,
  secret: string,
) {
  const digest = createHmac("sha256", secret)
    .update(`${rawBody}.${timestamp}`, "utf8")
    .digest("hex");

  return `${FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_PREFIX}${digest}`;
}

function expectNoSensitiveOutput(value: unknown, forbiddenFragments: readonly string[]) {
  const serialized = JSON.stringify(value);

  for (const fragment of forbiddenFragments) {
    expect(serialized).not.toContain(fragment);
  }
}
