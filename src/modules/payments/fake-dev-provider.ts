import { createHash } from "node:crypto";

import { z } from "zod";

import {
  ONLINE_PAYMENT_METHODS,
  PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
  type FakeDevPaymentPersistenceFields,
  type HostedCardPaymentInitiationData,
  type PaymentGatewayProvider,
  type PaymentInitiationFailure,
  type PaymentInitiationResult,
  type PaymentProviderStatus,
  type PaymentPersistenceStatus,
  type PixPaymentInitiationData,
} from "./types";

const DEFAULT_HOSTED_CHECKOUT_ORIGIN = "https://fake-payments.local";
const PROVIDER_PAYMENT_ID_DIGEST_LENGTH = 24;
const PUBLIC_ORDER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,63}$/u;
const GENERIC_INVALID_INPUT_MESSAGE = "Dados de pagamento online inválidos.";
const UNSUPPORTED_METHOD_MESSAGE = "Método de pagamento online não suportado.";
const PENDING_PAYMENT_STATUS = "PENDING" satisfies PaymentPersistenceStatus;
const PENDING_PROVIDER_STATUS = "pending" satisfies PaymentProviderStatus;
const ONLINE_PAYMENT_METHOD_SET: ReadonlySet<string> = new Set(
  ONLINE_PAYMENT_METHODS,
);

export type FakeDevPaymentProviderOptions = {
  hostedCheckoutOrigin?: string;
};

const nonEmptyBoundedStringSchema = z
  .string({ error: GENERIC_INVALID_INPUT_MESSAGE })
  .trim()
  .min(1, GENERIC_INVALID_INPUT_MESSAGE)
  .max(128, GENERIC_INVALID_INPUT_MESSAGE);

const publicOrderCodeSchema = z
  .string({ error: GENERIC_INVALID_INPUT_MESSAGE })
  .trim()
  .min(1, GENERIC_INVALID_INPUT_MESSAGE)
  .max(64, GENERIC_INVALID_INPUT_MESSAGE)
  .transform((value) => value.toUpperCase())
  .refine((value) => PUBLIC_ORDER_CODE_PATTERN.test(value), {
    message: GENERIC_INVALID_INPUT_MESSAGE,
  });

const validDateSchema = z
  .date({ error: GENERIC_INVALID_INPUT_MESSAGE })
  .refine((value) => !Number.isNaN(value.getTime()), {
    message: GENERIC_INVALID_INPUT_MESSAGE,
  });

const returnUrlSchema = z
  .string({ error: GENERIC_INVALID_INPUT_MESSAGE })
  .trim()
  .url(GENERIC_INVALID_INPUT_MESSAGE)
  .max(2048, GENERIC_INVALID_INPUT_MESSAGE);

const customerSnapshotSchema = z
  .object({
    name: nonEmptyBoundedStringSchema,
    phone: nonEmptyBoundedStringSchema,
    email: z
      .string({ error: GENERIC_INVALID_INPUT_MESSAGE })
      .trim()
      .email(GENERIC_INVALID_INPUT_MESSAGE)
      .nullable(),
  })
  .strict();

const paymentInitiationBaseShape = {
  internalOrderId: nonEmptyBoundedStringSchema,
  publicOrderCode: publicOrderCodeSchema,
  establishmentId: nonEmptyBoundedStringSchema,
  amountCents: z
    .number({ error: GENERIC_INVALID_INPUT_MESSAGE })
    .int(GENERIC_INVALID_INPUT_MESSAGE)
    .positive(GENERIC_INVALID_INPUT_MESSAGE)
    .max(99_999_999, GENERIC_INVALID_INPUT_MESSAGE),
  currency: z.literal("BRL", { error: GENERIC_INVALID_INPUT_MESSAGE }),
  customer: customerSnapshotSchema,
  requestedAt: validDateSchema,
} as const;

const pixPaymentInitiationInputSchema = z
  .object({
    ...paymentInitiationBaseShape,
    method: z.literal("PIX"),
    expiresAt: validDateSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.expiresAt.getTime() <= input.requestedAt.getTime()) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: GENERIC_INVALID_INPUT_MESSAGE,
      });
    }
  });

const hostedCardPaymentInitiationInputSchema = z
  .object({
    ...paymentInitiationBaseShape,
    method: z.literal("CARD"),
    successUrl: returnUrlSchema,
    cancelUrl: returnUrlSchema,
  })
  .strict();

const fakeDevPaymentInitiationInputSchema = z.discriminatedUnion("method", [
  pixPaymentInitiationInputSchema,
  hostedCardPaymentInitiationInputSchema,
]);

type NormalizedPaymentInitiationInput = z.infer<
  typeof fakeDevPaymentInitiationInputSchema
>;
type NormalizedPixPaymentInitiationInput = z.infer<
  typeof pixPaymentInitiationInputSchema
>;
type NormalizedHostedCardPaymentInitiationInput = z.infer<
  typeof hostedCardPaymentInitiationInputSchema
>;

