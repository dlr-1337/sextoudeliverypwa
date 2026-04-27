import "server-only";

import {
  CategoryType,
  EstablishmentStatus,
  type PrismaClient,
} from "@/generated/prisma/client";
import { db } from "@/server/db";

import {
  createMerchantServiceCore,
  type MerchantServiceClient,
} from "./service-core";

const merchantDb: PrismaClient = db;

export const merchantService = createMerchantServiceCore({
  db: merchantDb as unknown as MerchantServiceClient,
  enums: {
    categoryType: CategoryType,
    establishmentStatus: EstablishmentStatus,
  },
});

export type MerchantService = typeof merchantService;
