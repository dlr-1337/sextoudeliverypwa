import "server-only";

import {
  CategoryType,
  EstablishmentStatus,
  ProductStatus,
  type PrismaClient,
} from "@/generated/prisma/client";
import { db } from "@/server/db";

import {
  createProductServiceCore,
  type ProductServiceClient,
} from "./service-core";

const productDb: PrismaClient = db;

export const productService = createProductServiceCore({
  db: productDb as unknown as ProductServiceClient,
  enums: {
    categoryType: CategoryType,
    establishmentStatus: EstablishmentStatus,
    productStatus: ProductStatus,
  },
});

export type ProductService = typeof productService;
