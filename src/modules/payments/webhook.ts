import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import {
  PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
  type PaymentPersistenceStatus,
} from "./types";

export const FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_HEADER =
  "x-sextou-fake-payment-signature" as const;
export const FAKE_DEV_PAYMENT_WEBHOOK_TIMESTAMP_HEADER =
  "x-sextou-fake-payment-timestamp" as const;
export const FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_PREFIX = "sha256=" as const;

/**
 * Fake/dev webhooks use Unix epoch milliseconds and reject timestamps more than
 * five minutes away from the verifier clock to limit replay windows.
 */
export const FAKE_DEV_PAYMENT_WEBHOOK_MAX_TIMESTAMP_SKEW_MS =
  5 * 60 * 1000;

export const FAKE_DEV_PAYMENT_WEBHOOK_EVENT_STATUSES = [
  "approved",
  "failed",
  "canceled",
] as const;

export const FAKE_DEV_PAYMENT_WEBHOOK_STATUS_TO_PAYMENT_STATUS = {
  approved: "PAID",
  failed: "FAILED",
  canceled: "CANCELED",
} as const satisfies Record<
  FakeDevPaymentWebhookEventStatus,
  PaymentPersistenceStatus
>;

export const FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_FAILURE_CODES = [
  "PAYMENT_WEBHOOK_MISSING_SIGNATURE",
  "PAYMENT_WEBHOOK_MISSING_TIMESTAMP",
  "PAYMENT_WEBHOOK_MALFORMED_SIGNATURE",
  "PAYMENT_WEBHOOK_INVALID_TIMESTAMP",
  "PAYMENT_WEBHOOK_TIMESTAMP_OUT_OF_RANGE",
  "PAYMENT_WEBHOOK_INVALID_SIGNATURE",
] as const;

export const FAKE_DEV_PAYMENT_WEBHOOK_PARSE_FAILURE_CODES = [
  "PAYMENT_WEBHOOK_EMPTY_BODY",
  "PAYMENT_WEBHOOK_MALFORMED_JSON",
  "PAYMENT_WEBHOOK_UNKNOWN_PROVIDER",
  "PAYMENT_WEBHOOK_UNSUPPORTED_STATUS",
  "PAYMENT_WEBHOOK_MISSING_EVENT_ID",
  "PAYMENT_WEBHOOK_MISSING_PROVIDER_PAYMENT_ID",
  "PAYMENT_WEBHOOK_INVALID_OCCURRED_AT",
  "PAYMENT_WEBHOOK_UNKNOWN_FIELD",
  "PAYMENT_WEBHOOK_INVALID_PAYLOAD",
] as const;

const FAKE_DEV_PAYMENT_WEBHOOK_EVENT_FIELDS = [
  "provider",
  "eventId",
  "providerPaymentId",
  "status",
  "occurredAt",
] as const;

const WEBHOOK_SIGNATURE_DIGEST_PATTERN = /^[a-f0-9]{64}$/iu;
const WEBHOOK_TIMESTAMP_PATTERN = /^\d{13}$/u;
const ISO_INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/u;
const GENERIC_SIGNATURE_FAILURE_MESSAGE =
  "Assinatura do webhook fake/dev inválida.";
const GENERIC_PAYLOAD_FAILURE_MESSAGE = "Evento de pagamento fake/dev inválido.";

const webhookParseFailureCodeSet: ReadonlySet<string> = new Set(
  FAKE_DEV_PAYMENT_WEBHOOK_PARSE_FAILURE_CODES,
);
const webhookEventFieldSet: ReadonlySet<string> = new Set(
  FAKE_DEV_PAYMENT_WEBHOOK_EVENT_FIELDS,
);

const webhookIdSchema = (message: FakeDevPaymentWebhookParseFailureCode) =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .max(128, message);

const occurredAtSchema = z
  .string({ error: "PAYMENT_WEBHOOK_INVALID_OCCURRED_AT" })
  .trim()
  .transform((value, context) => {
    const parsedDate = parseIsoInstant(value);

    if (!parsedDate) {
      context.addIssue({
        code: "custom",
        message: "PAYMENT_WEBHOOK_INVALID_OCCURRED_AT",
      });
      return z.NEVER;
    }

    return parsedDate;
  });

