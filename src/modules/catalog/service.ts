import "server-only";

import {
  EstablishmentStatus,
  ProductStatus,
  type PrismaClient,
} from "@/generated/prisma/client";

import {
  CATALOG_ERROR_MESSAGES,
  createCatalogServiceCore,
  type CatalogGetActiveStoreCatalogInput,
  type CatalogResult,
  type CatalogServiceClient,
  type CatalogServiceCore,
} from "./service-core";

let catalogServiceCore: CatalogServiceCore | undefined;

async function getCatalogServiceCore() {
  if (catalogServiceCore) {
    return catalogServiceCore;
  }

  const { db } = await import("@/server/db");
  const catalogDb: PrismaClient = db;

  catalogServiceCore = createCatalogServiceCore({
    db: catalogDb as unknown as CatalogServiceClient,
    enums: {
      establishmentStatus: EstablishmentStatus,
      productStatus: ProductStatus,
    },
  });

  return catalogServiceCore;
}

function catalogDatabaseError<TData>(): CatalogResult<TData> {
  return {
    ok: false,
    code: "DATABASE_ERROR",
    message: CATALOG_ERROR_MESSAGES.DATABASE_ERROR,
  };
}

export const catalogService: CatalogServiceCore = {
  async listActiveStores(input: unknown = {}) {
    try {
      return await (await getCatalogServiceCore()).listActiveStores(input);
    } catch {
      return catalogDatabaseError();
    }
  },
  async getActiveStoreCatalog(input: CatalogGetActiveStoreCatalogInput) {
    try {
      return await (await getCatalogServiceCore()).getActiveStoreCatalog(input);
    } catch {
      return catalogDatabaseError();
    }
  },
};

export type CatalogService = typeof catalogService;
