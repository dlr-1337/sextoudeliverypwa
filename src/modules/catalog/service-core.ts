import { slugify as defaultSlugify } from "../../lib/slug";

export const CATALOG_DEFAULT_LIST_LIMIT = 50;
export const CATALOG_MAX_LIST_LIMIT = 100;
export const CATALOG_SLUG_MAX_LENGTH = 120;

export const CATALOG_CATEGORY_SELECT = {
  name: true,
  slug: true,
} as const;

export const CATALOG_STORE_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logoUrl: true,
  city: true,
  state: true,
  deliveryFee: true,
  minimumOrder: true,
  category: { select: CATALOG_CATEGORY_SELECT },
} as const;

export const CATALOG_PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  price: true,
  imageUrl: true,
  category: { select: CATALOG_CATEGORY_SELECT },
} as const;

function createCatalogStoreCatalogSelect(activeProductStatus: ProductStatusValue) {
  return {
    ...CATALOG_STORE_SELECT,
    products: {
      where: { status: activeProductStatus },
      orderBy: [{ isFeatured: "desc" }, { name: "asc" }, { id: "asc" }],
      select: CATALOG_PRODUCT_SELECT,
    },
  } as const;
}

const DEFAULT_CATALOG_ENUMS = {
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
} as const satisfies CatalogServiceEnums;

export const CATALOG_ERROR_MESSAGES = {
  VALIDATION_FAILED: "Não foi possível carregar o catálogo com estes filtros.",
  NOT_FOUND: "Loja não encontrada ou indisponível no momento.",
  DATABASE_ERROR: "Não foi possível carregar o catálogo agora. Tente novamente.",
} as const;

export type CatalogFailureCode = keyof typeof CATALOG_ERROR_MESSAGES;
export type EstablishmentStatusValue = "PENDING" | "ACTIVE" | "BLOCKED" | "INACTIVE";
export type ProductStatusValue = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
export type DecimalLike = { toString(): string } | number | string;

export type CatalogFailure = {
  ok: false;
  code: CatalogFailureCode;
  message: string;
};

export type CatalogSuccess<TData> = {
  ok: true;
  data: TData;
};

export type CatalogResult<TData> = CatalogFailure | CatalogSuccess<TData>;

export type CatalogServiceEnums = {
  establishmentStatus: Record<EstablishmentStatusValue, EstablishmentStatusValue>;
  productStatus: Record<ProductStatusValue, ProductStatusValue>;
};

export type CatalogDbCategoryRow = {
  name: string;
  slug: string;
};

export type CatalogDbStoreSummaryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  city: string | null;
  state: string | null;
  deliveryFee: DecimalLike;
  minimumOrder: DecimalLike;
  category: CatalogDbCategoryRow | null;
};

export type CatalogDbProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: DecimalLike;
  imageUrl: string | null;
  category: CatalogDbCategoryRow | null;
};

export type CatalogDbStoreCatalogRow = CatalogDbStoreSummaryRow & {
  products: CatalogDbProductRow[];
};

export type CatalogCategoryDto = CatalogDbCategoryRow;

export type CatalogStoreSummaryDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  city: string | null;
  state: string | null;
  deliveryFee: string;
  minimumOrder: string;
  category: CatalogCategoryDto | null;
};

export type CatalogProductDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  category: CatalogCategoryDto | null;
};

export type CatalogStoreCatalogDto = CatalogStoreSummaryDto & {
  products: CatalogProductDto[];
};

export type CatalogListActiveStoresInput = {
  limit?: number;
};

export type CatalogGetActiveStoreCatalogInput = {
  slug?: unknown;
};

export type CatalogEstablishmentFindManyArgs = {
  where?: {
    status?: EstablishmentStatusValue;
  };
  orderBy?: Array<
    | { name: "asc" | "desc" }
    | { slug: "asc" | "desc" }
    | { id: "asc" | "desc" }
  >;
  take?: number;
  select?: unknown;
};

export type CatalogEstablishmentFindFirstArgs = {
  where?: {
    slug?: string;
    status?: EstablishmentStatusValue;
  };
  select?: unknown;
};

export type CatalogServiceClient = {
  establishment: {
    findMany(
      args: CatalogEstablishmentFindManyArgs,
    ): Promise<CatalogDbStoreSummaryRow[]>;
    findFirst(
      args: CatalogEstablishmentFindFirstArgs,
    ): Promise<CatalogDbStoreCatalogRow | null>;
  };
};

export type CatalogServiceCoreDependencies = {
  db: CatalogServiceClient;
  enums?: CatalogServiceEnums;
  slugifyFn?: typeof defaultSlugify;
};

