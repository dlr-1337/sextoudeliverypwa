import {
  getPublicPaymentConfigErrorMessage,
  type FakeDevPaymentConfig,
} from "./config";
import {
  FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_HEADER,
  FAKE_DEV_PAYMENT_WEBHOOK_TIMESTAMP_HEADER,
  verifyAndParseFakeDevPaymentWebhookEvent,
  type FakeDevPaymentWebhookParseFailureCode,
  type FakeDevPaymentWebhookSignatureFailureCode,
} from "./webhook";
import type {
  PaymentWebhookServiceFailureCode,
  PaymentWebhookServiceResult,
  PaymentWebhookServiceSuccessCode,
  PaymentWebhookTargetStatus,
} from "./webhook-service-core";

export const DEFAULT_FAKE_DEV_PAYMENT_WEBHOOK_MAX_BODY_BYTES = 64 * 1024;

const PAYMENT_WEBHOOK_REVALIDATION_FAILED_MESSAGE =
  "Evento de pagamento aplicado; a atualização pública será retomada automaticamente.";
const PAYMENT_WEBHOOK_BODY_TOO_LARGE_MESSAGE =
  "Corpo do webhook fake/dev excede o limite permitido.";
const PAYMENT_WEBHOOK_INVALID_BODY_SIZE_MESSAGE =
  "Tamanho do webhook fake/dev inválido.";
const PAYMENT_WEBHOOK_SERVICE_ERROR_MESSAGE =
  "Não foi possível processar o webhook de pagamento agora. Tente novamente.";

const PAYMENT_WEBHOOK_SERVICE_SUCCESS_CODE_SET: ReadonlySet<string> = new Set([
  "PAYMENT_WEBHOOK_APPLIED",
  "PAYMENT_WEBHOOK_IDEMPOTENT_DUPLICATE",
]);

const PAYMENT_WEBHOOK_SERVICE_FAILURE_CODE_SET: ReadonlySet<string> = new Set([
  "PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND",
  "PAYMENT_WEBHOOK_PAYMENT_UNSUPPORTED",
  "PAYMENT_WEBHOOK_UNSUPPORTED_STATUS",
  "PAYMENT_WEBHOOK_TERMINAL_CONFLICT",
  "PAYMENT_WEBHOOK_STALE_UPDATE",
  "PAYMENT_WEBHOOK_DATABASE_ERROR",
]);

export type PaymentWebhookRouteHeaders = Pick<Headers, "get">;
export type PaymentWebhookRouteConfigGetter = () => FakeDevPaymentConfig;
export type PaymentWebhookRouteRevalidatePath = (path: string) => void | Promise<void>;
export type PaymentWebhookRouteService = {
  applyFakeDevPaymentWebhookEvent(
    event: Parameters<PaymentWebhookServiceCoreApply>[0],
  ): ReturnType<PaymentWebhookServiceCoreApply>;
};

type PaymentWebhookServiceCoreApply = (
  event: import("./webhook").FakeDevPaymentWebhookEvent,
) => Promise<PaymentWebhookServiceResult>;

export type PaymentWebhookRouteBodyFailureCode =
  | "PAYMENT_WEBHOOK_BODY_TOO_LARGE"
  | "PAYMENT_WEBHOOK_INVALID_BODY_SIZE";
export type PaymentWebhookRouteConfigFailureCode =
  "PAYMENT_WEBHOOK_CONFIG_INVALID";
export type PaymentWebhookRouteInternalFailureCode =
  "PAYMENT_WEBHOOK_SERVICE_ERROR";
export type PaymentWebhookRouteSuccessCode =
  | PaymentWebhookServiceSuccessCode
  | "PAYMENT_WEBHOOK_REVALIDATION_FAILED";
export type PaymentWebhookRouteFailureCode =
  | PaymentWebhookRouteBodyFailureCode
  | PaymentWebhookRouteConfigFailureCode
  | PaymentWebhookRouteInternalFailureCode
  | FakeDevPaymentWebhookSignatureFailureCode
  | FakeDevPaymentWebhookParseFailureCode
  | PaymentWebhookServiceFailureCode;
