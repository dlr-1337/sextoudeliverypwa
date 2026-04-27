import type {
  DecimalLike,
  OrderStatusValue,
  PaymentMethodValue,
  PaymentStatusValue,
} from "./service-core";

const ORDER_STATUS_LABELS = {
  DRAFT: "Rascunho",
  PENDING: "Pedido recebido",
  ACCEPTED: "Pedido aceito",
  PREPARING: "Em preparo",
  READY_FOR_PICKUP: "Pronto para retirada",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
} as const satisfies Record<OrderStatusValue, string>;

const PAYMENT_METHOD_LABELS = {
  CASH: "Dinheiro",
  PIX: "Pix",
  CARD: "Cartão",
  FAKE: "Pagamento de teste",
} as const satisfies Record<PaymentMethodValue, string>;

const PAYMENT_STATUS_LABELS = {
  PENDING: "Pagamento pendente",
  MANUAL_CASH_ON_DELIVERY: "Pagamento em dinheiro na entrega",
  AUTHORIZED: "Pagamento autorizado",
  PAID: "Pago",
  FAILED: "Pagamento não aprovado",
  REFUNDED: "Pagamento estornado",
  CANCELED: "Pagamento cancelado",
} as const satisfies Record<PaymentStatusValue, string>;

const MONEY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function getOrderStatusLabel(status: unknown): string {
  return getLabel(ORDER_STATUS_LABELS, status, "Status do pedido indisponível");
}

export function getPaymentMethodLabel(method: unknown): string {
  return getLabel(PAYMENT_METHOD_LABELS, method, "Forma de pagamento indisponível");
}

export function getPaymentStatusLabel(status: unknown): string {
  return getLabel(PAYMENT_STATUS_LABELS, status, "Status do pagamento indisponível");
}

export function getManualCashPaymentDescription(
  method: unknown,
  status: unknown,
): string {
  if (method === "CASH" && status === "MANUAL_CASH_ON_DELIVERY") {
    return "Pagamento em dinheiro na entrega. Se precisar de troco, combine com a loja no atendimento.";
  }

  return "Pagamento indisponível para acompanhamento público.";
}

export function formatPublicOrderMoney(value: unknown): string {
  const cents = moneyToCents(value);

  if (cents === null || cents < 0) {
    return "Valor indisponível";
  }

  return MONEY_FORMATTER.format(cents / 100);
}

export function formatPublicOrderDateTime(value: unknown): string {
  const date = parseDate(value);

  if (!date) {
    return "Data indisponível";
  }

  return DATE_TIME_FORMATTER.format(date);
}

function getLabel<TLabels extends Record<string, string>>(
  labels: TLabels,
  key: unknown,
  fallback: string,
): string {
  if (typeof key !== "string" || !Object.hasOwn(labels, key)) {
    return fallback;
  }

  return labels[key];
}

function moneyToCents(value: unknown): number | null {
  const rawValue = decimalLikeToString(value);

  if (!rawValue) {
    return null;
  }

  const match = /^(\d+)(?:\.(\d{1,2}))?$/u.exec(rawValue);

  if (!match) {
    return null;
  }

  const reais = Number(match[1]);
  const centavos = Number((match[2] ?? "0").padEnd(2, "0"));

  if (!Number.isSafeInteger(reais) || !Number.isSafeInteger(centavos)) {
    return null;
  }

  const cents = reais * 100 + centavos;

  return Number.isSafeInteger(cents) ? cents : null;
}

function decimalLikeToString(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toFixed(2) : null;
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (isDecimalLike(value)) {
    try {
      return value.toString().trim();
    } catch {
      return null;
    }
  }

  return null;
}

function isDecimalLike(value: unknown): value is DecimalLike {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "toString" in value &&
    typeof value.toString === "function"
  );
}

function parseDate(value: unknown): Date | null {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}
