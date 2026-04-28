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
  REJECTED: "Pedido recusado",
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

export type PublicPaymentSummaryCopy = {
  eyebrow: string;
  heading: string;
  description: string;
  action: string;
};

const MANUAL_CASH_PAYMENT_DESCRIPTION =
  "Pagamento em dinheiro na entrega. Se precisar de troco, combine com a loja no atendimento.";

const PUBLIC_PAYMENT_FALLBACK_COPY = {
  eyebrow: "Pagamento",
  heading: "Pagamento indisponível",
  description: "Pagamento indisponível para acompanhamento público.",
  action: "Acompanhe o pedido por este endereço ou fale com a loja pelo atendimento.",
} as const satisfies PublicPaymentSummaryCopy;

const CASH_PENDING_COPY = {
  eyebrow: "Pagamento manual",
  heading: "Pagamento em dinheiro",
  description: MANUAL_CASH_PAYMENT_DESCRIPTION,
  action: "Tenha o valor combinado disponível no recebimento do pedido.",
} as const satisfies PublicPaymentSummaryCopy;

const PUBLIC_PAYMENT_SUMMARY_COPY = {
  CASH: {
    PENDING: CASH_PENDING_COPY,
    MANUAL_CASH_ON_DELIVERY: CASH_PENDING_COPY,
    AUTHORIZED: {
      eyebrow: "Pagamento manual",
      heading: "Pagamento em dinheiro combinado",
      description:
        "A loja está acompanhando este pedido antes de registrar o pagamento em dinheiro.",
      action: "Combine os próximos passos diretamente com a loja pelo atendimento.",
    },
    PAID: {
      eyebrow: "Pagamento manual",
      heading: "Pagamento em dinheiro registrado",
      description: "A loja registrou o pagamento em dinheiro deste pedido.",
      action: "Continue acompanhando as atualizações públicas do pedido.",
    },
    FAILED: {
      eyebrow: "Pagamento manual",
      heading: "Pagamento em dinheiro não registrado",
      description:
        "A loja não conseguiu registrar o pagamento em dinheiro para este pedido.",
      action: "Fale com a loja pelo atendimento para combinar uma alternativa.",
    },
    REFUNDED: {
      eyebrow: "Pagamento manual",
      heading: "Pagamento em dinheiro ajustado",
      description: "A loja registrou um ajuste financeiro para este pedido.",
      action: "Fale com a loja pelo atendimento se precisar de detalhes.",
    },
    CANCELED: {
      eyebrow: "Pagamento manual",
      heading: "Pagamento em dinheiro cancelado",
      description:
        "O pagamento em dinheiro não precisa ser realizado porque o pedido foi cancelado.",
      action: "Nenhuma ação de pagamento é necessária neste endereço.",
    },
  },
  PIX: {
    PENDING: {
      eyebrow: "Pagamento via Pix",
      heading: "Pix aguardando pagamento",
      description:
        "Use as instruções de Pix exibidas nesta página para pagar com segurança.",
      action: "Depois de pagar, acompanhe a confirmação neste mesmo endereço.",
    },
    MANUAL_CASH_ON_DELIVERY: PUBLIC_PAYMENT_FALLBACK_COPY,
    AUTHORIZED: {
      eyebrow: "Pagamento via Pix",
      heading: "Pix em confirmação",
      description:
        "Recebemos a sinalização do pagamento e a confirmação final aparecerá neste acompanhamento.",
      action: "Aguarde a atualização pública antes de refazer o pagamento.",
    },
    PAID: {
      eyebrow: "Pagamento via Pix",
      heading: "Pix confirmado",
      description: "O pagamento via Pix foi confirmado para este pedido.",
      action: "Continue acompanhando o preparo e a entrega por este endereço.",
    },
    FAILED: {
      eyebrow: "Pagamento via Pix",
      heading: "Pix não aprovado",
      description:
        "Não foi possível confirmar o pagamento via Pix para este pedido.",
      action: "Fale com a loja pelo atendimento antes de tentar pagar novamente.",
    },
    REFUNDED: {
      eyebrow: "Pagamento via Pix",
      heading: "Pix estornado",
      description: "A loja registrou a devolução do pagamento via Pix deste pedido.",
      action: "Fale com a loja pelo atendimento se precisar acompanhar a devolução.",
    },
    CANCELED: {
      eyebrow: "Pagamento via Pix",
      heading: "Pix cancelado",
      description: "O pagamento via Pix deste pedido foi cancelado.",
      action: "Não use instruções antigas de pagamento para este pedido.",
    },
  },
  CARD: {
    PENDING: {
      eyebrow: "Pagamento por cartão",
      heading: "Cartão aguardando pagamento",
      description:
        "Finalize o pagamento pelo link seguro exibido nesta página quando ele estiver disponível.",
      action: "Após concluir, volte para acompanhar a atualização do pedido.",
    },
    MANUAL_CASH_ON_DELIVERY: PUBLIC_PAYMENT_FALLBACK_COPY,
    AUTHORIZED: {
      eyebrow: "Pagamento por cartão",
      heading: "Cartão autorizado",
      description:
        "A autorização do cartão foi recebida e a confirmação final aparecerá neste acompanhamento.",
      action: "Aguarde a atualização pública antes de iniciar outro pagamento.",
    },
    PAID: {
      eyebrow: "Pagamento por cartão",
      heading: "Cartão confirmado",
      description: "O pagamento por cartão foi confirmado para este pedido.",
      action: "Continue acompanhando o preparo e a entrega por este endereço.",
    },
    FAILED: {
      eyebrow: "Pagamento por cartão",
      heading: "Cartão não aprovado",
      description:
        "Não foi possível confirmar o pagamento por cartão para este pedido.",
      action: "Fale com a loja pelo atendimento para escolher uma alternativa segura.",
    },
    REFUNDED: {
      eyebrow: "Pagamento por cartão",
      heading: "Cartão estornado",
      description: "A loja registrou a devolução do pagamento por cartão deste pedido.",
      action: "Fale com a loja pelo atendimento se precisar acompanhar a devolução.",
    },
    CANCELED: {
      eyebrow: "Pagamento por cartão",
      heading: "Cartão cancelado",
      description: "O pagamento por cartão deste pedido foi cancelado.",
      action: "Não use links antigos de pagamento para este pedido.",
    },
  },
} as const satisfies Record<
  Extract<PaymentMethodValue, "CASH" | "PIX" | "CARD">,
  Record<PaymentStatusValue, PublicPaymentSummaryCopy>
>;

export function getPublicPaymentSummaryCopy(
  method: unknown,
  status: unknown,
): PublicPaymentSummaryCopy {
  if (!isPublicPaymentMethod(method) || !isPaymentStatusValue(status)) {
    return PUBLIC_PAYMENT_FALLBACK_COPY;
  }

  return PUBLIC_PAYMENT_SUMMARY_COPY[method][status];
}

export function getManualCashPaymentDescription(
  method: unknown,
  status: unknown,
): string {
  if (method === "CASH" && status === "MANUAL_CASH_ON_DELIVERY") {
    return MANUAL_CASH_PAYMENT_DESCRIPTION;
  }

  return PUBLIC_PAYMENT_FALLBACK_COPY.description;
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

function isPublicPaymentMethod(
  method: unknown,
): method is Extract<PaymentMethodValue, "CASH" | "PIX" | "CARD"> {
  return method === "CASH" || method === "PIX" || method === "CARD";
}

function isPaymentStatusValue(status: unknown): status is PaymentStatusValue {
  return typeof status === "string" && Object.hasOwn(PAYMENT_STATUS_LABELS, status);
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
