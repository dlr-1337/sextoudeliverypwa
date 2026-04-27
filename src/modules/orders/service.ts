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
  createOrderServiceCore,
  type CashOrderPublicCodeGenerator,
  type OrderServiceClient,
  type OrderServiceCore,
} from "./service-core";

const PUBLIC_CODE_ENTROPY_LENGTH = 10;

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
  });

  return orderServiceCore;
}

export const orderService: OrderServiceCore = {
  async createCashOrder(customerIdInput, payload) {
    return (await getOrderServiceCore()).createCashOrder(customerIdInput, payload);
  },
  async getPublicOrderByCode(publicCodeInput) {
    return (await getOrderServiceCore()).getPublicOrderByCode(publicCodeInput);
  },
};

export type OrderService = typeof orderService;