export const fakeDevPaymentWebhookEventSchema = z
  .object({
    provider: z.literal(PAYMENT_GATEWAY_PROVIDER_FAKE_DEV, {
      error: "PAYMENT_WEBHOOK_UNKNOWN_PROVIDER",
    }),
    eventId: webhookIdSchema("PAYMENT_WEBHOOK_MISSING_EVENT_ID"),
    providerPaymentId: webhookIdSchema(
      "PAYMENT_WEBHOOK_MISSING_PROVIDER_PAYMENT_ID",
    ),
    status: z.enum(FAKE_DEV_PAYMENT_WEBHOOK_EVENT_STATUSES, {
      error: "PAYMENT_WEBHOOK_UNSUPPORTED_STATUS",
    }),
    occurredAt: occurredAtSchema,
  })
  .strict();

export type FakeDevPaymentWebhookEventStatus =
  (typeof FAKE_DEV_PAYMENT_WEBHOOK_EVENT_STATUSES)[number];
export type FakeDevPaymentWebhookEvent = z.infer<
  typeof fakeDevPaymentWebhookEventSchema
>;
export type FakeDevPaymentWebhookEventField =
  (typeof FAKE_DEV_PAYMENT_WEBHOOK_EVENT_FIELDS)[number];
export type FakeDevPaymentWebhookSignatureFailureCode =
  (typeof FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_FAILURE_CODES)[number];
export type FakeDevPaymentWebhookParseFailureCode =
  (typeof FAKE_DEV_PAYMENT_WEBHOOK_PARSE_FAILURE_CODES)[number];

export type FakeDevPaymentWebhookSignatureVerificationFailure = {
  ok: false;
  code: FakeDevPaymentWebhookSignatureFailureCode;
  message: string;
  retryable: false;
};

export type FakeDevPaymentWebhookSignatureVerificationResult =
  | { ok: true }
  | FakeDevPaymentWebhookSignatureVerificationFailure;

export type FakeDevPaymentWebhookParseIssue = {
  code: FakeDevPaymentWebhookParseFailureCode;
  field?: FakeDevPaymentWebhookEventField;
};

export type FakeDevPaymentWebhookParseFailure = {
  ok: false;
  code: FakeDevPaymentWebhookParseFailureCode;
  message: string;
  retryable: false;
  issues: readonly FakeDevPaymentWebhookParseIssue[];
  resultCodes: readonly FakeDevPaymentWebhookParseFailureCode[];
};

export type FakeDevPaymentWebhookParseResult =
  | { ok: true; event: FakeDevPaymentWebhookEvent }
  | FakeDevPaymentWebhookParseFailure;

export type FakeDevPaymentWebhookVerifiedEventFailure =
  | (FakeDevPaymentWebhookSignatureVerificationFailure & {
      stage: "signature";
    })
  | (FakeDevPaymentWebhookParseFailure & {
      stage: "payload";
    });

export type FakeDevPaymentWebhookVerifiedEventResult =
  | { ok: true; event: FakeDevPaymentWebhookEvent }
  | FakeDevPaymentWebhookVerifiedEventFailure;

export type FakeDevPaymentWebhookSignatureInput = {
  rawBody: string | Buffer;
  timestamp: string | number;
  secret: string;
};

export type FakeDevPaymentWebhookSignatureVerificationInput = {
  rawBody: string | Buffer;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  secret: string;
  now?: Date;
  maxTimestampSkewMs?: number;
};

export type FakeDevPaymentWebhookVerifyAndParseInput =
  FakeDevPaymentWebhookSignatureVerificationInput;

export function createFakeDevPaymentWebhookSignature({
  rawBody,
  timestamp,
  secret,
}: FakeDevPaymentWebhookSignatureInput) {
  const normalizedTimestamp = normalizeTimestampForSigning(timestamp);

  return `${FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_PREFIX}${createFakeDevPaymentWebhookSignatureDigest(
    {
      rawBody,
      timestamp: normalizedTimestamp,
      secret,
    },
  )}`;
}

