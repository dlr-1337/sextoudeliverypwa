import {
  getFakeDevPaymentWebhookPaymentStatus,
  type FakeDevPaymentWebhookEvent,
} from "./webhook";
import {
  ONLINE_PAYMENT_METHODS,
  PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
  type PaymentProviderStatus,
} from "./types";

export const PAYMENT_WEBHOOK_PAYMENT_SELECT = {
  id: true,
  orderId: true,
  method: true,
  status: true,
  provider: true,
  providerStatus: true,
  order: {
    select: {
      publicCode: true,
      paymentStatus: true,
    },
  },
} as const;

export const PAYMENT_WEBHOOK_SERVICE_MESSAGES = {
  PAYMENT_WEBHOOK_APPLIED: "Evento de pagamento aplicado.",
  PAYMENT_WEBHOOK_IDEMPOTENT_DUPLICATE:
    "Evento de pagamento já estava aplicado.",
  PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND:
    "Pagamento não encontrado para o webhook fake/dev.",
  PAYMENT_WEBHOOK_PAYMENT_UNSUPPORTED:
    "Pagamento não suportado para webhook fake/dev.",
  PAYMENT_WEBHOOK_UNSUPPORTED_STATUS:
    "Status de webhook fake/dev não suportado.",
  PAYMENT_WEBHOOK_TERMINAL_CONFLICT:
    "Pagamento já está em status terminal diferente.",
  PAYMENT_WEBHOOK_STALE_UPDATE:
    "Pagamento foi atualizado por outra operação. Tente novamente.",
  PAYMENT_WEBHOOK_DATABASE_ERROR:
    "Não foi possível aplicar o webhook de pagamento agora. Tente novamente.",
} as const satisfies Record<PaymentWebhookServiceCode, string>;

export type PaymentWebhookOnlineMethod = (typeof ONLINE_PAYMENT_METHODS)[number];
export type PaymentWebhookPaymentMethod =
  | "CASH"
  | PaymentWebhookOnlineMethod
  | "FAKE";
export type PaymentWebhookMutableStatus = "PENDING" | "AUTHORIZED";
export type PaymentWebhookTerminalStatus =
  | "MANUAL_CASH_ON_DELIVERY"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "CANCELED";
export type PaymentWebhookPaymentStatus =
  | PaymentWebhookMutableStatus
  | PaymentWebhookTerminalStatus;
export type PaymentWebhookTargetStatus = Extract<
  PaymentWebhookPaymentStatus,
  "PAID" | "FAILED" | "CANCELED"
>;

export type PaymentWebhookServiceSuccessCode =
  | "PAYMENT_WEBHOOK_APPLIED"
  | "PAYMENT_WEBHOOK_IDEMPOTENT_DUPLICATE";

export type PaymentWebhookServiceFailureCode =
  | "PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND"
  | "PAYMENT_WEBHOOK_PAYMENT_UNSUPPORTED"
  | "PAYMENT_WEBHOOK_UNSUPPORTED_STATUS"
  | "PAYMENT_WEBHOOK_TERMINAL_CONFLICT"
  | "PAYMENT_WEBHOOK_STALE_UPDATE"
  | "PAYMENT_WEBHOOK_DATABASE_ERROR";

export type PaymentWebhookServiceCode =
  | PaymentWebhookServiceSuccessCode
  | PaymentWebhookServiceFailureCode;

export type PaymentWebhookServiceSuccessData = {
  changed: boolean;
  paymentStatus: PaymentWebhookTargetStatus;
  publicCode: string;
};

export type PaymentWebhookServiceSuccess = {
  ok: true;
  code: PaymentWebhookServiceSuccessCode;
  message: string;
  retryable: false;
  data: PaymentWebhookServiceSuccessData;
};

export type PaymentWebhookServiceFailure = {
  ok: false;
  code: PaymentWebhookServiceFailureCode;
  message: string;
  retryable: boolean;
};

export type PaymentWebhookServiceResult =
  | PaymentWebhookServiceSuccess
  | PaymentWebhookServiceFailure;

export type PaymentWebhookPaymentRow = {
  id: string;
  orderId: string;
  method: PaymentWebhookPaymentMethod;
  status: PaymentWebhookPaymentStatus;
  provider: string | null;
  providerStatus: string | null;
  order: {
    publicCode: string;
    paymentStatus: PaymentWebhookPaymentStatus;
  } | null;
};

export type PaymentWebhookPaymentFindUniqueArgs = {
  where: { providerPaymentId: string };
  select: typeof PAYMENT_WEBHOOK_PAYMENT_SELECT;
};

export type PaymentWebhookPaymentUpdateManyArgs = {
  where: {
    id: string;
    method: PaymentWebhookOnlineMethod;
    provider: typeof PAYMENT_GATEWAY_PROVIDER_FAKE_DEV;
    status: PaymentWebhookMutableStatus;
  };
  data: {
    status: PaymentWebhookTargetStatus;
    providerStatus: PaymentProviderStatus;
    paidAt: Date | null;
    failedAt: Date | null;
    updatedAt: Date;
  };
};