export type PaymentWebhookRouteCode =
  | PaymentWebhookRouteSuccessCode
  | PaymentWebhookRouteFailureCode;

export type PaymentWebhookRouteSuccessData = {
  changed: boolean;
  paymentStatus: PaymentWebhookTargetStatus;
  publicCode: string;
  revalidated: boolean;
};

export type PaymentWebhookRouteSuccessBody = {
  ok: true;
  code: PaymentWebhookRouteSuccessCode;
  message: string;
  data: PaymentWebhookRouteSuccessData;
};

export type PaymentWebhookRouteFailureBody = {
  ok: false;
  code: PaymentWebhookRouteFailureCode;
  message: string;
};

export type PaymentWebhookRouteResponseBody =
  | PaymentWebhookRouteSuccessBody
  | PaymentWebhookRouteFailureBody;

export type PaymentWebhookRouteResult = {
  status: number;
  body: PaymentWebhookRouteResponseBody;
};

export type HandleFakeDevPaymentWebhookRouteInput = {
  rawBody: string;
  headers: PaymentWebhookRouteHeaders;
  getConfig: PaymentWebhookRouteConfigGetter;
  service: PaymentWebhookRouteService;
  now?: () => Date;
  revalidatePath?: PaymentWebhookRouteRevalidatePath;
  maxBodyBytes?: number;
};

export async function handleFakeDevPaymentWebhookRoute({
  rawBody,
  headers,
  getConfig,
  service,
  now = () => new Date(),
  revalidatePath,
  maxBodyBytes = DEFAULT_FAKE_DEV_PAYMENT_WEBHOOK_MAX_BODY_BYTES,
}: HandleFakeDevPaymentWebhookRouteInput): Promise<PaymentWebhookRouteResult> {
  const bodySizeFailure = getBodySizeFailure({
    rawBody,
    headers,
    maxBodyBytes,
  });

  if (bodySizeFailure) {
    return bodySizeFailure;
  }

  let config: FakeDevPaymentConfig;

  try {
    config = getConfig();
  } catch (error) {
    return routeFailure(
      503,
      "PAYMENT_WEBHOOK_CONFIG_INVALID",
      getPublicPaymentConfigErrorMessage(error),
    );
  }

  const verifiedEvent = verifyAndParseFakeDevPaymentWebhookEvent({
    rawBody,
    timestamp: headers.get(FAKE_DEV_PAYMENT_WEBHOOK_TIMESTAMP_HEADER),
    signature: headers.get(FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_HEADER),
    secret: config.webhookSecret,
    now: now(),
  });

  if (!verifiedEvent.ok) {
    return routeFailure(
      verifiedEvent.stage === "signature" ? 401 : 400,
      verifiedEvent.code,
      verifiedEvent.message,
    );
  }

  let serviceResult: PaymentWebhookServiceResult;

  try {
    serviceResult = await service.applyFakeDevPaymentWebhookEvent(
      verifiedEvent.event,
    );
  } catch {
    return routeFailure(
      500,
      "PAYMENT_WEBHOOK_SERVICE_ERROR",
      PAYMENT_WEBHOOK_SERVICE_ERROR_MESSAGE,
    );
  }

  if (!isRecognizedPaymentWebhookServiceResult(serviceResult)) {
    return routeFailure(
      500,
      "PAYMENT_WEBHOOK_SERVICE_ERROR",
      PAYMENT_WEBHOOK_SERVICE_ERROR_MESSAGE,
    );
  }

  if (!serviceResult.ok) {
    return routeFailure(
      getServiceFailureHttpStatus(serviceResult.code),
      serviceResult.code,
      serviceResult.message,
    );
  }

  let revalidated = false;
  let responseCode: PaymentWebhookRouteSuccessCode = serviceResult.code;
  let responseMessage = serviceResult.message;

  if (serviceResult.data.changed && revalidatePath) {
    try {
      await revalidatePath(getPublicOrderTrackingPath(serviceResult.data.publicCode));
      revalidated = true;
    } catch {
      responseCode = "PAYMENT_WEBHOOK_REVALIDATION_FAILED";
      responseMessage = PAYMENT_WEBHOOK_REVALIDATION_FAILED_MESSAGE;
    }
  }

  return {
    status: 200,
    body: {
      ok: true,
      code: responseCode,
      message: responseMessage,
      data: {
        changed: serviceResult.data.changed,
        paymentStatus: serviceResult.data.paymentStatus,
        publicCode: serviceResult.data.publicCode,
        revalidated,
      },
    },
  };
}

