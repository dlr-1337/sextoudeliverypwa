import { z } from "zod";

import type { CheckoutFieldErrors, CheckoutOrderPayload } from "./schemas";

export const CASH_ORDER_ERROR_MESSAGES = {
  UNAUTHENTICATED: "Faça login como cliente para criar o pedido.",
  VALIDATION_FAILED: "Revise os itens do pedido.",
  UNSUPPORTED_PAYMENT_METHOD: "Pague em dinheiro para concluir este pedido.",
  DUPLICATE_ITEM: "Remova itens duplicados antes de concluir o pedido.",
  STORE_UNAVAILABLE: "Loja indisponível para receber pedidos no momento.",
  PRODUCT_UNAVAILABLE: "Um ou mais produtos estão indisponíveis no momento.",
  PRODUCT_FROM_DIFFERENT_STORE:
    "Todos os produtos precisam pertencer à mesma loja.",
  PUBLIC_CODE_COLLISION:
    "Não foi possível gerar o código público do pedido. Tente novamente.",
  TRANSACTION_FAILED: "Não foi possível criar o pedido agora. Tente novamente.",
} as const;

export const MERCHANT_ORDER_LIST_ERROR_MESSAGES = {
  INVALID_OWNER: "Não foi possível carregar pedidos para esta sessão merchant.",
  ESTABLISHMENT_NOT_FOUND:
    "Não encontramos uma loja para esta sessão merchant.",
  INVALID_STATUS: "Escolha um status de pedido válido para filtrar a lista.",
  DATABASE_ERROR: "Não foi possível carregar pedidos agora. Tente novamente.",
} as const;

export const MERCHANT_ORDER_DETAIL_ERROR_MESSAGES = {
  INVALID_OWNER: "Não foi possível carregar o pedido para esta sessão merchant.",
  INVALID_ORDER: "Não encontramos este pedido para esta loja.",
  ESTABLISHMENT_NOT_FOUND:
    "Não encontramos uma loja para esta sessão merchant.",
  ORDER_NOT_FOUND: "Não encontramos este pedido para esta loja.",
  DATABASE_ERROR: "Não foi possível carregar o pedido agora. Tente novamente.",
} as const;

export const MERCHANT_ORDER_TRANSITION_NOTE_MAX_LENGTH = 240;

export const MERCHANT_ORDER_TRANSITION_ERROR_MESSAGES = {
  INVALID_OWNER: "Não foi possível atualizar o pedido para esta sessão merchant.",
  INVALID_ORDER: "Não encontramos este pedido para esta loja.",
  INVALID_STATUS: "Escolha status válidos para atualizar o pedido.",
  INVALID_NOTE: "Informe uma observação válida para a atualização do pedido.",
  ESTABLISHMENT_NOT_FOUND:
    "Não encontramos uma loja para esta sessão merchant.",
  INACTIVE_ESTABLISHMENT:
    "Ative a loja antes de atualizar pedidos.",
  ORDER_NOT_FOUND: "Não encontramos este pedido para esta loja.",
  STALE_STATUS: "O pedido foi atualizado em outra sessão. Recarregue e tente novamente.",
  INVALID_TRANSITION: "Esta mudança de status não é permitida para o pedido.",
  DATABASE_ERROR: "Não foi possível atualizar o pedido agora. Tente novamente.",
} as const;

export const CASH_ORDER_ESTABLISHMENT_SELECT = {
  id: true,
  status: true,
  deliveryFee: true,
} as const;

export const CASH_ORDER_PRODUCT_SELECT = {
  id: true,
  establishmentId: true,
  name: true,
  price: true,
  status: true,
} as const;

export const PUBLIC_ORDER_CODE_PATTERN = /^PED-[A-Z0-9][A-Z0-9-]{2,48}$/u;
export const DEFAULT_PUBLIC_CODE_ATTEMPTS = 5;