export type PaymentWebhookOrderUpdateManyArgs = {
  where: {
    id: string;
    paymentStatus: PaymentWebhookMutableStatus;
  };
  data: {
    paymentStatus: PaymentWebhookTargetStatus;
    updatedAt: Date;
  };
};

export type PaymentWebhookTransactionClient = {
  payment: {
    findUnique(
      args: PaymentWebhookPaymentFindUniqueArgs,
    ): Promise<PaymentWebhookPaymentRow | null>;
    updateMany(args: PaymentWebhookPaymentUpdateManyArgs): Promise<{ count: number }>;
  };
  order: {
    updateMany(args: PaymentWebhookOrderUpdateManyArgs): Promise<{ count: number }>;
  };
};

export type PaymentWebhookServiceClient<
  TTransactionClient extends PaymentWebhookTransactionClient = PaymentWebhookTransactionClient,
> = {
  $transaction<TResult>(
    callback: (tx: TTransactionClient) => Promise<TResult>,
  ): Promise<TResult>;
};

export type PaymentWebhookServiceCoreDependencies<
  TTransactionClient extends PaymentWebhookTransactionClient = PaymentWebhookTransactionClient,
> = {
  db: PaymentWebhookServiceClient<TTransactionClient>;
  now?: () => Date;
};

export type PaymentWebhookServiceCore = ReturnType<
  typeof createPaymentWebhookServiceCore
>;

type PaymentWebhookTargetUpdate = {
  paymentStatus: PaymentWebhookTargetStatus;
  providerStatus: PaymentProviderStatus;
  paidAt: Date | null;
  failedAt: Date | null;
};

const ONLINE_PAYMENT_METHOD_SET: ReadonlySet<string> = new Set(
  ONLINE_PAYMENT_METHODS,
);
const MUTABLE_PAYMENT_STATUS_SET: ReadonlySet<string> = new Set([
  "PENDING",
  "AUTHORIZED",
]);
const TARGET_PAYMENT_STATUS_SET: ReadonlySet<string> = new Set([
  "PAID",
  "FAILED",
  "CANCELED",
]);
const TERMINAL_PAYMENT_STATUS_SET: ReadonlySet<string> = new Set([
  "MANUAL_CASH_ON_DELIVERY",
  "PAID",
  "FAILED",
  "REFUNDED",
  "CANCELED",
]);

class PaymentWebhookControlledRollback extends Error {
  constructor(readonly result: PaymentWebhookServiceFailure) {
    super("payment_webhook_controlled_rollback");
  }
}

export function createPaymentWebhookServiceCore<
  TTransactionClient extends PaymentWebhookTransactionClient = PaymentWebhookTransactionClient,
>({ db, now = () => new Date() }: PaymentWebhookServiceCoreDependencies<TTransactionClient>) {
  async function applyFakeDevPaymentWebhookEvent(
    event: FakeDevPaymentWebhookEvent,
  ): Promise<PaymentWebhookServiceResult> {
    const targetUpdate = getTargetUpdateForFakeDevPaymentEvent(event);

    if (!targetUpdate) {
      return paymentWebhookFailure("PAYMENT_WEBHOOK_UNSUPPORTED_STATUS");
    }

    try {
      return await db.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { providerPaymentId: event.providerPaymentId },
          select: PAYMENT_WEBHOOK_PAYMENT_SELECT,
        });

        if (!payment) {
          return paymentWebhookFailure("PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND");
        }

        if (!isSupportedFakeDevPayment(payment)) {
          return paymentWebhookFailure("PAYMENT_WEBHOOK_PAYMENT_UNSUPPORTED");
        }

        const mutationIntent = getPaymentMutationIntent(
          payment,
          targetUpdate.paymentStatus,
        );

        if (mutationIntent === "idempotent") {
          return paymentWebhookSuccess("PAYMENT_WEBHOOK_IDEMPOTENT_DUPLICATE", {
            changed: false,
            paymentStatus: targetUpdate.paymentStatus,
            publicCode: payment.order.publicCode,
          });
        }

        if (mutationIntent === "conflict") {
          return paymentWebhookFailure("PAYMENT_WEBHOOK_TERMINAL_CONFLICT");
        }

        if (mutationIntent === "unsupported") {
          return paymentWebhookFailure("PAYMENT_WEBHOOK_PAYMENT_UNSUPPORTED");
        }

        const changedAt = now();
        const sourcePaymentStatus = payment.status;
        const sourceOrderPaymentStatus = payment.order.paymentStatus;

        if (
          !isMutablePaymentStatus(sourcePaymentStatus) ||
          !isMutablePaymentStatus(sourceOrderPaymentStatus)
        ) {
          return paymentWebhookFailure("PAYMENT_WEBHOOK_PAYMENT_UNSUPPORTED");
        }

        const paymentUpdate = await tx.payment.updateMany({
          where: {
            id: payment.id,
            method: payment.method,
            provider: PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
            status: sourcePaymentStatus,
          },
          data: {
            status: targetUpdate.paymentStatus,
            providerStatus: targetUpdate.providerStatus,
            paidAt: targetUpdate.paidAt,
            failedAt: targetUpdate.failedAt,
            updatedAt: changedAt,
          },
        });

        if (paymentUpdate.count !== 1) {
          return paymentWebhookFailure("PAYMENT_WEBHOOK_STALE_UPDATE", {
            retryable: true,
          });
        }

        const orderUpdate = await tx.order.updateMany({
          where: {
            id: payment.orderId,
            paymentStatus: sourceOrderPaymentStatus,
          },
          data: {
            paymentStatus: targetUpdate.paymentStatus,
            updatedAt: changedAt,
          },
        });

        if (orderUpdate.count !== 1) {
          throw new PaymentWebhookControlledRollback(
            paymentWebhookFailure("PAYMENT_WEBHOOK_STALE_UPDATE", {
              retryable: true,
            }),
          );
        }

        return paymentWebhookSuccess("PAYMENT_WEBHOOK_APPLIED", {
          changed: true,
          paymentStatus: targetUpdate.paymentStatus,
          publicCode: payment.order.publicCode,
        });
      });
    } catch (error) {
      if (error instanceof PaymentWebhookControlledRollback) {
        return error.result;
      }

      return paymentWebhookFailure("PAYMENT_WEBHOOK_DATABASE_ERROR", {
        retryable: true,
      });
    }
  }

  return { applyFakeDevPaymentWebhookEvent };
}

