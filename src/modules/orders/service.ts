import { randomUUID } from "node:crypto";

import {
  EstablishmentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  type PrismaClient,
} from "@/generated/prisma/client";

import {
  getPaymentGatewayProvider as getConfiguredPaymentGatewayProvider,
} from "../payments/service";
import {
  createOrderServiceCore,
  type CashOrderPublicCodeGenerator,
  type OrderServiceClient,
  type OrderServiceCore,
} from "./service-core";

const PUBLIC_CODE_ENTROPY_LENGTH = 10;
const LOCAL_CHECKOUT_APP_BASE_URL = "http://localhost:3000";

let orderServiceCore: OrderServiceCore | undefined;

export const generatePublicOrderCode: CashOrderPublicCodeGenerator = (now) => {
  const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}${String(now.getUTCDate()).padStart(2, "0")}`;
  const entropy = randomUUID()
    .replace(/-/g, "")
    .slice(0, PUBLIC_CODE_ENTROPY_LENGTH)
    .toUpperCase();

  return `PED-${date}-${entropy}`;
};

export function generateInternalOrderId() {
  return randomUUID();
}

export function getCheckoutAppBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const rawAppUrl = env.NEXT_PUBLIC_APP_URL?.trim();

  if (!rawAppUrl) {
    return LOCAL_CHECKOUT_APP_BASE_URL;
  }

  try {
    const appBaseUrl = new URL(rawAppUrl);

    if (!["http:", "https:"].includes(appBaseUrl.protocol)) {
      return LOCAL_CHECKOUT_APP_BASE_URL;
    }

    if (appBaseUrl.username || appBaseUrl.password) {
      return LOCAL_CHECKOUT_APP_BASE_URL;
    }

    return appBaseUrl.origin;
  } catch {
    return LOCAL_CHECKOUT_APP_BASE_URL;
  }
}

async function getOrderServiceCore() {
  if (orderServiceCore) {
    return orderServiceCore;
  }

  const { db } = await import("@/server/db");
  const orderDb: PrismaClient = db;

  orderServiceCore = createOrderServiceCore({
    db: orderDb as unknown as OrderServiceClient,
    enums: {
      establishmentStatus: EstablishmentStatus,
      productStatus: ProductStatus,
      orderStatus: OrderStatus,
      paymentMethod: PaymentMethod,
      paymentStatus: PaymentStatus,
    },
    generatePublicCode: generatePublicOrderCode,
    generateInternalOrderId,
    getPaymentGatewayProvider: () => getConfiguredPaymentGatewayProvider(),
    getAppBaseUrl: getCheckoutAppBaseUrl,
  });

  return orderServiceCore;
}

export const orderService: OrderServiceCore = {
  async createCheckoutOrder(customerIdInput, payload) {
    return (await getOrderServiceCore()).createCheckoutOrder(
      customerIdInput,
      payload,
    );
  },
  async createCashOrder(customerIdInput, payload) {
    return (await getOrderServiceCore()).createCashOrder(customerIdInput, payload);
  },
  async getPublicOrderByCode(publicCodeInput) {
    return (await getOrderServiceCore()).getPublicOrderByCode(publicCodeInput);
  },
  async listMerchantOrdersForOwner(ownerIdInput, input) {
    return (await getOrderServiceCore()).listMerchantOrdersForOwner(
      ownerIdInput,
      input,
    );
  },
  async getMerchantOrderDetailForOwner(ownerIdInput, orderIdInput) {
    return (await getOrderServiceCore()).getMerchantOrderDetailForOwner(
      ownerIdInput,
      orderIdInput,
    );
  },
  async transitionMerchantOrderStatusForOwner(ownerIdInput, input) {
    return (await getOrderServiceCore()).transitionMerchantOrderStatusForOwner(
      ownerIdInput,
      input,
    );
  },
};

export type OrderService = typeof orderService;
