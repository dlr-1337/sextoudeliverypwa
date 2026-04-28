import type { OrderStatusValue } from "@/modules/orders/service-core";

export const MERCHANT_ORDER_STATUS_VALUES = [
  "DRAFT",
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "REJECTED",
  "CANCELED",
] as const satisfies readonly OrderStatusValue[];

export type MerchantOrderStatusFilter = OrderStatusValue;

export type ParsedMerchantOrderStatusFilter =
  | { valid: true; status?: MerchantOrderStatusFilter }
  | { valid: false; status?: undefined };

export type MerchantOrderStatusCopy = {
  label: string;
  pluralLabel: string;
  description: string;
  className: string;
};

export type MerchantOrderPanelCopy = {
  title: string;
  description: string;
};

export const MERCHANT_ORDER_STATUS_COPY = {
  DRAFT: {
    label: "Rascunho",
    pluralLabel: "Rascunhos",
    description: "Pedidos ainda não enviados ao fluxo operacional.",
    className: "border-slate-200 bg-slate-100 text-slate-700",
  },
  PENDING: {
    label: "Recebido",
    pluralLabel: "Recebidos",
    description: "Pedidos recebidos aguardando aceite da loja.",
    className: "border-amber-200 bg-amber-100 text-amber-950",
  },
  ACCEPTED: {
    label: "Aceito",
    pluralLabel: "Aceitos",
    description: "Pedidos aceitos pela loja e aguardando preparo.",
    className: "border-sky-200 bg-sky-100 text-sky-950",
  },
  PREPARING: {
    label: "Em preparo",
    pluralLabel: "Em preparo",
    description: "Pedidos em preparo pela equipe da loja.",
    className: "border-orange-200 bg-orange-100 text-orange-950",
  },
  READY_FOR_PICKUP: {
    label: "Pronto para retirada",
    pluralLabel: "Prontos para retirada",
    description: "Pedidos prontos para retirada ou envio.",
    className: "border-lime-200 bg-lime-100 text-lime-950",
  },
  OUT_FOR_DELIVERY: {
    label: "Saiu para entrega",
    pluralLabel: "Em entrega",
    description: "Pedidos que já saíram para entrega.",
    className: "border-indigo-200 bg-indigo-100 text-indigo-950",
  },
  DELIVERED: {
    label: "Entregue",
    pluralLabel: "Entregues",
    description: "Pedidos concluídos e entregues ao cliente.",
    className: "border-emerald-200 bg-emerald-100 text-emerald-950",
  },
  REJECTED: {
    label: "Recusado",
    pluralLabel: "Recusados",
    description: "Pedidos recusados pela loja antes do preparo.",
    className: "border-red-200 bg-red-100 text-red-950",
  },
  CANCELED: {
    label: "Cancelado",
    pluralLabel: "Cancelados",
    description: "Pedidos cancelados ou encerrados sem entrega.",
    className: "border-rose-200 bg-rose-100 text-rose-950",
  },
} as const satisfies Record<OrderStatusValue, MerchantOrderStatusCopy>;

export function parseMerchantOrderStatusFilter(
  value: string | string[] | undefined,
): ParsedMerchantOrderStatusFilter {
  if (value === undefined) {
    return { valid: true };
  }

  if (Array.isArray(value)) {
    return { valid: false };
  }

  if (isMerchantOrderStatus(value)) {
    return { valid: true, status: value };
  }

  return { valid: false };
}

export function getMerchantOrderListTitle(status?: OrderStatusValue) {
  return status
    ? `Pedidos ${MERCHANT_ORDER_STATUS_COPY[status].pluralLabel.toLowerCase()}`
    : "Todos os pedidos";
}

export function getMerchantOrderEmptyState(
  status?: OrderStatusValue,
): MerchantOrderPanelCopy {
  if (!status) {
    return {
      title: "Nenhum pedido encontrado",
      description:
        "Quando clientes criarem pedidos para sua loja, eles aparecerão nesta caixa de entrada.",
    };
  }

  return {
    title: `Nenhum pedido ${MERCHANT_ORDER_STATUS_COPY[
      status
    ].label.toLowerCase()} encontrado`,
    description:
      status === "PENDING"
        ? "Não há pedidos recebidos aguardando aceite no momento."
        : `Não há pedidos com status ${MERCHANT_ORDER_STATUS_COPY[
            status
          ].label.toLowerCase()} no momento.`,
  };
}

export function getMerchantOrderInvalidFilterState(): MerchantOrderPanelCopy {
  return {
    title: "Filtro de pedidos inválido",
    description:
      "Escolha um status de pedido válido para filtrar sua caixa de entrada.",
  };
}

export function getMerchantOrderStatusCopy(
  status: OrderStatusValue,
): MerchantOrderStatusCopy {
  return MERCHANT_ORDER_STATUS_COPY[status];
}

function isMerchantOrderStatus(value: string): value is OrderStatusValue {
  return MERCHANT_ORDER_STATUS_VALUES.some((status) => status === value);
}