export function createFakeDevPaymentProvider(
  options: FakeDevPaymentProviderOptions = {},
): PaymentGatewayProvider {
  const hostedCheckoutOrigin = normalizeHostedCheckoutOrigin(
    options.hostedCheckoutOrigin,
  );

  return {
    provider: PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
    async initiatePayment(input: unknown): Promise<PaymentInitiationResult> {
      const parsed = fakeDevPaymentInitiationInputSchema.safeParse(input);

      if (!parsed.success) {
        return isUnsupportedMethodInput(input)
          ? paymentInitiationFailure(
              "PAYMENT_PROVIDER_UNSUPPORTED_METHOD",
              UNSUPPORTED_METHOD_MESSAGE,
            )
          : paymentInitiationFailure(
              "PAYMENT_PROVIDER_INVALID_REQUEST",
              GENERIC_INVALID_INPUT_MESSAGE,
            );
      }

      return {
        ok: true,
        data:
          parsed.data.method === "PIX"
            ? buildPixInitiationData(parsed.data)
            : buildHostedCardInitiationData(parsed.data, hostedCheckoutOrigin),
      };
    },
  };
}

function buildPixInitiationData(
  input: NormalizedPixPaymentInitiationInput,
): PixPaymentInitiationData {
  const providerPaymentId = buildProviderPaymentId(input);
  const amount = formatAmountCents(input.amountCents);
  const expiresAtIso = input.expiresAt.toISOString();
  const pixCopyPaste = [
    "FAKEDEVPIX",
    "v1",
    `order=${input.publicOrderCode}`,
    `amount=${amount}`,
    `expires=${expiresAtIso}`,
    `payment=${providerPaymentId}`,
  ].join("|");
  const pixQrCode = `fake-dev-pix://${providerPaymentId}?order=${encodeURIComponent(
    input.publicOrderCode,
  )}&amount=${encodeURIComponent(amount)}&expires=${encodeURIComponent(
    expiresAtIso,
  )}`;

  return {
    method: "PIX",
    publicInstructions: {
      method: "PIX",
      qrCode: pixQrCode,
      copyPaste: pixCopyPaste,
      expiresAtIso,
      checkoutUrl: null,
    },
    persistence: {
      ...buildBasePersistenceFields("PIX", providerPaymentId),
      checkoutUrl: null,
      pixQrCode,
      pixCopyPaste,
      pixExpiresAt: input.expiresAt,
      cardBrand: null,
      cardLast4: null,
    },
  };
}

function buildHostedCardInitiationData(
  input: NormalizedHostedCardPaymentInitiationInput,
  hostedCheckoutOrigin: string,
): HostedCardPaymentInitiationData {
  const providerPaymentId = buildProviderPaymentId(input);
  const checkoutUrl = new URL(
    `/checkout/${encodeURIComponent(providerPaymentId)}`,
    hostedCheckoutOrigin,
  ).toString();

  return {
    method: "CARD",
    publicInstructions: {
      method: "CARD",
      checkoutUrl,
    },
    persistence: {
      ...buildBasePersistenceFields("CARD", providerPaymentId),
      checkoutUrl,
      pixQrCode: null,
      pixCopyPaste: null,
      pixExpiresAt: null,
      cardBrand: null,
      cardLast4: null,
    },
  };
}

function buildBasePersistenceFields<TMethod extends "PIX" | "CARD">(
  method: TMethod,
  providerPaymentId: string,
): FakeDevPaymentPersistenceFields & { method: TMethod } {
  return {
    method,
    status: PENDING_PAYMENT_STATUS,
    provider: PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
    providerPaymentId,
    providerStatus: PENDING_PROVIDER_STATUS,
    providerPayload: null,
    checkoutUrl: null,
    pixQrCode: null,
    pixCopyPaste: null,
    pixExpiresAt: null,
    cardBrand: null,
    cardLast4: null,
    paidAt: null,
    failedAt: null,
  };
}

function buildProviderPaymentId(input: NormalizedPaymentInitiationInput) {
  const digest = createHash("sha256")
    .update(
      [
        PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
        input.method,
        input.publicOrderCode,
        input.amountCents.toString(),
        input.currency,
        input.requestedAt.toISOString(),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, PROVIDER_PAYMENT_ID_DIGEST_LENGTH);

  return `fake_dev_${input.method.toLowerCase()}_${digest}`;
}

function formatAmountCents(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

function paymentInitiationFailure(
  code: PaymentInitiationFailure["code"],
  message: string,
): PaymentInitiationFailure {
  return {
    ok: false,
    code,
    message,
    retryable: false,
  };
}

function normalizeHostedCheckoutOrigin(input: string | undefined) {
  if (!input) {
    return DEFAULT_HOSTED_CHECKOUT_ORIGIN;
  }

  return new URL(input).origin;
}

function isUnsupportedMethodInput(input: unknown) {
  return (
    isRecord(input) &&
    typeof input.method === "string" &&
    !ONLINE_PAYMENT_METHOD_SET.has(input.method)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