function getTargetUpdateForFakeDevPaymentEvent(
  event: FakeDevPaymentWebhookEvent,
): PaymentWebhookTargetUpdate | null {
  const paymentStatus = getFakeDevPaymentWebhookPaymentStatus(event.status);

  if (!isTargetPaymentStatus(paymentStatus)) {
    return null;
  }

  switch (event.status) {
    case "approved":
      return {
        paymentStatus,
        providerStatus: "paid",
        paidAt: event.occurredAt,
        failedAt: null,
      };
    case "failed":
      return {
        paymentStatus,
        providerStatus: "failed",
        paidAt: null,
        failedAt: event.occurredAt,
      };
    case "canceled":
      return {
        paymentStatus,
        providerStatus: "canceled",
        paidAt: null,
        failedAt: null,
      };
    default:
      return null;
  }
}

function isSupportedFakeDevPayment(
  payment: PaymentWebhookPaymentRow,
): payment is PaymentWebhookPaymentRow & {
  method: PaymentWebhookOnlineMethod;
  order: NonNullable<PaymentWebhookPaymentRow["order"]>;
} {
  return (
    payment.provider === PAYMENT_GATEWAY_PROVIDER_FAKE_DEV &&
    ONLINE_PAYMENT_METHOD_SET.has(payment.method) &&
    payment.order !== null
  );
}

function getPaymentMutationIntent(
  payment: PaymentWebhookPaymentRow & {
    method: PaymentWebhookOnlineMethod;
    order: NonNullable<PaymentWebhookPaymentRow["order"]>;
  },
  targetStatus: PaymentWebhookTargetStatus,
): "apply" | "idempotent" | "conflict" | "unsupported" {
  if (
    payment.status === targetStatus &&
    payment.order.paymentStatus === targetStatus
  ) {
    return "idempotent";
  }

  if (
    isTerminalPaymentStatus(payment.status) ||
    isTerminalPaymentStatus(payment.order.paymentStatus)
  ) {
    return "conflict";
  }

  if (
    isMutablePaymentStatus(payment.status) &&
    isMutablePaymentStatus(payment.order.paymentStatus)
  ) {
    return "apply";
  }

  return "unsupported";
}

function isMutablePaymentStatus(
  status: PaymentWebhookPaymentStatus,
): status is PaymentWebhookMutableStatus {
  return MUTABLE_PAYMENT_STATUS_SET.has(status);
}

function isTargetPaymentStatus(
  status: string,
): status is PaymentWebhookTargetStatus {
  return TARGET_PAYMENT_STATUS_SET.has(status);
}

function isTerminalPaymentStatus(status: PaymentWebhookPaymentStatus) {
  return TERMINAL_PAYMENT_STATUS_SET.has(status);
}

function paymentWebhookSuccess(
  code: PaymentWebhookServiceSuccessCode,
  data: PaymentWebhookServiceSuccessData,
): PaymentWebhookServiceSuccess {
  return {
    ok: true,
    code,
    message: PAYMENT_WEBHOOK_SERVICE_MESSAGES[code],
    retryable: false,
    data,
  };
}

function paymentWebhookFailure(
  code: PaymentWebhookServiceFailureCode,
  options: { retryable?: boolean } = {},
): PaymentWebhookServiceFailure {
  return {
    ok: false,
    code,
    message: PAYMENT_WEBHOOK_SERVICE_MESSAGES[code],
    retryable: options.retryable ?? false,
  };
}