export function verifyFakeDevPaymentWebhookSignature({
  rawBody,
  timestamp,
  signature,
  secret,
  now = new Date(),
  maxTimestampSkewMs = FAKE_DEV_PAYMENT_WEBHOOK_MAX_TIMESTAMP_SKEW_MS,
}: FakeDevPaymentWebhookSignatureVerificationInput): FakeDevPaymentWebhookSignatureVerificationResult {
  const normalizedSignature = signature?.trim() ?? "";
  const normalizedTimestamp = timestamp?.trim() ?? "";

  if (normalizedSignature.length === 0) {
    return signatureFailure("PAYMENT_WEBHOOK_MISSING_SIGNATURE");
  }

  if (normalizedTimestamp.length === 0) {
    return signatureFailure("PAYMENT_WEBHOOK_MISSING_TIMESTAMP");
  }

  const timestampMs = parseWebhookTimestamp(normalizedTimestamp);

  if (timestampMs === null) {
    return signatureFailure("PAYMENT_WEBHOOK_INVALID_TIMESTAMP");
  }

  const verifierClockMs = now.getTime();
  const allowedSkewMs = Math.max(0, maxTimestampSkewMs);

  if (
    Number.isNaN(verifierClockMs) ||
    Math.abs(verifierClockMs - timestampMs) > allowedSkewMs
  ) {
    return signatureFailure("PAYMENT_WEBHOOK_TIMESTAMP_OUT_OF_RANGE");
  }

  if (!normalizedSignature.startsWith(FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_PREFIX)) {
    return signatureFailure("PAYMENT_WEBHOOK_MALFORMED_SIGNATURE");
  }

  const providedDigest = normalizedSignature.slice(
    FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_PREFIX.length,
  );

  if (!WEBHOOK_SIGNATURE_DIGEST_PATTERN.test(providedDigest)) {
    return signatureFailure("PAYMENT_WEBHOOK_MALFORMED_SIGNATURE");
  }

  const expectedDigest = createFakeDevPaymentWebhookSignatureDigest({
    rawBody,
    timestamp: normalizedTimestamp,
    secret,
  });
  const providedDigestBuffer = Buffer.from(providedDigest, "hex");
  const expectedDigestBuffer = Buffer.from(expectedDigest, "hex");
  const signaturesMatch =
    providedDigestBuffer.length === expectedDigestBuffer.length &&
    timingSafeEqual(providedDigestBuffer, expectedDigestBuffer);

  if (!signaturesMatch) {
    return signatureFailure("PAYMENT_WEBHOOK_INVALID_SIGNATURE");
  }

  return { ok: true };
}

export function safeParseFakeDevPaymentWebhookEvent(
  rawBody: string | Buffer,
): FakeDevPaymentWebhookParseResult {
  const rawBodyText = rawBodyToString(rawBody);

  if (rawBodyText.trim().length === 0) {
    return parseFailure([{ code: "PAYMENT_WEBHOOK_EMPTY_BODY" }]);
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBodyText);
  } catch {
    return parseFailure([{ code: "PAYMENT_WEBHOOK_MALFORMED_JSON" }]);
  }

  const parsed = fakeDevPaymentWebhookEventSchema.safeParse(payload);

  if (!parsed.success) {
    return parseFailure(formatWebhookParseIssues(parsed.error));
  }

  return { ok: true, event: parsed.data };
}

export function verifyAndParseFakeDevPaymentWebhookEvent(
  input: FakeDevPaymentWebhookVerifyAndParseInput,
): FakeDevPaymentWebhookVerifiedEventResult {
  const signatureResult = verifyFakeDevPaymentWebhookSignature(input);

  if (!signatureResult.ok) {
    return { ...signatureResult, stage: "signature" };
  }

  const parseResult = safeParseFakeDevPaymentWebhookEvent(input.rawBody);

  if (!parseResult.ok) {
    return { ...parseResult, stage: "payload" };
  }

  return parseResult;
}

export function getFakeDevPaymentWebhookPaymentStatus(
  status: FakeDevPaymentWebhookEventStatus,
) {
  return FAKE_DEV_PAYMENT_WEBHOOK_STATUS_TO_PAYMENT_STATUS[status];
}

function createFakeDevPaymentWebhookSignatureDigest({
  rawBody,
  timestamp,
  secret,
}: FakeDevPaymentWebhookSignatureInput & { timestamp: string }) {
  const hmac = createHmac("sha256", secret);

  hmac.update(`${timestamp}.`, "utf8");

  if (Buffer.isBuffer(rawBody)) {
    hmac.update(rawBody);
  } else {
    hmac.update(rawBody, "utf8");
  }

  return hmac.digest("hex");
}

function normalizeTimestampForSigning(timestamp: string | number) {
  return typeof timestamp === "number" ? Math.trunc(timestamp).toString() : timestamp.trim();
}

function parseWebhookTimestamp(timestamp: string) {
  if (!WEBHOOK_TIMESTAMP_PATTERN.test(timestamp)) {
    return null;
  }

  const timestampMs = Number(timestamp);

  if (!Number.isSafeInteger(timestampMs) || timestampMs <= 0) {
    return null;
  }

  return timestampMs;
}