export function createCatalogServiceCore(
  dependencies: CatalogServiceCoreDependencies,
) {
  const db = dependencies.db;
  const enums = dependencies.enums ?? DEFAULT_CATALOG_ENUMS;
  const slugifyFn = dependencies.slugifyFn ?? defaultSlugify;

  async function listActiveStores(
    input: unknown = {},
  ): Promise<CatalogResult<CatalogStoreSummaryDto[]>> {
    const parsed = parseListActiveStoresInput(input);

    if (!parsed.ok) {
      return parsed;
    }

    try {
      const stores = await db.establishment.findMany({
        where: { status: enums.establishmentStatus.ACTIVE },
        orderBy: [{ name: "asc" }, { slug: "asc" }, { id: "asc" }],
        take: parsed.data.limit,
        select: CATALOG_STORE_SELECT,
      });

      return catalogSuccess(stores.map(toStoreSummaryDto));
    } catch {
      return catalogFailure("DATABASE_ERROR");
    }
  }

  async function getActiveStoreCatalog(
    input: CatalogGetActiveStoreCatalogInput,
  ): Promise<CatalogResult<CatalogStoreCatalogDto>> {
    const slug = parseCatalogSlug(input, slugifyFn);

    if (!slug.ok) {
      return slug;
    }

    try {
      const store = await db.establishment.findFirst({
        where: {
          slug: slug.data,
          status: enums.establishmentStatus.ACTIVE,
        },
        select: createCatalogStoreCatalogSelect(enums.productStatus.ACTIVE),
      });

      if (!store) {
        return catalogFailure("NOT_FOUND");
      }

      return catalogSuccess(toStoreCatalogDto(store));
    } catch {
      return catalogFailure("DATABASE_ERROR");
    }
  }

  return {
    getActiveStoreCatalog,
    listActiveStores,
  };
}

export type CatalogServiceCore = ReturnType<typeof createCatalogServiceCore>;

function parseListActiveStoresInput(
  input: unknown,
): CatalogResult<{ limit: number }> {
  if (!isRecord(input)) {
    return catalogFailure("VALIDATION_FAILED");
  }

  const rawLimit = input.limit;

  if (rawLimit === undefined) {
    return catalogSuccess({ limit: CATALOG_DEFAULT_LIST_LIMIT });
  }

  if (typeof rawLimit !== "number" || !Number.isInteger(rawLimit) || rawLimit < 1) {
    return catalogFailure("VALIDATION_FAILED");
  }

  return catalogSuccess({
    limit: Math.min(rawLimit, CATALOG_MAX_LIST_LIMIT),
  });
}

function toStoreSummaryDto(
  store: CatalogDbStoreSummaryRow,
): CatalogStoreSummaryDto {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: store.description ?? null,
    logoUrl: store.logoUrl ?? null,
    city: store.city ?? null,
    state: store.state ?? null,
    deliveryFee: moneyToString(store.deliveryFee),
    minimumOrder: moneyToString(store.minimumOrder),
    category: store.category ? toCategoryDto(store.category) : null,
  };
}

function toStoreCatalogDto(store: CatalogDbStoreCatalogRow): CatalogStoreCatalogDto {
  return {
    ...toStoreSummaryDto(store),
    products: store.products.map(toProductDto),
  };
}

function toProductDto(product: CatalogDbProductRow): CatalogProductDto {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description ?? null,
    price: moneyToString(product.price),
    imageUrl: product.imageUrl ?? null,
    category: product.category ? toCategoryDto(product.category) : null,
  };
}

function parseCatalogSlug(
  input: unknown,
  slugifyFn: typeof defaultSlugify,
): CatalogResult<string> {
  if (!isRecord(input) || typeof input.slug !== "string") {
    return catalogFailure("NOT_FOUND");
  }

  const rawSlug = input.slug.trim();

  if (
    rawSlug.length < 1 ||
    rawSlug.length > CATALOG_SLUG_MAX_LENGTH ||
    rawSlug.includes("..") ||
    /[/\\?#]/.test(rawSlug)
  ) {
    return catalogFailure("NOT_FOUND");
  }

  const slug = slugifyFn(rawSlug, "");

  if (
    slug.length < 1 ||
    slug.length > CATALOG_SLUG_MAX_LENGTH ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  ) {
    return catalogFailure("NOT_FOUND");
  }

  return catalogSuccess(slug);
}

function toCategoryDto(category: CatalogDbCategoryRow): CatalogCategoryDto {
  return {
    name: category.name,
    slug: category.slug,
  };
}

function moneyToString(value: DecimalLike) {
  if (typeof value === "number") {
    return value.toFixed(2);
  }

  return value.toString();
}

function catalogSuccess<TData>(data: TData): CatalogResult<TData> {
  return { ok: true, data };
}

function catalogFailure(code: CatalogFailureCode): CatalogFailure {
  return {
    ok: false,
    code,
    message: CATALOG_ERROR_MESSAGES[code],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
