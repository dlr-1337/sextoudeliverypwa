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
  | "CANCELED";
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

export type CashOrderServiceClient = {
  $transaction<TResult>(
    callback: (tx: CashOrderTransactionClient) => Promise<TResult>,
  ): Promise<TResult>;
};

export type OrderServiceClient = CashOrderServiceClient & {
  order: {
    findUnique(args: PublicOrderFindUniqueArgs): Promise<PublicOrderReadRow | null>;
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

  return {
    createCashOrder,
    getPublicOrderByCode,
  };
}

export type OrderServiceCore = ReturnType<typeof createOrderServiceCore>;

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

function normalizePublicCodeAttempts(input: number | undefined): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 1) {
    return DEFAULT_PUBLIC_CODE_ATTEMPTS;
  }

  return input;
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