function parseIsoInstant(value: string) {
  const match = ISO_INSTANT_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] ?? "0").padEnd(3, "0"));
  const date = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond),
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }

  return date;
}

function rawBodyToString(rawBody: string | Buffer) {
  return Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
}

function signatureFailure(
  code: FakeDevPaymentWebhookSignatureFailureCode,
): FakeDevPaymentWebhookSignatureVerificationFailure {
  return {
    ok: false,
    code,
    message: GENERIC_SIGNATURE_FAILURE_MESSAGE,
    retryable: false,
  };
}

function parseFailure(
  issues: readonly FakeDevPaymentWebhookParseIssue[],
): FakeDevPaymentWebhookParseFailure {
  const normalizedIssues = normalizeWebhookParseIssues(issues);
  const resultCodes = normalizeWebhookParseResultCodes(normalizedIssues);

  return {
    ok: false,
    code: resultCodes[0] ?? "PAYMENT_WEBHOOK_INVALID_PAYLOAD",
    message: GENERIC_PAYLOAD_FAILURE_MESSAGE,
    retryable: false,
    issues: normalizedIssues,
    resultCodes,
  };
}

function formatWebhookParseIssues(error: z.ZodError) {
  const issues: FakeDevPaymentWebhookParseIssue[] = [];

  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      issues.push({ code: "PAYMENT_WEBHOOK_UNKNOWN_FIELD" });
      continue;
    }

    const field = getKnownWebhookEventField(issue.path[0]);
    const issueCode = isWebhookParseFailureCode(issue.message)
      ? issue.message
      : getWebhookParseFailureCodeForField(field);

    issues.push(
      field ? { code: issueCode, field } : { code: issueCode },
    );
  }

  if (issues.length > 0) {
    return issues;
  }

  const fallbackIssues: FakeDevPaymentWebhookParseIssue[] = [
    { code: "PAYMENT_WEBHOOK_INVALID_PAYLOAD" },
  ];

  return fallbackIssues;
}

function getWebhookParseFailureCodeForField(
  field: FakeDevPaymentWebhookEventField | undefined,
): FakeDevPaymentWebhookParseFailureCode {
  switch (field) {
    case "provider":
      return "PAYMENT_WEBHOOK_UNKNOWN_PROVIDER";
    case "status":
      return "PAYMENT_WEBHOOK_UNSUPPORTED_STATUS";
    case "eventId":
      return "PAYMENT_WEBHOOK_MISSING_EVENT_ID";
    case "providerPaymentId":
      return "PAYMENT_WEBHOOK_MISSING_PROVIDER_PAYMENT_ID";
    case "occurredAt":
      return "PAYMENT_WEBHOOK_INVALID_OCCURRED_AT";
    default:
      return "PAYMENT_WEBHOOK_INVALID_PAYLOAD";
  }
}

function normalizeWebhookParseIssues(
  issues: readonly FakeDevPaymentWebhookParseIssue[],
) {
  const issueMap = new Map<string, FakeDevPaymentWebhookParseIssue>();

  for (const issue of issues) {
    issueMap.set(`${issue.field ?? "payload"}:${issue.code}`, issue);
  }

  return [...issueMap.values()].sort((left, right) => {
    const leftField = left.field ?? "payload";
    const rightField = right.field ?? "payload";
    const fieldComparison = leftField.localeCompare(rightField);

    if (fieldComparison !== 0) {
      return fieldComparison;
    }

    return left.code.localeCompare(right.code);
  });
}

function normalizeWebhookParseResultCodes(
  issues: readonly FakeDevPaymentWebhookParseIssue[],
) {
  return [...new Set(issues.map((issue) => issue.code))].sort(
    (left, right) =>
      FAKE_DEV_PAYMENT_WEBHOOK_PARSE_FAILURE_CODES.indexOf(left) -
      FAKE_DEV_PAYMENT_WEBHOOK_PARSE_FAILURE_CODES.indexOf(right),
  );
}

function getKnownWebhookEventField(
  value: unknown,
): FakeDevPaymentWebhookEventField | undefined {
  return typeof value === "string" && webhookEventFieldSet.has(value)
    ? (value as FakeDevPaymentWebhookEventField)
    : undefined;
}

function isWebhookParseFailureCode(
  value: string,
): value is FakeDevPaymentWebhookParseFailureCode {
  return webhookParseFailureCodeSet.has(value);
}
