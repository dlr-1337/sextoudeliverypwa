export const PAYMENT_GATEWAY_PROVIDER_FAKE_DEV = "fake-dev" as const;

export const ONLINE_PAYMENT_METHODS = ["PIX", "CARD"] as const;
export const PAYMENT_PROVIDER_STATUSES = [
  "pending",
  "authorized",
  "paid",
  "failed",
  "expired",
  "canceled",
] as const;
export const PAYMENT_PERSISTENCE_STATUSES = [
  "PENDING",
  "AUTHORIZED",
  "PAID",
  "FAILED",
  "CANCELED",
] as const;

export type FakeDevPaymentGatewayProvider =
  typeof PAYMENT_GATEWAY_PROVIDER_FAKE_DEV;
export type PaymentGatewayProviderName = FakeDevPaymentGatewayProvider;
export type OnlinePaymentMethod = (typeof ONLINE_PAYMENT_METHODS)[number];
export type PaymentProviderStatus = (typeof PAYMENT_PROVIDER_STATUSES)[number];
export type PaymentPersistenceStatus =
  (typeof PAYMENT_PERSISTENCE_STATUSES)[number];

export type PaymentCustomerSnapshot = {
  name: string;
  phone: string;
  email: string | null;
};

export type PaymentInitiationBaseInput = {
  internalOrderId: string;
  publicOrderCode: string;
  establishmentId: string;
  amountCents: number;
  currency: "BRL";
  customer: PaymentCustomerSnapshot;
  requestedAt: Date;
};

export type PixPaymentInitiationInput = PaymentInitiationBaseInput & {
  method: "PIX";
  expiresAt: Date;
};

export type HostedCardPaymentInitiationInput = PaymentInitiationBaseInput & {
  method: "CARD";
  successUrl: string;
  cancelUrl: string;
};

export type PaymentInitiationInput =
  | PixPaymentInitiationInput
  | HostedCardPaymentInitiationInput;

export type PixPaymentPublicInstructions = {
  method: "PIX";
  qrCode: string;
  copyPaste: string;
  expiresAtIso: string;
  checkoutUrl: null;
};

export type HostedCardPaymentPublicInstructions = {
  method: "CARD";
  checkoutUrl: string;
};

export type PaymentPublicInstructions =
  | PixPaymentPublicInstructions
  | HostedCardPaymentPublicInstructions;

export type FakeDevPaymentPersistenceFields = {
  method: OnlinePaymentMethod;
  status: PaymentPersistenceStatus;
  provider: FakeDevPaymentGatewayProvider;
  providerPaymentId: string;
  providerStatus: PaymentProviderStatus;
  providerPayload: null;
  checkoutUrl: string | null;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  pixExpiresAt: Date | null;
  cardBrand: string | null;
  cardLast4: string | null;
  paidAt: Date | null;
  failedAt: Date | null;
};

export type PixPaymentInitiationData = {
  method: "PIX";
  publicInstructions: PixPaymentPublicInstructions;
  persistence: FakeDevPaymentPersistenceFields & {
    method: "PIX";
    checkoutUrl: null;
    pixQrCode: string;
    pixCopyPaste: string;
    pixExpiresAt: Date;
    cardBrand: null;
    cardLast4: null;
  };
};

export type HostedCardPaymentInitiationData = {
  method: "CARD";
  publicInstructions: HostedCardPaymentPublicInstructions;
  persistence: FakeDevPaymentPersistenceFields & {
    method: "CARD";
    checkoutUrl: string;
    pixQrCode: null;
    pixCopyPaste: null;
    pixExpiresAt: null;
    cardBrand: null;
    cardLast4: null;
  };
};

export type PaymentInitiationSuccessData =
  | PixPaymentInitiationData
  | HostedCardPaymentInitiationData;

export type PaymentInitiationFailureCode =
  | "PAYMENT_PROVIDER_CONFIG_INVALID"
  | "PAYMENT_PROVIDER_INVALID_REQUEST"
  | "PAYMENT_PROVIDER_UNSUPPORTED_METHOD"
  | "PAYMENT_PROVIDER_UNAVAILABLE"
  | "PAYMENT_PROVIDER_REJECTED";

export type PaymentInitiationFailure = {
  ok: false;
  code: PaymentInitiationFailureCode;
  message: string;
  retryable: boolean;
};

export type PaymentInitiationSuccess = {
  ok: true;
  data: PaymentInitiationSuccessData;
};

export type PaymentInitiationResult =
  | PaymentInitiationFailure
  | PaymentInitiationSuccess;

export interface PaymentGatewayProvider {
  readonly provider: PaymentGatewayProviderName;
  initiatePayment(input: unknown): Promise<PaymentInitiationResult>;
}