export const PUBLIC_ORDER_READ_SELECT = {
  publicCode: true,
  status: true,
  paymentMethod: true,
  paymentStatus: true,
  subtotal: true,
  deliveryFee: true,
  discount: true,
  total: true,
  placedAt: true,
  createdAt: true,
  updatedAt: true,
  establishment: {
    select: {
      name: true,
      slug: true,
      logoUrl: true,
    },
  },
  items: {
    select: {
      productName: true,
      unitPrice: true,
      quantity: true,
      total: true,
      notes: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  payment: {
    select: {
      method: true,
      status: true,
      amount: true,
      paidAt: true,
      failedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  statusHistory: {
    select: {
      status: true,
      note: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 20,
  },
} as const;

export const MERCHANT_ORDER_LIST_LIMIT = 50;

export const MERCHANT_ORDER_ESTABLISHMENT_SELECT = {
  id: true,
} as const;

export const MERCHANT_ORDER_LIST_SELECT = {
  id: true,
  publicCode: true,
  status: true,
  paymentMethod: true,
  paymentStatus: true,
  customerName: true,
  subtotal: true,
  deliveryFee: true,
  discount: true,
  total: true,
  placedAt: true,
  acceptedAt: true,
  deliveredAt: true,
  canceledAt: true,
  createdAt: true,
  updatedAt: true,
  payment: {
    select: {
      method: true,
      status: true,
      amount: true,
      paidAt: true,
      failedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;

export const MERCHANT_ORDER_DETAIL_HISTORY_LIMIT = 50;

export const MERCHANT_ORDER_DETAIL_SELECT = {
  publicCode: true,
  status: true,
  paymentMethod: true,
  paymentStatus: true,
  customerName: true,
  customerPhone: true,
  deliveryAddress: true,
  deliveryStreet: true,
  deliveryNumber: true,
  deliveryComplement: true,
  deliveryNeighborhood: true,
  deliveryCity: true,
  deliveryState: true,
  deliveryPostalCode: true,
  deliveryReference: true,
  generalObservation: true,
  notes: true,
  subtotal: true,
  deliveryFee: true,
  discount: true,
  total: true,
  placedAt: true,
  acceptedAt: true,
  deliveredAt: true,
  canceledAt: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      productName: true,
      unitPrice: true,
      quantity: true,
      total: true,
      notes: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  payment: {
    select: {
      method: true,
      status: true,
      amount: true,
      paidAt: true,
      failedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  statusHistory: {
    select: {
      status: true,
      note: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MERCHANT_ORDER_DETAIL_HISTORY_LIMIT,
  },
} as const;

export const MERCHANT_ORDER_TRANSITION_ESTABLISHMENT_SELECT = {
  id: true,
  status: true,
} as const;

export const MERCHANT_ORDER_TRANSITION_SELECT = {
  id: true,
  publicCode: true,
  status: true,
  placedAt: true,
  acceptedAt: true,
  deliveredAt: true,
  canceledAt: true,
  updatedAt: true,
} as const;

const DEFAULT_CASH_ORDER_ENUMS = {
  establishmentStatus: {
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    BLOCKED: "BLOCKED",
    INACTIVE: "INACTIVE",
  },
  productStatus: {
    DRAFT: "DRAFT",
    ACTIVE: "ACTIVE",
    PAUSED: "PAUSED",
    ARCHIVED: "ARCHIVED",
  },
  orderStatus: {
    DRAFT: "DRAFT",
    PENDING: "PENDING",
    ACCEPTED: "ACCEPTED",
    PREPARING: "PREPARING",
    READY_FOR_PICKUP: "READY_FOR_PICKUP",
    OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
    DELIVERED: "DELIVERED",
    REJECTED: "REJECTED",
    CANCELED: "CANCELED",
  },
  paymentMethod: {
    CASH: "CASH",
    PIX: "PIX",
    CARD: "CARD",
    FAKE: "FAKE",
  },
  paymentStatus: {
    PENDING: "PENDING",
    MANUAL_CASH_ON_DELIVERY: "MANUAL_CASH_ON_DELIVERY",
    AUTHORIZED: "AUTHORIZED",
    PAID: "PAID",
    FAILED: "FAILED",
    REFUNDED: "REFUNDED",
    CANCELED: "CANCELED",
  },
} as const satisfies CashOrderServiceEnums;

export type CashOrderFailureCode = keyof typeof CASH_ORDER_ERROR_MESSAGES;
export type MerchantOrderListFailureCode =
  keyof typeof MERCHANT_ORDER_LIST_ERROR_MESSAGES;
export type MerchantOrderDetailFailureCode =
  keyof typeof MERCHANT_ORDER_DETAIL_ERROR_MESSAGES;
export type MerchantOrderTransitionFailureCode =
  keyof typeof MERCHANT_ORDER_TRANSITION_ERROR_MESSAGES;
export type EstablishmentStatusValue =
  | "PENDING"
  | "ACTIVE"
  | "BLOCKED"
  | "INACTIVE";
export type ProductStatusValue = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
export type OrderStatusValue =
  | "DRAFT"
  | "PENDING"
  | "ACCEPTED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "REJECTED"
  | "CANCELED";

export const ORDER_STATUS_VALUES = [
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

export const ALLOWED_MERCHANT_ORDER_TRANSITIONS = {
  DRAFT: [],
  PENDING: ["ACCEPTED", "REJECTED", "CANCELED"],
  ACCEPTED: ["PREPARING", "CANCELED"],
  PREPARING: ["OUT_FOR_DELIVERY", "CANCELED"],
  READY_FOR_PICKUP: [],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELED"],
  DELIVERED: [],
  REJECTED: [],
  CANCELED: [],
} as const satisfies Record<OrderStatusValue, readonly OrderStatusValue[]>;
export type PaymentMethodValue = "CASH" | "PIX" | "CARD" | "FAKE";
export type PaymentStatusValue =
  | "PENDING"
  | "MANUAL_CASH_ON_DELIVERY"
  | "AUTHORIZED"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "CANCELED";
export type DecimalLike = { toString(): string } | number | string;

export type CashOrderFailure = {
  ok: false;
  code: CashOrderFailureCode;
  message: string;
  fieldErrors: CheckoutFieldErrors;
  formErrors: string[];
  retryable: boolean;
};

export type CashOrderSuccess<TData> = {
  ok: true;
  data: TData;
};

export type CashOrderResult<TData> = CashOrderFailure | CashOrderSuccess<TData>;

export type MerchantOrderListFailure = {
  ok: false;
  code: MerchantOrderListFailureCode;
  message: string;
  retryable: boolean;
};

export type MerchantOrderListSuccess<TData> = {
  ok: true;
  data: TData;
};

export type MerchantOrderListResult<TData> =
  | MerchantOrderListFailure
  | MerchantOrderListSuccess<TData>;

export type MerchantOrderDetailFailure = {
  ok: false;
  code: MerchantOrderDetailFailureCode;
  message: string;
  retryable: boolean;
};

export type MerchantOrderDetailSuccess<TData> = {
  ok: true;
  data: TData;
};

export type MerchantOrderDetailResult<TData> =
  | MerchantOrderDetailFailure
  | MerchantOrderDetailSuccess<TData>;

export type MerchantOrderTransitionFailure = {
  ok: false;
  code: MerchantOrderTransitionFailureCode;
  message: string;
  retryable: boolean;
};

export type MerchantOrderTransitionSuccess<TData> = {
  ok: true;
  data: TData;
};

export type MerchantOrderTransitionResult<TData> =
  | MerchantOrderTransitionFailure
  | MerchantOrderTransitionSuccess<TData>;

export type MerchantOrderListInput = {
  status?: unknown;
  limit?: unknown;
};

export type MerchantOrderTransitionInput = {
  orderId: string;
  expectedStatus: OrderStatusValue;
  targetStatus: OrderStatusValue;
  note: string | null;
};

export type MerchantOrderTransitionTimestampData = {
  acceptedAt?: Date;
  deliveredAt?: Date;
  canceledAt?: Date;
};

export type MerchantOrderTransitionDto = {
  publicCode: string;
  previousStatus: OrderStatusValue;
  status: OrderStatusValue;
  placedAt: Date | null;
  acceptedAt: Date | null;
  deliveredAt: Date | null;
  canceledAt: Date | null;
  updatedAt: Date;
  note: string | null;
  changedAt: Date;
};

export type CreatedCashOrder = {
  publicCode: string;
  redirectPath: string;
};

export type PublicOrderEstablishmentDto = {
  name: string;
  slug: string;
  logoUrl: string | null;
};

export type PublicOrderItemDto = {
  productName: string;
  unitPrice: string;
  quantity: number;
  total: string;
  notes: string | null;
  createdAt: Date;
};

export type PublicOrderPaymentDto = {
  method: PaymentMethodValue;
  status: PaymentStatusValue;
  amount: string;
  paidAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicOrderStatusHistoryDto = {
  status: OrderStatusValue;
  note: string | null;
  createdAt: Date;
};

export type PublicOrderDto = {
  publicCode: string;
  status: OrderStatusValue;
  paymentMethod: PaymentMethodValue;
  paymentStatus: PaymentStatusValue;
  subtotal: string;
  deliveryFee: string;
  discount: string;
  total: string;
  placedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  establishment: PublicOrderEstablishmentDto;
  items: PublicOrderItemDto[];
  payment: PublicOrderPaymentDto | null;
  statusHistory: PublicOrderStatusHistoryDto[];
};

export type MerchantOrderListPaymentDto = {
  method: PaymentMethodValue;
  status: PaymentStatusValue;
  amount: string;
  paidAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MerchantOrderListItemDto = {
  id: string;
  publicCode: string;
  status: OrderStatusValue;
  paymentMethod: PaymentMethodValue;
  paymentStatus: PaymentStatusValue;
  customerName: string;
  subtotal: string;
  deliveryFee: string;
  discount: string;
  total: string;
  placedAt: Date | null;
  acceptedAt: Date | null;
  deliveredAt: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  payment: MerchantOrderListPaymentDto | null;
};

export type MerchantOrderListDto = {
  orders: MerchantOrderListItemDto[];
  status: OrderStatusValue | null;
  limit: number;
  count: number;
};

export type MerchantOrderDetailCustomerDto = {
  name: string;
  phone: string;
};

export type MerchantOrderDetailDeliveryDto = {
  address: string | null;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  reference: string | null;
};

export type MerchantOrderDetailObservationDto = {
  customer: string | null;
  internal: string | null;
};

export type MerchantOrderDetailItemDto = {
  productName: string;
  unitPrice: string;
  quantity: number;
  total: string;
  notes: string | null;
  createdAt: Date;
};

export type MerchantOrderDetailPaymentDto = {
  method: PaymentMethodValue;
  status: PaymentStatusValue;
  amount: string;
  paidAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MerchantOrderDetailStatusHistoryDto = {
  status: OrderStatusValue;
  note: string | null;
  createdAt: Date;
};

export type MerchantOrderDetailTotalsDto = {
  subtotal: string;
  deliveryFee: string;
  discount: string;
  total: string;
};

export type MerchantOrderDetailTimestampsDto = {
  placedAt: Date | null;
  acceptedAt: Date | null;
  deliveredAt: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MerchantOrderDetailDto = {
  publicCode: string;
  status: OrderStatusValue;
  paymentMethod: PaymentMethodValue;
  paymentStatus: PaymentStatusValue;
  customer: MerchantOrderDetailCustomerDto;
  delivery: MerchantOrderDetailDeliveryDto;
  observation: MerchantOrderDetailObservationDto;
  items: MerchantOrderDetailItemDto[];
  payment: MerchantOrderDetailPaymentDto | null;
  statusHistory: MerchantOrderDetailStatusHistoryDto[];
  totals: MerchantOrderDetailTotalsDto;
  timestamps: MerchantOrderDetailTimestampsDto;
};

export type CashOrderDbEstablishment = {
  id: string;
  status: EstablishmentStatusValue;
  deliveryFee: DecimalLike;
};

export type CashOrderDbProduct = {
  id: string;
  establishmentId: string;
  name: string;
  price: DecimalLike;
  status: ProductStatusValue;
};

export type CashOrderServiceEnums = {
  establishmentStatus: Record<EstablishmentStatusValue, EstablishmentStatusValue>;
  productStatus: Record<ProductStatusValue, ProductStatusValue>;
  orderStatus: Record<OrderStatusValue, OrderStatusValue>;
  paymentMethod: Record<PaymentMethodValue, PaymentMethodValue>;
  paymentStatus: Record<PaymentStatusValue, PaymentStatusValue>;
};

export type CashOrderEstablishmentFindUniqueArgs = {
  where: { id: string };
  select?: unknown;
};

export type CashOrderProductFindManyArgs = {
  where: { id: { in: string[] } };
  select?: unknown;
};

export type CashOrderCreateData = {
  publicCode: string;
  establishmentId: string;
  customerId: string;
  status: OrderStatusValue;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryStreet: string;
  deliveryNumber: string;
  deliveryComplement: string | null;
  deliveryNeighborhood: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPostalCode: string;
  deliveryReference: string | null;
  generalObservation: string | null;
  paymentMethod: PaymentMethodValue;
  paymentStatus: PaymentStatusValue;
  subtotal: string;
  deliveryFee: string;
  discount: string;
  total: string;
  notes: string | null;
  placedAt: Date;
};

export type CashOrderCreateArgs = {
  data: CashOrderCreateData;
  select?: unknown;
};

export type CashOrderCreatedRow = {
  id: string;
  publicCode: string;
};

export type CashOrderItemCreateManyData = {
  orderId: string;
  productId: string | null;
  productName: string;
  unitPrice: string;
  quantity: number;
  total: string;
  notes: string | null;
};

export type CashOrderPaymentCreateData = {
  orderId: string;
  method: PaymentMethodValue;
  status: PaymentStatusValue;
  amount: string;
  provider: string | null;
  providerPaymentId: string | null;
  providerStatus: string | null;
  providerPayload: null;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  pixExpiresAt: Date | null;
  cardBrand: string | null;
  cardLast4: string | null;
  paidAt: Date | null;
  failedAt: Date | null;
};

export type CashOrderStatusHistoryCreateData = {
  orderId: string;
  status: OrderStatusValue;
  changedById: string | null;
  note: string | null;
  createdAt: Date;
};

export type PublicOrderReadRow = {
  publicCode: string;
  status: OrderStatusValue;
  paymentMethod: PaymentMethodValue;
  paymentStatus: PaymentStatusValue;
  subtotal: DecimalLike;
  deliveryFee: DecimalLike;
  discount: DecimalLike;
  total: DecimalLike;
  placedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  establishment: PublicOrderEstablishmentDto;
  items: Array<{
    productName: string;
    unitPrice: DecimalLike;
    quantity: number;
    total: DecimalLike;
    notes: string | null;
    createdAt: Date;
  }>;
  payment: {
    method: PaymentMethodValue;
    status: PaymentStatusValue;
    amount: DecimalLike;
    paidAt: Date | null;
    failedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  statusHistory: Array<{
    status: OrderStatusValue;
    note: string | null;
    createdAt: Date;
  }>;
};

export type PublicOrderFindUniqueArgs = {
  where: { publicCode: string };
  select?: unknown;
};

export type MerchantOrderDbEstablishment = {
  id: string;
};

export type MerchantOrderTransitionDbEstablishment = {
  id: string;
  status: EstablishmentStatusValue;
};

export type MerchantOrderListPaymentRow = {
  method: PaymentMethodValue;
  status: PaymentStatusValue;
  amount: DecimalLike;
  paidAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MerchantOrderListRow = {
  id: string;
  publicCode: string;
  status: OrderStatusValue;
  paymentMethod: PaymentMethodValue;
  paymentStatus: PaymentStatusValue;
  customerName: string;
  subtotal: DecimalLike;
  deliveryFee: DecimalLike;
  discount: DecimalLike;
  total: DecimalLike;
  placedAt: Date | null;
  acceptedAt: Date | null;
  deliveredAt: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  payment: MerchantOrderListPaymentRow | null;
};

export type MerchantOrderDetailItemRow = {
  productName: string;
  unitPrice: DecimalLike;
  quantity: number;
  total: DecimalLike;
  notes: string | null;
  createdAt: Date;
};

export type MerchantOrderDetailPaymentRow = {
  method: PaymentMethodValue;
  status: PaymentStatusValue;
  amount: DecimalLike;
  paidAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MerchantOrderDetailStatusHistoryRow = {
  status: OrderStatusValue;
  note: string | null;
  createdAt: Date;
};

export type MerchantOrderDetailRow = {
  publicCode: string;
  status: OrderStatusValue;
  paymentMethod: PaymentMethodValue;
  paymentStatus: PaymentStatusValue;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string | null;
  deliveryStreet: string;
  deliveryNumber: string;
  deliveryComplement: string | null;
  deliveryNeighborhood: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPostalCode: string;
  deliveryReference: string | null;
  generalObservation: string | null;
  notes: string | null;
  subtotal: DecimalLike;
  deliveryFee: DecimalLike;
  discount: DecimalLike;
  total: DecimalLike;
  placedAt: Date | null;
  acceptedAt: Date | null;
  deliveredAt: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: MerchantOrderDetailItemRow[];
  payment: MerchantOrderDetailPaymentRow | null;
  statusHistory: MerchantOrderDetailStatusHistoryRow[];
};

export type MerchantOrderTransitionRow = {
  id: string;
  publicCode: string;
  status: OrderStatusValue;
  placedAt: Date | null;
  acceptedAt: Date | null;
  deliveredAt: Date | null;
  canceledAt: Date | null;
  updatedAt: Date;
};

export type MerchantOrderEstablishmentFindFirstArgs = {
  where: { ownerId: string };
  orderBy?: Array<{ createdAt: "asc" | "desc" } | { id: "asc" | "desc" }>;
  select?: unknown;
};

export type MerchantOrderTransitionEstablishmentFindFirstArgs = {
  where: { ownerId: string };
  orderBy?: Array<{ createdAt: "asc" | "desc" } | { id: "asc" | "desc" }>;
  select?: unknown;
};

export type MerchantOrderFindManyArgs = {
  where: {
    establishmentId: string;
    status?: OrderStatusValue;
  };
  orderBy?: Array<{ createdAt: "asc" | "desc" } | { id: "asc" | "desc" }>;
  take?: number;
  select?: unknown;
};

export type MerchantOrderFindFirstArgs = {
  where: {
    id: string;
    establishmentId: string;
  };
  select?: unknown;
};

export type MerchantOrderTransitionFindFirstArgs = {
  where: {
    id: string;
    establishmentId: string;
  };
  select?: unknown;
};

export type MerchantOrderTransitionUpdateManyArgs = {
  where: {
    id: string;
    establishmentId: string;
    status: OrderStatusValue;
  };
  data: {
    status: OrderStatusValue;
    updatedAt: Date;
    acceptedAt?: Date;
    deliveredAt?: Date;
    canceledAt?: Date;
  };
};

export type CashOrderTransactionClient = {
  establishment: {
    findUnique(
      args: CashOrderEstablishmentFindUniqueArgs,
    ): Promise<CashOrderDbEstablishment | null>;
  };
  product: {
    findMany(args: CashOrderProductFindManyArgs): Promise<CashOrderDbProduct[]>;
  };
  order: {
    create(args: CashOrderCreateArgs): Promise<CashOrderCreatedRow>;
  };
  orderItem: {
    createMany(args: {
      data: CashOrderItemCreateManyData[];
    }): Promise<{ count: number }>;
  };
  payment: {
    create(args: { data: CashOrderPaymentCreateData }): Promise<unknown>;
  };
  orderStatusHistory: {
    create(args: { data: CashOrderStatusHistoryCreateData }): Promise<unknown>;
  };
};

export type OrderServiceTransactionClient = Omit<
  CashOrderTransactionClient,
  "establishment" | "order"
> & {
  establishment: CashOrderTransactionClient["establishment"] & {
    findFirst(
      args: MerchantOrderTransitionEstablishmentFindFirstArgs,
    ): Promise<MerchantOrderTransitionDbEstablishment | null>;
  };
  order: CashOrderTransactionClient["order"] & {
    findFirst(
      args: MerchantOrderTransitionFindFirstArgs,
    ): Promise<MerchantOrderTransitionRow | null>;
    updateMany(
      args: MerchantOrderTransitionUpdateManyArgs,
    ): Promise<{ count: number }>;
  };
};

export type CashOrderServiceClient<
  TTransactionClient extends CashOrderTransactionClient = CashOrderTransactionClient,
> = {
  $transaction<TResult>(
    callback: (tx: TTransactionClient) => Promise<TResult>,
  ): Promise<TResult>;
};

export type OrderServiceClient = CashOrderServiceClient<OrderServiceTransactionClient> & {
  establishment: {
    findFirst(
      args: MerchantOrderEstablishmentFindFirstArgs,
    ): Promise<MerchantOrderDbEstablishment | null>;
  };
  order: {
    findUnique(args: PublicOrderFindUniqueArgs): Promise<PublicOrderReadRow | null>;
    findMany(args: MerchantOrderFindManyArgs): Promise<MerchantOrderListRow[]>;
    findFirst(args: MerchantOrderFindFirstArgs): Promise<MerchantOrderDetailRow | null>;
  };
};

export type CashOrderPublicCodeGenerator = (now: Date) => string;

export type CashOrderServiceCoreDependencies = {
  db: CashOrderServiceClient;
  enums?: CashOrderServiceEnums;
  now?: () => Date;
  generatePublicCode?: CashOrderPublicCodeGenerator;
};

export type OrderServiceCoreDependencies = Omit<
  CashOrderServiceCoreDependencies,
  "db"
> & {
  db: OrderServiceClient;
  maxPublicCodeAttempts?: number;
};

type ItemSnapshot = CashOrderItemCreateManyData;

type ValidatedProductLine = {
  product: CashOrderDbProduct;
  quantity: number;
  lineTotalCents: number;
};

const merchantOrderOwnerInputSchema = z
  .object({
    ownerId: z
      .string({ error: "Informe o identificador do comerciante." })
      .trim()
      .min(1, "Informe o identificador do comerciante.")
      .max(128, "Informe um identificador com até 128 caracteres."),
  })
  .strict();

const merchantOrderIdInputSchema = z
  .object({
    orderId: z
      .string({ error: "Informe o identificador do pedido." })
      .trim()
      .min(1, "Informe o identificador do pedido.")
      .max(128, "Informe um identificador com até 128 caracteres."),
  })
  .strict();

const merchantOrderTransitionStatusInputSchema = z
  .string({ error: "Escolha um status de pedido válido." })
  .trim()
  .refine(isOrderStatus, "Escolha um status de pedido válido.")
  .transform((status) => status as OrderStatusValue);

const merchantOrderTransitionNoteInputSchema = z
  .preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z
      .string({ error: "Informe uma observação válida." })
      .max(
        MERCHANT_ORDER_TRANSITION_NOTE_MAX_LENGTH,
        "Informe uma observação mais curta.",
      )
      .transform((note) => (note.length > 0 ? note : null)),
  )
  .optional()
  .transform((note) => note ?? null);

const merchantOrderTransitionInputSchema = z
  .object({
    orderId: z
      .string({ error: "Informe o identificador do pedido." })
      .trim()
      .min(1, "Informe o identificador do pedido.")
      .max(128, "Informe um identificador com até 128 caracteres."),
    expectedStatus: merchantOrderTransitionStatusInputSchema,
    targetStatus: merchantOrderTransitionStatusInputSchema,
    note: merchantOrderTransitionNoteInputSchema,
  })
  .strict();

export function createCashOrderCore(
  dependencies: CashOrderServiceCoreDependencies,
) {
  const db = dependencies.db;
  const enums = dependencies.enums ?? DEFAULT_CASH_ORDER_ENUMS;
  const now = dependencies.now ?? (() => new Date());
  const generatePublicCode =
    dependencies.generatePublicCode ?? defaultGeneratePublicCode;

  async function createCashOrder(
    customerIdInput: unknown,
    payload: CheckoutOrderPayload,
  ): Promise<CashOrderResult<CreatedCashOrder>> {
    const customerId = parseAuthenticatedCustomerId(customerIdInput);

    if (!customerId.ok) {
      return customerId;
    }

    const payloadValidation = validateParsedPayload(payload, enums);

    if (!payloadValidation.ok) {
      return payloadValidation;
    }

    try {
      return await db.$transaction(async (tx) => {
        const establishment = await tx.establishment.findUnique({
          where: { id: payload.establishmentId },
          select: CASH_ORDER_ESTABLISHMENT_SELECT,
        });

        if (!establishment || establishment.status !== enums.establishmentStatus.ACTIVE) {
          return cashOrderFailure("STORE_UNAVAILABLE");
        }

        const deliveryFeeCents = moneyToCents(establishment.deliveryFee);

        if (deliveryFeeCents === null || deliveryFeeCents < 0) {
          return cashOrderFailure("STORE_UNAVAILABLE");
        }

        const products = await tx.product.findMany({
          where: { id: { in: payload.items.map((item) => item.productId) } },
          select: CASH_ORDER_PRODUCT_SELECT,
        });
        const productsById = new Map(products.map((product) => [product.id, product]));
        const validatedLines = validateProductLines(
          payload,
          establishment.id,
          productsById,
          enums,
        );

        if (!validatedLines.ok) {
          return validatedLines;
        }

        const timestamp = now();
        const publicCode = generatePublicCode(timestamp);

        if (!isPublicOrderCode(publicCode)) {
          return cashOrderFailure("PUBLIC_CODE_COLLISION", { retryable: true });
        }

        const subtotalCents = validatedLines.data.reduce(
          (sum, line) => sum + line.lineTotalCents,
          0,
        );
        const discountCents = 0;
        const totalCents = subtotalCents + deliveryFeeCents - discountCents;
        const order = await tx.order.create({
          data: {
            publicCode,
            establishmentId: establishment.id,
            customerId: customerId.data,
            status: enums.orderStatus.PENDING,
            customerName: payload.customerName,
            customerPhone: payload.customerPhone,
            deliveryAddress: formatDeliveryAddress(payload),
            deliveryStreet: payload.deliveryStreet,
            deliveryNumber: payload.deliveryNumber,
            deliveryComplement: payload.deliveryComplement,
            deliveryNeighborhood: payload.deliveryNeighborhood,
            deliveryCity: payload.deliveryCity,
            deliveryState: payload.deliveryState,
            deliveryPostalCode: payload.deliveryPostalCode,
            deliveryReference: payload.deliveryReference,
            generalObservation: payload.generalObservation,
            paymentMethod: enums.paymentMethod.CASH,
            paymentStatus: enums.paymentStatus.MANUAL_CASH_ON_DELIVERY,
            subtotal: formatCents(subtotalCents),
            deliveryFee: formatCents(deliveryFeeCents),
            discount: formatCents(discountCents),
            total: formatCents(totalCents),
            notes: null,
            placedAt: timestamp,
          },
          select: { id: true, publicCode: true },
        });
        const itemSnapshots = toItemSnapshots(order.id, validatedLines.data);

        await tx.orderItem.createMany({ data: itemSnapshots });
        await tx.payment.create({
          data: {
            orderId: order.id,
            method: enums.paymentMethod.CASH,
            status: enums.paymentStatus.MANUAL_CASH_ON_DELIVERY,
            amount: formatCents(totalCents),
            provider: null,
            providerPaymentId: null,
            providerStatus: null,
            providerPayload: null,
            pixQrCode: null,
            pixCopyPaste: null,
            pixExpiresAt: null,
            cardBrand: null,
            cardLast4: null,
            paidAt: null,
            failedAt: null,
          },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: enums.orderStatus.PENDING,
            changedById: customerId.data,
            note: "Pedido criado pelo checkout.",
            createdAt: timestamp,
          },
        });

        return cashOrderSuccess({
          publicCode: order.publicCode,
          redirectPath: `/pedido/${order.publicCode}`,
        });
      });
    } catch (error) {
      return cashOrderFailureFromTransaction(error);
    }
  }

  return { createCashOrder };
}

export type CashOrderServiceCore = ReturnType<typeof createCashOrderCore>;

export function createOrderServiceCore(
  dependencies: OrderServiceCoreDependencies,
) {
  const cashOrderCore = createCashOrderCore(dependencies);
  const enums = dependencies.enums ?? DEFAULT_CASH_ORDER_ENUMS;
  const now = dependencies.now ?? (() => new Date());
  const maxPublicCodeAttempts = normalizePublicCodeAttempts(
    dependencies.maxPublicCodeAttempts,
  );

  async function createCashOrder(
    customerIdInput: unknown,
    payload: CheckoutOrderPayload,
  ): Promise<CashOrderResult<CreatedCashOrder>> {
    let lastPublicCodeFailure: CashOrderFailure | null = null;

    for (let attempt = 0; attempt < maxPublicCodeAttempts; attempt += 1) {
      const result = await cashOrderCore.createCashOrder(customerIdInput, payload);

      if (result.ok || result.code !== "PUBLIC_CODE_COLLISION") {
        return result;
      }

      lastPublicCodeFailure = result;
    }

    return (
      lastPublicCodeFailure ??
      cashOrderFailure("PUBLIC_CODE_COLLISION", { retryable: true })
    );
  }

  async function getPublicOrderByCode(
    publicCodeInput: unknown,
  ): Promise<PublicOrderDto | null> {
    const publicCode = parsePublicOrderCode(publicCodeInput);

    if (!publicCode) {
      return null;
    }

    const order = await dependencies.db.order.findUnique({
      where: { publicCode },
      select: PUBLIC_ORDER_READ_SELECT,
    });

    return order ? toPublicOrderDto(order) : null;
  }

  async function listMerchantOrdersForOwner(
    ownerIdInput: unknown,
    input: MerchantOrderListInput = {},
  ): Promise<MerchantOrderListResult<MerchantOrderListDto>> {
    const ownerId = parseMerchantOwnerId(ownerIdInput);

    if (!ownerId.ok) {
      return ownerId;
    }

    const status = parseMerchantOrderStatusInput(input.status);

    if (!status.ok) {
      return status;
    }

    const limit = parseMerchantOrderListLimit(input.limit);
    const establishment = await readMerchantOrderEstablishment(ownerId.data);

    if (!establishment.ok) {
      return establishment;
    }

    try {
      const orders = await dependencies.db.order.findMany({
        where: {
          establishmentId: establishment.data.id,
          ...(status.data ? { status: status.data } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        select: MERCHANT_ORDER_LIST_SELECT,
      });

      return merchantOrderListSuccess({
        orders: orders.map(toMerchantOrderListItemDto),
        status: status.data,
        limit,
        count: orders.length,
      });
    } catch {
      return merchantOrderListFailure("DATABASE_ERROR", { retryable: true });
    }
  }

  async function getMerchantOrderDetailForOwner(
    ownerIdInput: unknown,
    orderIdInput: unknown,
  ): Promise<MerchantOrderDetailResult<MerchantOrderDetailDto>> {
    const ownerId = parseMerchantOwnerIdForDetail(ownerIdInput);

    if (!ownerId.ok) {
      return ownerId;
    }

    const orderId = parseMerchantOrderId(orderIdInput);

    if (!orderId.ok) {
      return orderId;
    }

    const establishment = await readMerchantOrderDetailEstablishment(ownerId.data);

    if (!establishment.ok) {
      return establishment;
    }

    try {
      const order = await dependencies.db.order.findFirst({
        where: {
          id: orderId.data,
          establishmentId: establishment.data.id,
        },
        select: MERCHANT_ORDER_DETAIL_SELECT,
      });

      if (!order) {
        return merchantOrderDetailFailure("ORDER_NOT_FOUND");
      }

      return merchantOrderDetailSuccess(toMerchantOrderDetailDto(order));
    } catch {
      return merchantOrderDetailFailure("DATABASE_ERROR", { retryable: true });
    }
  }

  async function transitionMerchantOrderStatusForOwner(
    ownerIdInput: unknown,
    input: unknown,
  ): Promise<MerchantOrderTransitionResult<MerchantOrderTransitionDto>> {
    const ownerId = parseMerchantOrderTransitionOwnerId(ownerIdInput);

    if (!ownerId.ok) {
      return ownerId;
    }

    const transitionInput = parseMerchantOrderTransitionInput(input);

    if (!transitionInput.ok) {
      return transitionInput;
    }

    try {
      return await dependencies.db.$transaction(async (tx) => {
        const establishment = await tx.establishment.findFirst({
          where: { ownerId: ownerId.data },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: MERCHANT_ORDER_TRANSITION_ESTABLISHMENT_SELECT,
        });

        if (!establishment) {
          return merchantOrderTransitionFailure("ESTABLISHMENT_NOT_FOUND");
        }

        if (establishment.status !== enums.establishmentStatus.ACTIVE) {
          return merchantOrderTransitionFailure("INACTIVE_ESTABLISHMENT");
        }

        const order = await tx.order.findFirst({
          where: {
            id: transitionInput.data.orderId,
            establishmentId: establishment.id,
          },
          select: MERCHANT_ORDER_TRANSITION_SELECT,
        });

        if (!order) {
          return merchantOrderTransitionFailure("ORDER_NOT_FOUND");
        }

        assertMerchantOrderTransitionRow(order);
        const orderSnapshot = { ...order };

        if (orderSnapshot.status !== transitionInput.data.expectedStatus) {
          return merchantOrderTransitionFailure("STALE_STATUS");
        }

        if (
          !canMerchantTransitionOrderStatus(
            transitionInput.data.expectedStatus,
            transitionInput.data.targetStatus,
          )
        ) {
          return merchantOrderTransitionFailure("INVALID_TRANSITION");
        }

        const changedAt = now();
        const timestampData = buildMerchantOrderTransitionTimestampData(
          transitionInput.data.targetStatus,
          changedAt,
        );

        if (!timestampData.ok) {
          return timestampData;
        }

        const updateResult = await tx.order.updateMany({
          where: {
            id: orderSnapshot.id,
            establishmentId: establishment.id,
            status: transitionInput.data.expectedStatus,
          },
          data: {
            status: transitionInput.data.targetStatus,
            updatedAt: changedAt,
            ...timestampData.data,
          },
        });

        if (updateResult.count !== 1) {
          return merchantOrderTransitionFailure("STALE_STATUS");
        }

        await tx.orderStatusHistory.create({
          data: {
            orderId: orderSnapshot.id,
            status: transitionInput.data.targetStatus,
            changedById: ownerId.data,
            note: transitionInput.data.note,
            createdAt: changedAt,
          },
        });

        return merchantOrderTransitionSuccess(
          toMerchantOrderTransitionDto({
            order: orderSnapshot,
            targetStatus: transitionInput.data.targetStatus,
            note: transitionInput.data.note,
            timestampData: timestampData.data,
            changedAt,
          }),
        );
      });
    } catch {
      return merchantOrderTransitionFailure("DATABASE_ERROR", { retryable: true });
    }
  }

  async function readMerchantOrderEstablishment(
    ownerId: string,
  ): Promise<MerchantOrderListResult<MerchantOrderDbEstablishment>> {
    try {
      const establishment = await dependencies.db.establishment.findFirst({
        where: { ownerId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: MERCHANT_ORDER_ESTABLISHMENT_SELECT,
      });

      if (!establishment) {
        return merchantOrderListFailure("ESTABLISHMENT_NOT_FOUND");
      }

      return merchantOrderListSuccess(establishment);
    } catch {
      return merchantOrderListFailure("DATABASE_ERROR", { retryable: true });
    }
  }

  async function readMerchantOrderDetailEstablishment(
    ownerId: string,
  ): Promise<MerchantOrderDetailResult<MerchantOrderDbEstablishment>> {
    try {
      const establishment = await dependencies.db.establishment.findFirst({
        where: { ownerId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: MERCHANT_ORDER_ESTABLISHMENT_SELECT,
      });

      if (!establishment) {
        return merchantOrderDetailFailure("ESTABLISHMENT_NOT_FOUND");
      }

      return merchantOrderDetailSuccess(establishment);
    } catch {
      return merchantOrderDetailFailure("DATABASE_ERROR", { retryable: true });
    }
  }

  return {
    createCashOrder,
    getPublicOrderByCode,
    listMerchantOrdersForOwner,
    getMerchantOrderDetailForOwner,
    transitionMerchantOrderStatusForOwner,
  };
}

export type OrderServiceCore = ReturnType<typeof createOrderServiceCore>;

export function parseMerchantOrderTransitionOwnerId(
  ownerIdInput: unknown,
): MerchantOrderTransitionResult<string> {
  const parsed = merchantOrderOwnerInputSchema.safeParse({ ownerId: ownerIdInput });

  if (!parsed.success) {
    return merchantOrderTransitionFailure("INVALID_OWNER");
  }

  return merchantOrderTransitionSuccess(parsed.data.ownerId);
}

export function parseMerchantOrderTransitionInput(
  input: unknown,
): MerchantOrderTransitionResult<MerchantOrderTransitionInput> {
  const parsed = merchantOrderTransitionInputSchema.safeParse(input);

  if (!parsed.success) {
    const issuePaths = parsed.error.issues.map((issue) => issue.path[0]);

    if (issuePaths.includes("note")) {
      return merchantOrderTransitionFailure("INVALID_NOTE");
    }

    if (issuePaths.includes("orderId")) {
      return merchantOrderTransitionFailure("INVALID_ORDER");
    }

    return merchantOrderTransitionFailure("INVALID_STATUS");
  }

  return merchantOrderTransitionSuccess(parsed.data);
}

export function getAllowedMerchantOrderTransitionTargets(
  status: OrderStatusValue,
): readonly OrderStatusValue[] {
  return ALLOWED_MERCHANT_ORDER_TRANSITIONS[status];
}

export function canMerchantTransitionOrderStatus(
  expectedStatus: OrderStatusValue,
  targetStatus: OrderStatusValue,
): boolean {
  return getAllowedMerchantOrderTransitionTargets(expectedStatus).includes(
    targetStatus,
  );
}

export function buildMerchantOrderTransitionTimestampData(
  targetStatus: OrderStatusValue,
  changedAt: Date,
): MerchantOrderTransitionResult<MerchantOrderTransitionTimestampData> {
  switch (targetStatus) {
    case "ACCEPTED":
      return merchantOrderTransitionSuccess({ acceptedAt: changedAt });
    case "PREPARING":
    case "OUT_FOR_DELIVERY":
      return merchantOrderTransitionSuccess({});
    case "DELIVERED":
      return merchantOrderTransitionSuccess({ deliveredAt: changedAt });
    case "REJECTED":
    case "CANCELED":
      return merchantOrderTransitionSuccess({ canceledAt: changedAt });
    case "DRAFT":
    case "PENDING":
    case "READY_FOR_PICKUP":
      return merchantOrderTransitionFailure("INVALID_TRANSITION");
  }
}

export function merchantOrderTransitionSuccess<TData>(
  data: TData,
): MerchantOrderTransitionResult<TData> {
  return { ok: true, data };
}

export function merchantOrderTransitionFailure(
  code: MerchantOrderTransitionFailureCode,
  options: { retryable?: boolean } = {},
): MerchantOrderTransitionFailure {
  return {
    ok: false,
    code,
    message: MERCHANT_ORDER_TRANSITION_ERROR_MESSAGES[code],
    retryable: options.retryable ?? false,
  };
}

export function parsePublicOrderCode(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const publicCode = input.trim().toUpperCase();

  return isPublicOrderCode(publicCode) ? publicCode : null;
}

export function isPublicOrderCode(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_ORDER_CODE_PATTERN.test(value);
}

export function toPublicOrderDto(order: PublicOrderReadRow): PublicOrderDto {
  return {
    publicCode: order.publicCode,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    subtotal: formatMoneyForDto(order.subtotal),
    deliveryFee: formatMoneyForDto(order.deliveryFee),
    discount: formatMoneyForDto(order.discount),
    total: formatMoneyForDto(order.total),
    placedAt: order.placedAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    establishment: {
      name: order.establishment.name,
      slug: order.establishment.slug,
      logoUrl: order.establishment.logoUrl,
    },
    items: order.items.map((item) => ({
      productName: item.productName,
      unitPrice: formatMoneyForDto(item.unitPrice),
      quantity: item.quantity,
      total: formatMoneyForDto(item.total),
      notes: item.notes,
      createdAt: item.createdAt,
    })),
    payment: order.payment
      ? {
          method: order.payment.method,
          status: order.payment.status,
          amount: formatMoneyForDto(order.payment.amount),
          paidAt: order.payment.paidAt,
          failedAt: order.payment.failedAt,
          createdAt: order.payment.createdAt,
          updatedAt: order.payment.updatedAt,
        }
      : null,
    statusHistory: order.statusHistory.map((history) => ({
      status: history.status,
      note: history.note,
      createdAt: history.createdAt,
    })),
  };
}

export function toMerchantOrderListItemDto(
  order: MerchantOrderListRow,
): MerchantOrderListItemDto {
  return {
    id: order.id,
    publicCode: order.publicCode,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    customerName: order.customerName,
    subtotal: formatMoneyForDto(order.subtotal),
    deliveryFee: formatMoneyForDto(order.deliveryFee),
    discount: formatMoneyForDto(order.discount),
    total: formatMoneyForDto(order.total),
    placedAt: order.placedAt,
    acceptedAt: order.acceptedAt,
    deliveredAt: order.deliveredAt,
    canceledAt: order.canceledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    payment: order.payment
      ? {
          method: order.payment.method,
          status: order.payment.status,
          amount: formatMoneyForDto(order.payment.amount),
          paidAt: order.payment.paidAt,
          failedAt: order.payment.failedAt,
          createdAt: order.payment.createdAt,
          updatedAt: order.payment.updatedAt,
        }
      : null,
  };
}

export function toMerchantOrderDetailDto(
  order: MerchantOrderDetailRow,
): MerchantOrderDetailDto {
  return {
    publicCode: order.publicCode,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    customer: {
      name: order.customerName,
      phone: order.customerPhone,
    },
    delivery: {
      address: order.deliveryAddress,
      street: order.deliveryStreet,
      number: order.deliveryNumber,
      complement: order.deliveryComplement,
      neighborhood: order.deliveryNeighborhood,
      city: order.deliveryCity,
      state: order.deliveryState,
      postalCode: order.deliveryPostalCode,
      reference: order.deliveryReference,
    },
    observation: {
      customer: order.generalObservation,
      internal: order.notes,
    },
    items: order.items.map((item) => ({
      productName: item.productName,
      unitPrice: formatMoneyForDto(item.unitPrice),
      quantity: item.quantity,
      total: formatMoneyForDto(item.total),
      notes: item.notes,
      createdAt: item.createdAt,
    })),
    payment: order.payment
      ? {
          method: order.payment.method,
          status: order.payment.status,
          amount: formatMoneyForDto(order.payment.amount),
          paidAt: order.payment.paidAt,
          failedAt: order.payment.failedAt,
          createdAt: order.payment.createdAt,
          updatedAt: order.payment.updatedAt,
        }
      : null,
    statusHistory: order.statusHistory.map((history) => ({
      status: history.status,
      note: history.note,
      createdAt: history.createdAt,
    })),
    totals: {
      subtotal: formatMoneyForDto(order.subtotal),
      deliveryFee: formatMoneyForDto(order.deliveryFee),
      discount: formatMoneyForDto(order.discount),
      total: formatMoneyForDto(order.total),
    },
    timestamps: {
      placedAt: order.placedAt,
      acceptedAt: order.acceptedAt,
      deliveredAt: order.deliveredAt,
      canceledAt: order.canceledAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    },
  };
}

type MerchantOrderTransitionDtoInput = {
  order: MerchantOrderTransitionRow;
  targetStatus: OrderStatusValue;
  note: string | null;
  timestampData: MerchantOrderTransitionTimestampData;
  changedAt: Date;
};

function toMerchantOrderTransitionDto({
  order,
  targetStatus,
  note,
  timestampData,
  changedAt,
}: MerchantOrderTransitionDtoInput): MerchantOrderTransitionDto {
  return {
    publicCode: order.publicCode,
    previousStatus: order.status,
    status: targetStatus,
    placedAt: order.placedAt,
    acceptedAt: timestampData.acceptedAt ?? order.acceptedAt,
    deliveredAt: timestampData.deliveredAt ?? order.deliveredAt,
    canceledAt: timestampData.canceledAt ?? order.canceledAt,
    updatedAt: changedAt,
    note,
    changedAt,
  };
}

function assertMerchantOrderTransitionRow(
  row: unknown,
): asserts row is MerchantOrderTransitionRow {
  if (
    !isRecord(row) ||
    typeof row.id !== "string" ||
    typeof row.publicCode !== "string" ||
    typeof row.status !== "string" ||
    !isOrderStatus(row.status) ||
    !isDateOrNull(row.placedAt) ||
    !isDateOrNull(row.acceptedAt) ||
    !isDateOrNull(row.deliveredAt) ||
    !isDateOrNull(row.canceledAt) ||
    !(row.updatedAt instanceof Date)
  ) {
    throw new Error("Invalid merchant order transition projection.");
  }
}

function isDateOrNull(value: unknown): value is Date | null {
  return value === null || value instanceof Date;
}

function normalizePublicCodeAttempts(input: number | undefined): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 1) {
    return DEFAULT_PUBLIC_CODE_ATTEMPTS;
  }

  return input;
}

function parseMerchantOwnerId(ownerIdInput: unknown): MerchantOrderListResult<string> {
  const parsed = merchantOrderOwnerInputSchema.safeParse({ ownerId: ownerIdInput });

  if (!parsed.success) {
    return merchantOrderListFailure("INVALID_OWNER");
  }

  return merchantOrderListSuccess(parsed.data.ownerId);
}

function parseMerchantOwnerIdForDetail(
  ownerIdInput: unknown,
): MerchantOrderDetailResult<string> {
  const parsed = merchantOrderOwnerInputSchema.safeParse({ ownerId: ownerIdInput });

  if (!parsed.success) {
    return merchantOrderDetailFailure("INVALID_OWNER");
  }

  return merchantOrderDetailSuccess(parsed.data.ownerId);
}

function parseMerchantOrderId(
  orderIdInput: unknown,
): MerchantOrderDetailResult<string> {
  const parsed = merchantOrderIdInputSchema.safeParse({ orderId: orderIdInput });

  if (!parsed.success) {
    return merchantOrderDetailFailure("INVALID_ORDER");
  }

  return merchantOrderDetailSuccess(parsed.data.orderId);
}

function parseMerchantOrderStatusInput(
  statusInput: unknown,
): MerchantOrderListResult<OrderStatusValue | null> {
  if (statusInput === undefined) {
    return merchantOrderListSuccess(null);
  }

  if (typeof statusInput !== "string") {
    return merchantOrderListFailure("INVALID_STATUS");
  }

  const status = statusInput.trim();

  if (!isOrderStatus(status)) {
    return merchantOrderListFailure("INVALID_STATUS");
  }

  return merchantOrderListSuccess(status);
}

function parseMerchantOrderListLimit(limitInput: unknown): number {
  if (limitInput === undefined || limitInput === null || limitInput === "") {
    return MERCHANT_ORDER_LIST_LIMIT;
  }

  const limit =
    typeof limitInput === "number"
      ? limitInput
      : typeof limitInput === "string" && /^\d+$/u.test(limitInput.trim())
        ? Number(limitInput.trim())
        : Number.NaN;

  if (!Number.isInteger(limit) || limit < 1) {
    return MERCHANT_ORDER_LIST_LIMIT;
  }

  return Math.min(limit, MERCHANT_ORDER_LIST_LIMIT);
}

function isOrderStatus(value: string): value is OrderStatusValue {
  return ORDER_STATUS_VALUES.some((status) => status === value);
}

function formatMoneyForDto(value: DecimalLike) {
  const cents = moneyToCents(value);

  if (cents === null) {
    throw new Error("Invalid money amount for public order projection.");
  }

  return formatCents(cents);
}

function parseAuthenticatedCustomerId(
  customerIdInput: unknown,
): CashOrderResult<string> {
  if (typeof customerIdInput !== "string") {
    return cashOrderFailure("UNAUTHENTICATED");
  }

  const customerId = customerIdInput.trim();

  if (customerId.length < 1) {
    return cashOrderFailure("UNAUTHENTICATED");
  }

  return cashOrderSuccess(customerId);
}

function validateParsedPayload(
  payload: CheckoutOrderPayload,
  enums: CashOrderServiceEnums,
): CashOrderResult<true> {
  if (payload.paymentMethod !== enums.paymentMethod.CASH) {
    return cashOrderFailure("UNSUPPORTED_PAYMENT_METHOD", {
      fieldErrors: { paymentMethod: [CASH_ORDER_ERROR_MESSAGES.UNSUPPORTED_PAYMENT_METHOD] },
    });
  }

  if (!Array.isArray(payload.items) || payload.items.length < 1) {
    return cashOrderFailure("VALIDATION_FAILED", {
      fieldErrors: { items: ["Adicione pelo menos um item ao pedido."] },
    });
  }

  if (typeof payload.establishmentId !== "string" || payload.establishmentId.length < 1) {
    return cashOrderFailure("VALIDATION_FAILED", {
      fieldErrors: { establishmentId: ["Informe o identificador da loja."] },
    });
  }

  const seenProductIds = new Map<string, number>();

  for (const [index, item] of payload.items.entries()) {
    if (typeof item.productId !== "string" || item.productId.length < 1) {
      return cashOrderFailure("VALIDATION_FAILED", {
        fieldErrors: {
          [`items.${index}.productId`]: ["Informe o identificador do produto."],
        },
      });
    }

    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      return cashOrderFailure("VALIDATION_FAILED", {
        fieldErrors: {
          [`items.${index}.quantity`]: ["Informe uma quantidade válida."],
        },
      });
    }

    const previousIndex = seenProductIds.get(item.productId);

    if (previousIndex !== undefined) {
      return cashOrderFailure("DUPLICATE_ITEM", {
        fieldErrors: {
          [`items.${index}.productId`]: [CASH_ORDER_ERROR_MESSAGES.DUPLICATE_ITEM],
          [`items.${previousIndex}.productId`]: [CASH_ORDER_ERROR_MESSAGES.DUPLICATE_ITEM],
        },
      });
    }

    seenProductIds.set(item.productId, index);
  }

  return cashOrderSuccess(true);
}

function validateProductLines(
  payload: CheckoutOrderPayload,
  establishmentId: string,
  productsById: Map<string, CashOrderDbProduct>,
  enums: CashOrderServiceEnums,
): CashOrderResult<ValidatedProductLine[]> {
  const lines: ValidatedProductLine[] = [];

  for (const [index, item] of payload.items.entries()) {
    const product = productsById.get(item.productId);

    if (!product || product.status !== enums.productStatus.ACTIVE) {
      return cashOrderFailure("PRODUCT_UNAVAILABLE", {
        fieldErrors: {
          [`items.${index}.productId`]: [
            CASH_ORDER_ERROR_MESSAGES.PRODUCT_UNAVAILABLE,
          ],
        },
      });
    }

    if (product.establishmentId !== establishmentId) {
      return cashOrderFailure("PRODUCT_FROM_DIFFERENT_STORE", {
        fieldErrors: {
          [`items.${index}.productId`]: [
            CASH_ORDER_ERROR_MESSAGES.PRODUCT_FROM_DIFFERENT_STORE,
          ],
        },
      });
    }

    const unitPriceCents = moneyToCents(product.price);

    if (unitPriceCents === null || unitPriceCents < 0) {
      return cashOrderFailure("PRODUCT_UNAVAILABLE", {
        fieldErrors: {
          [`items.${index}.productId`]: [
            CASH_ORDER_ERROR_MESSAGES.PRODUCT_UNAVAILABLE,
          ],
        },
      });
    }

    lines.push({
      product,
      quantity: item.quantity,
      lineTotalCents: unitPriceCents * item.quantity,
    });
  }

  return cashOrderSuccess(lines);
}

function toItemSnapshots(
  orderId: string,
  lines: ValidatedProductLine[],
): ItemSnapshot[] {
  return lines.map((line) => ({
    orderId,
    productId: line.product.id,
    productName: line.product.name,
    unitPrice: formatCents(line.lineTotalCents / line.quantity),
    quantity: line.quantity,
    total: formatCents(line.lineTotalCents),
    notes: null,
  }));
}

function formatDeliveryAddress(payload: CheckoutOrderPayload) {
  const complement = payload.deliveryComplement
    ? ` - ${payload.deliveryComplement}`
    : "";

  return `${payload.deliveryStreet}, ${payload.deliveryNumber}${complement} - ${payload.deliveryNeighborhood}, ${payload.deliveryCity} - ${payload.deliveryState}, ${payload.deliveryPostalCode}`;
}

function moneyToCents(value: DecimalLike): number | null {
  const rawValue = typeof value === "number" ? value.toFixed(2) : value.toString();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/u.exec(rawValue);

  if (!match) {
    return null;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const reais = Number(match[2]);
  const centavos = Number((match[3] ?? "0").padEnd(2, "0"));

  if (!Number.isSafeInteger(reais) || !Number.isSafeInteger(centavos)) {
    return null;
  }

  const cents = reais * 100 + centavos;

  return Number.isSafeInteger(cents) ? cents * sign : null;
}

function formatCents(cents: number) {
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Invalid money amount for order creation.");
  }

  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const reais = Math.floor(absolute / 100);
  const centavos = String(absolute % 100).padStart(2, "0");

  return `${sign}${reais}.${centavos}`;
}

function defaultGeneratePublicCode(now: Date) {
  const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}${String(now.getUTCDate()).padStart(2, "0")}`;
  const entropy = Math.random().toString(36).slice(2, 8).toUpperCase();

  return `PED-${date}-${entropy}`;
}

function cashOrderSuccess<TData>(data: TData): CashOrderResult<TData> {
  return { ok: true, data };
}

function merchantOrderListSuccess<TData>(
  data: TData,
): MerchantOrderListResult<TData> {
  return { ok: true, data };
}

function merchantOrderListFailure(
  code: MerchantOrderListFailureCode,
  options: { retryable?: boolean } = {},
): MerchantOrderListFailure {
  return {
    ok: false,
    code,
    message: MERCHANT_ORDER_LIST_ERROR_MESSAGES[code],
    retryable: options.retryable ?? false,
  };
}

function merchantOrderDetailSuccess<TData>(
  data: TData,
): MerchantOrderDetailResult<TData> {
  return { ok: true, data };
}

function merchantOrderDetailFailure(
  code: MerchantOrderDetailFailureCode,
  options: { retryable?: boolean } = {},
): MerchantOrderDetailFailure {
  return {
    ok: false,
    code,
    message: MERCHANT_ORDER_DETAIL_ERROR_MESSAGES[code],
    retryable: options.retryable ?? false,
  };
}

function cashOrderFailure(
  code: CashOrderFailureCode,
  options: {
    fieldErrors?: CheckoutFieldErrors;
    retryable?: boolean;
  } = {},
): CashOrderFailure {
  return {
    ok: false,
    code,
    message: CASH_ORDER_ERROR_MESSAGES[code],
    fieldErrors: options.fieldErrors ?? {},
    formErrors: [CASH_ORDER_ERROR_MESSAGES[code]],
    retryable: options.retryable ?? false,
  };
}

function cashOrderFailureFromTransaction(error: unknown): CashOrderFailure {
  if (
    isUniqueConstraintError(error) &&
    errorTargetsFields(error, ["publicCode", "public_code"])
  ) {
    return cashOrderFailure("PUBLIC_CODE_COLLISION", { retryable: true });
  }

  return cashOrderFailure("TRANSACTION_FAILED", { retryable: true });
}

function isUniqueConstraintError(error: unknown) {
  return isRecord(error) && error.code === "P2002";
}

function errorTargetsFields(error: unknown, fields: string[]) {
  if (!isRecord(error)) {
    return false;
  }

  const meta = error.meta;

  if (!isRecord(meta)) {
    return false;
  }

  const target = meta.target;

  if (Array.isArray(target)) {
    return fields.some((field) =>
      target.some((value) => String(value).includes(field)),
    );
  }

  if (typeof target === "string") {
    return fields.some((field) => target.includes(field));
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