export function getPublicOrderTrackingPath(publicCode: string) {
  return `/pedido/${encodeURIComponent(publicCode)}`;
}

function getBodySizeFailure({
  rawBody,
  headers,
  maxBodyBytes,
}: {
  rawBody: string;
  headers: PaymentWebhookRouteHeaders;
  maxBodyBytes: number;
}): PaymentWebhookRouteResult | null {
  const boundedMaxBodyBytes = Math.max(0, Math.trunc(maxBodyBytes));
  const contentLengthFailure = getContentLengthFailure(headers, boundedMaxBodyBytes);

  if (contentLengthFailure) {
    return contentLengthFailure;
  }

  if (Buffer.byteLength(rawBody, "utf8") > boundedMaxBodyBytes) {
    return routeFailure(
      413,
      "PAYMENT_WEBHOOK_BODY_TOO_LARGE",
      PAYMENT_WEBHOOK_BODY_TOO_LARGE_MESSAGE,
    );
  }

  return null;
}

function getContentLengthFailure(
  headers: PaymentWebhookRouteHeaders,
  maxBodyBytes: number,
): PaymentWebhookRouteResult | null {
  const rawContentLength = headers.get("content-length");

  if (rawContentLength === null) {
    return null;
  }

  const contentLength = Number(rawContentLength);

  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength < 0 ||
    rawContentLength.trim() !== contentLength.toString()
  ) {
    return routeFailure(
      400,
      "PAYMENT_WEBHOOK_INVALID_BODY_SIZE",
      PAYMENT_WEBHOOK_INVALID_BODY_SIZE_MESSAGE,
    );
  }

  if (contentLength > maxBodyBytes) {
    return routeFailure(
      413,
      "PAYMENT_WEBHOOK_BODY_TOO_LARGE",
      PAYMENT_WEBHOOK_BODY_TOO_LARGE_MESSAGE,
    );
  }

  return null;
}

function getServiceFailureHttpStatus(code: PaymentWebhookServiceFailureCode) {
  switch (code) {
    case "PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND":
    case "PAYMENT_WEBHOOK_PAYMENT_UNSUPPORTED":
      return 404;
    case "PAYMENT_WEBHOOK_UNSUPPORTED_STATUS":
      return 400;
    case "PAYMENT_WEBHOOK_TERMINAL_CONFLICT":
    case "PAYMENT_WEBHOOK_STALE_UPDATE":
      return 409;
    case "PAYMENT_WEBHOOK_DATABASE_ERROR":
      return 500;
  }
}

function isRecognizedPaymentWebhookServiceResult(
  result: PaymentWebhookServiceResult,
): result is PaymentWebhookServiceResult {
  if (!isRecord(result) || typeof result.ok !== "boolean") {
    return false;
  }

  if (result.ok) {
    return (
      PAYMENT_WEBHOOK_SERVICE_SUCCESS_CODE_SET.has(result.code) &&
      typeof result.message === "string" &&
      isRecord(result.data) &&
      typeof result.data.changed === "boolean" &&
      typeof result.data.paymentStatus === "string" &&
      typeof result.data.publicCode === "string"
    );
  }

  return (
    PAYMENT_WEBHOOK_SERVICE_FAILURE_CODE_SET.has(result.code) &&
    typeof result.message === "string"
  );
}

function routeFailure(
  status: number,
  code: PaymentWebhookRouteFailureCode,
  message: string,
): PaymentWebhookRouteResult {
  return {
    status,
    body: {
      ok: false,
      code,
      message,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
