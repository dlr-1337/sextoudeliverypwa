import "server-only";

import {
  EstablishmentStatus,
  ProductStatus,
  type PrismaClient,
} from "@/generated/prisma/client";
import { db } from "@/server/db";

import {
  createCatalogServiceCore,
  type CatalogServiceClient,
} from "./service-core";

const catalogDb: PrismaClient = db;

export const catalogService = createCatalogServiceCore({
  db: catalogDb as unknown as CatalogServiceClient,
  enums: {
    establishmentStatus: EstablishmentStatus,
    productStatus: ProductStatus,
  },
});

export type CatalogService = typeof catalogService;
