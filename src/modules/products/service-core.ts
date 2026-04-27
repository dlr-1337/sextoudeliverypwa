import { slugify as defaultSlugify } from "../../lib/slug";

import {
  createProductSchema,
  formatProductValidationErrors,
  productIdInputSchema,
  productImageUrlInputSchema,
  productOwnerInputSchema,
  updateProductSchema,
  type CreateProductInput,
  type ProductValidationErrors,
  type UpdateProductInput,
} from "./schemas";

export const PRODUCT_LIST_LIMIT = 100;
export const PRODUCT_SLUG_ATTEMPT_LIMIT = 20;

export const PRODUCT_ESTABLISHMENT_SELECT = {
  id: true,
  ownerId: true,
  slug: true,
  status: true,
  createdAt: true,
} as const;

export const PRODUCT_CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  type: true,
  isActive: true,
} as const;

export const PRODUCT_SELECT = {
  id: true,
  establishmentId: true,
  categoryId: true,
  name: true,
  slug: true,
  description: true,
  price: true,
  status: true,
  imageUrl: true,
  isFeatured: true,
  createdAt: true,
  updatedAt: true,
  category: { select: PRODUCT_CATEGORY_SELECT },
  establishment: {
    select: {
      id: true,
      slug: true,
    },
  },
} as const;

const DEFAULT_PRODUCT_ENUMS = {
  categoryType: {
    ESTABLISHMENT: "ESTABLISHMENT",
    PRODUCT: "PRODUCT",
  },
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
} as const satisfies ProductServiceEnums;

export const PRODUCT_ERROR_MESSAGES = {
  VALIDATION_FAILED: "Revise os campos destacados.",
  NOT_FOUND: "Produto ou estabelecimento não encontrado para este comerciante.",
  OPERATION_NOT_ALLOWED:
    "Este estabelecimento precisa estar ativo para gerenciar produtos.",
  INVALID_CATEGORY: "Selecione uma categoria ativa de produto.",
  DUPLICATE_SLUG: "Já existe um produto com este nome neste estabelecimento.",
  DATABASE_ERROR: "Não foi possível concluir a operação de produto. Tente novamente.",
} as const;

export type ProductFailureCode = keyof typeof PRODUCT_ERROR_MESSAGES;
export type ProductStatusValue = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
export type EstablishmentStatusValue = "PENDING" | "ACTIVE" | "BLOCKED" | "INACTIVE";
export type CategoryTypeValue = "ESTABLISHMENT" | "PRODUCT";
export type DecimalLike = { toString(): string } | number | string;

export type ProductFailure = {
  ok: false;
  code: ProductFailureCode;
  message: string;
  validationErrors?: ProductValidationErrors;
};

export type ProductSuccess<TData> = {
  ok: true;
  data: TData;
};

export type ProductResult<TData> = ProductFailure | ProductSuccess<TData>;

export type ProductDbEstablishment = {
  id: string;
  ownerId: string;
  slug: string;
  status: EstablishmentStatusValue;
  createdAt: Date;
};

export type ProductCategoryDbRow = {
  id: string;
  name: string;
  slug: string;
  type: CategoryTypeValue;
  isActive: boolean;
};

export type ProductDbRow = {
  id: string;
  establishmentId: string;
  categoryId: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: DecimalLike;
  status: ProductStatusValue;
  imageUrl: string | null;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
  category: ProductCategoryDbRow | null;
  establishment: {
    id: string;
    slug: string;
  };
};

export type ProductCategoryDto = ProductCategoryDbRow;

export type ProductDto = {
  id: string;
  establishmentId: string;
  establishmentSlug: string;
  categoryId: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  status: ProductStatusValue;
  imageUrl: string | null;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
  category: ProductCategoryDto | null;
};

export type ProductCreateData = {
  establishmentId: string;
  categoryId: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  status: ProductStatusValue;
};

export type ProductUpdateData = Partial<{
  categoryId: string | null;
  name: string;
  description: string | null;
  price: string;
  status: ProductStatusValue;
  imageUrl: string | null;
}>;

export type ProductFindManyArgs = {
  where?: ProductWhereInput;
  orderBy?: Array<
    | { isFeatured: "asc" | "desc" }
    | { name: "asc" | "desc" }
    | { id: "asc" | "desc" }
  >;
  take?: number;
  select?: unknown;
};

export type ProductFindFirstArgs = {
  where?: ProductWhereInput;
  select?: unknown;
};

export type ProductWhereInput = {
  id?: string;
  establishmentId?: string;
  slug?: string;
  status?: ProductStatusValue | { not?: ProductStatusValue };
};

export type ProductCategoryFindFirstArgs = {
  where: {
    id?: string;
    type?: CategoryTypeValue;
    isActive?: boolean;
  };
  select?: unknown;
};

export type ProductEstablishmentFindFirstArgs = {
  where: { ownerId: string };
  orderBy?: Array<{ createdAt: "asc" | "desc" } | { id: "asc" | "desc" }>;
  select?: unknown;
};

export type ProductServiceClient = {
  category: {
    findFirst(args: ProductCategoryFindFirstArgs): Promise<ProductCategoryDbRow | null>;
  };
  establishment: {
    findFirst(
      args: ProductEstablishmentFindFirstArgs,
    ): Promise<ProductDbEstablishment | null>;
  };
  product: {
    create(args: { data: ProductCreateData; select?: unknown }): Promise<ProductDbRow>;
    findFirst(args: ProductFindFirstArgs): Promise<ProductDbRow | null>;
    findMany(args: ProductFindManyArgs): Promise<ProductDbRow[]>;
    update(args: {
      where: { id: string };
      data: ProductUpdateData;
      select?: unknown;
    }): Promise<ProductDbRow>;
  };
};

export type ProductServiceEnums = {
  categoryType: Record<CategoryTypeValue, CategoryTypeValue>;
  establishmentStatus: Record<EstablishmentStatusValue, EstablishmentStatusValue>;
  productStatus: Record<ProductStatusValue, ProductStatusValue>;
};

export type ProductServiceCoreDependencies = {
  db: ProductServiceClient;
  enums?: ProductServiceEnums;
  slugifyFn?: typeof defaultSlugify;
};

type CategoryResolution =
  | { shouldSetCategory: false; categoryId?: never }
  | { shouldSetCategory: true; categoryId: string | null };

export function createProductServiceCore(
  dependencies: ProductServiceCoreDependencies,
) {
  const db = dependencies.db;
  const enums = dependencies.enums ?? DEFAULT_PRODUCT_ENUMS;
  const slugifyFn = dependencies.slugifyFn ?? defaultSlugify;

  async function listForOwner(ownerIdInput: unknown): Promise<ProductResult<ProductDto[]>> {
    const ownerId = parseOwnerId(ownerIdInput);

    if (!ownerId.ok) {
      return ownerId;
    }

    const establishment = await readEstablishmentForOwner(ownerId.data);

    if (!establishment.ok) {
      return establishment;
    }

    try {
      const products = await db.product.findMany({
        where: {
          establishmentId: establishment.data.id,
          status: { not: enums.productStatus.ARCHIVED },
        },
        orderBy: [{ isFeatured: "desc" }, { name: "asc" }, { id: "asc" }],
        take: PRODUCT_LIST_LIMIT,
        select: PRODUCT_SELECT,
      });

      return productSuccess(products.map(toProductDto));
    } catch {
      return productFailure("DATABASE_ERROR");
    }
  }

  async function getOwnedProductForOwner(
    ownerIdInput: unknown,
    productIdInput: unknown,
  ): Promise<ProductResult<ProductDto>> {
    const ownerId = parseOwnerId(ownerIdInput);

    if (!ownerId.ok) {
      return ownerId;
    }

    const productId = parseProductId(productIdInput);

    if (!productId.ok) {
      return productId;
    }

    const establishment = await readEstablishmentForOwner(ownerId.data);

    if (!establishment.ok) {
      return establishment;
    }

    const product = await readOwnedProduct(establishment.data.id, productId.data);

    if (!product.ok) {
      return product;
    }

    return productSuccess(toProductDto(product.data));
  }

  async function getImageUploadAuthorityForOwner(
    ownerIdInput: unknown,
    productIdInput: unknown,
  ): Promise<ProductResult<ProductDto>> {
    const ownerId = parseOwnerId(ownerIdInput);

    if (!ownerId.ok) {
      return ownerId;
    }

    const productId = parseProductId(productIdInput);

    if (!productId.ok) {
      return productId;
    }

    const establishment = await readActiveEstablishmentForOwner(ownerId.data);

    if (!establishment.ok) {
      return establishment;
    }

    const product = await readOwnedProduct(establishment.data.id, productId.data);

    if (!product.ok) {
      return product;
    }

    return productSuccess(toProductDto(product.data));
  }

  async function createForOwner(
    ownerIdInput: unknown,
    input: unknown,
  ): Promise<ProductResult<ProductDto>> {
    const ownerId = parseOwnerId(ownerIdInput);

    if (!ownerId.ok) {
      return ownerId;
    }

    const parsed = createProductSchema.safeParse(input);

    if (!parsed.success) {
      return productFailure("VALIDATION_FAILED", {
        validationErrors: formatProductValidationErrors(parsed.error),
      });
    }

    const establishment = await readActiveEstablishmentForOwner(ownerId.data);

    if (!establishment.ok) {
      return establishment;
    }

    const category = await resolveCategory(parsed.data.categoryId);

    if (!category.ok) {
      return category;
    }

    const slug = await createUniqueSlug(establishment.data.id, parsed.data.name);

    if (!slug.ok) {
      return slug;
    }

    try {
      const product = await db.product.create({
        data: {
          establishmentId: establishment.data.id,
          categoryId: category.data.shouldSetCategory
            ? category.data.categoryId
            : null,
          name: parsed.data.name,
          slug: slug.data,
          description: parsed.data.description,
          price: parsed.data.price,
          status: enums.productStatus.ACTIVE,
        },
        select: PRODUCT_SELECT,
      });

      return productSuccess(toProductDto(product));
    } catch (error) {
      return productFailureFromError(error);
    }
  }

  async function updateForOwner(
    ownerIdInput: unknown,
    productIdInput: unknown,
    input: unknown,
  ): Promise<ProductResult<ProductDto>> {
    const ownerId = parseOwnerId(ownerIdInput);

    if (!ownerId.ok) {
      return ownerId;
    }

    const productId = parseProductId(productIdInput);

    if (!productId.ok) {
      return productId;
    }

    const parsed = updateProductSchema.safeParse(input);

    if (!parsed.success) {
      return productFailure("VALIDATION_FAILED", {
        validationErrors: formatProductValidationErrors(parsed.error),
      });
    }

    const establishment = await readActiveEstablishmentForOwner(ownerId.data);

    if (!establishment.ok) {
      return establishment;
    }

    const current = await readOwnedProduct(establishment.data.id, productId.data);

    if (!current.ok) {
      return current;
    }

    const category = await resolveCategory(parsed.data.categoryId);

    if (!category.ok) {
      return category;
    }

    const data = toProductUpdateData(parsed.data);

    if (category.data.shouldSetCategory) {
      data.categoryId = category.data.categoryId;
    }

    if (Object.keys(data).length === 0) {
      return productSuccess(toProductDto(current.data));
    }

    return updateOwnedProduct(current.data.id, data);
  }

  async function activateForOwner(
    ownerIdInput: unknown,
    productIdInput: unknown,
  ): Promise<ProductResult<ProductDto>> {
    return transitionProductForOwner(
      ownerIdInput,
      productIdInput,
      enums.productStatus.ACTIVE,
    );
  }

  async function pauseForOwner(
    ownerIdInput: unknown,
    productIdInput: unknown,
  ): Promise<ProductResult<ProductDto>> {
    return transitionProductForOwner(
      ownerIdInput,
      productIdInput,
      enums.productStatus.PAUSED,
    );
  }

  async function archiveForOwner(
    ownerIdInput: unknown,
    productIdInput: unknown,
  ): Promise<ProductResult<ProductDto>> {
    return transitionProductForOwner(
      ownerIdInput,
      productIdInput,
      enums.productStatus.ARCHIVED,
    );
  }

  async function updateImageForOwner(
    ownerIdInput: unknown,
    productIdInput: unknown,
    imageInput: unknown,
  ): Promise<ProductResult<ProductDto>> {
    const ownerId = parseOwnerId(ownerIdInput);

    if (!ownerId.ok) {
      return ownerId;
    }

    const productId = parseProductId(productIdInput);

    if (!productId.ok) {
      return productId;
    }

    const parsed = productImageUrlInputSchema.safeParse(imageInput);

    if (!parsed.success) {
      return productFailure("VALIDATION_FAILED", {
        validationErrors: formatProductValidationErrors(parsed.error),
      });
    }

    const establishment = await readActiveEstablishmentForOwner(ownerId.data);

    if (!establishment.ok) {
      return establishment;
    }

    const current = await readOwnedProduct(establishment.data.id, productId.data);

    if (!current.ok) {
      return current;
    }

    return updateOwnedProduct(current.data.id, { imageUrl: parsed.data.imageUrl });
  }

  async function transitionProductForOwner(
    ownerIdInput: unknown,
    productIdInput: unknown,
    status: ProductStatusValue,
  ): Promise<ProductResult<ProductDto>> {
    const ownerId = parseOwnerId(ownerIdInput);

    if (!ownerId.ok) {
      return ownerId;
    }

    const productId = parseProductId(productIdInput);

    if (!productId.ok) {
      return productId;
    }

    const establishment = await readActiveEstablishmentForOwner(ownerId.data);

    if (!establishment.ok) {
      return establishment;
    }

    const current = await readOwnedProduct(establishment.data.id, productId.data);

    if (!current.ok) {
      return current;
    }

    if (current.data.status === status) {
      return productSuccess(toProductDto(current.data));
    }

    return updateOwnedProduct(current.data.id, { status });
  }

  async function readActiveEstablishmentForOwner(
    ownerId: string,
  ): Promise<ProductResult<ProductDbEstablishment>> {
    const establishment = await readEstablishmentForOwner(ownerId);

    if (!establishment.ok) {
      return establishment;
    }

    const activeCheck = requireActiveStatus(establishment.data);

    if (!activeCheck.ok) {
      return activeCheck;
    }

    return establishment;
  }

  async function readEstablishmentForOwner(
    ownerId: string,
  ): Promise<ProductResult<ProductDbEstablishment>> {
    try {
      const establishment = await db.establishment.findFirst({
        where: { ownerId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: PRODUCT_ESTABLISHMENT_SELECT,
      });

      if (!establishment) {
        return productFailure("NOT_FOUND");
      }

      return productSuccess(establishment);
    } catch {
      return productFailure("DATABASE_ERROR");
    }
  }

  function requireActiveStatus(
    establishment: ProductDbEstablishment,
  ): ProductResult<true> {
    if (establishment.status !== enums.establishmentStatus.ACTIVE) {
      return productFailure("OPERATION_NOT_ALLOWED");
    }

    return productSuccess(true);
  }

  async function readOwnedProduct(
    establishmentId: string,
    productId: string,
  ): Promise<ProductResult<ProductDbRow>> {
    try {
      const product = await db.product.findFirst({
        where: { id: productId, establishmentId },
        select: PRODUCT_SELECT,
      });

      if (!product) {
        return productFailure("NOT_FOUND");
      }

      return productSuccess(product);
    } catch {
      return productFailure("DATABASE_ERROR");
    }
  }

  async function resolveCategory(
    categoryId: CreateProductInput["categoryId"] | UpdateProductInput["categoryId"],
  ): Promise<ProductResult<CategoryResolution>> {
    if (categoryId === undefined) {
      return productSuccess({ shouldSetCategory: false });
    }

    if (categoryId === null) {
      return productSuccess({ shouldSetCategory: true, categoryId: null });
    }

    try {
      const category = await db.category.findFirst({
        where: {
          id: categoryId,
          type: enums.categoryType.PRODUCT,
          isActive: true,
        },
        select: PRODUCT_CATEGORY_SELECT,
      });

      if (!category) {
        return invalidCategoryFailure();
      }

      return productSuccess({ shouldSetCategory: true, categoryId: category.id });
    } catch {
      return productFailure("DATABASE_ERROR");
    }
  }

  async function createUniqueSlug(
    establishmentId: string,
    name: string,
  ): Promise<ProductResult<string>> {
    const baseSlug = slugifyFn(name, "produto");

    try {
      for (let attempt = 1; attempt <= PRODUCT_SLUG_ATTEMPT_LIMIT; attempt += 1) {
        const slug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
        const existing = await db.product.findFirst({
          where: { establishmentId, slug },
          select: { id: true },
        });

        if (!existing) {
          return productSuccess(slug);
        }
      }

      return productFailure("DUPLICATE_SLUG");
    } catch {
      return productFailure("DATABASE_ERROR");
    }
  }

  async function updateOwnedProduct(
    id: string,
    data: ProductUpdateData,
  ): Promise<ProductResult<ProductDto>> {
    try {
      const product = await db.product.update({
        where: { id },
        data,
        select: PRODUCT_SELECT,
      });

      return productSuccess(toProductDto(product));
    } catch (error) {
      return productFailureFromError(error);
    }
  }

  return {
    activateForOwner,
    archiveForOwner,
    createForOwner,
    getImageUploadAuthorityForOwner,
    getOwnedProductForOwner,
    listForOwner,
    pauseForOwner,
    updateForOwner,
    updateImageForOwner,
  };
}

export type ProductServiceCore = ReturnType<typeof createProductServiceCore>;

function parseOwnerId(ownerIdInput: unknown): ProductResult<string> {
  const parsed = productOwnerInputSchema.safeParse({ ownerId: ownerIdInput });

  if (!parsed.success) {
    return productFailure("VALIDATION_FAILED", {
      validationErrors: formatProductValidationErrors(parsed.error),
    });
  }

  return productSuccess(parsed.data.ownerId);
}

function parseProductId(productIdInput: unknown): ProductResult<string> {
  const parsed = productIdInputSchema.safeParse(productIdInput);

  if (!parsed.success) {
    return productFailure("VALIDATION_FAILED", {
      validationErrors: formatProductValidationErrors(parsed.error),
    });
  }

  return productSuccess(parsed.data.productId);
}

function toProductUpdateData(input: UpdateProductInput): ProductUpdateData {
  const data: ProductUpdateData = {};

  setIfDefined(data, "name", input.name);
  setIfDefined(data, "description", input.description);
  setIfDefined(data, "price", input.price);

  return data;
}

function setIfDefined<TKey extends keyof ProductUpdateData>(
  data: ProductUpdateData,
  key: TKey,
  value: ProductUpdateData[TKey] | undefined,
) {
  if (value !== undefined) {
    data[key] = value;
  }
}

function toProductDto(product: ProductDbRow): ProductDto {
  return {
    id: product.id,
    establishmentId: product.establishmentId,
    establishmentSlug: product.establishment.slug,
    categoryId: product.categoryId ?? null,
    name: product.name,
    slug: product.slug,
    description: product.description ?? null,
    price: moneyToString(product.price),
    status: product.status,
    imageUrl: product.imageUrl ?? null,
    isFeatured: product.isFeatured,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    category: product.category ? toCategoryDto(product.category) : null,
  };
}

function toCategoryDto(category: ProductCategoryDbRow): ProductCategoryDto {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    type: category.type,
    isActive: category.isActive,
  };
}

function moneyToString(value: DecimalLike) {
  if (typeof value === "number") {
    return value.toFixed(2);
  }

  return value.toString();
}

function productSuccess<TData>(data: TData): ProductResult<TData> {
  return { ok: true, data };
}

function productFailure(
  code: ProductFailureCode,
  options: Pick<ProductFailure, "validationErrors"> = {},
): ProductFailure {
  return {
    ok: false,
    code,
    message: PRODUCT_ERROR_MESSAGES[code],
    ...options,
  };
}

function invalidCategoryFailure(): ProductFailure {
  return productFailure("INVALID_CATEGORY", {
    validationErrors: {
      fieldErrors: {
        categoryId: [PRODUCT_ERROR_MESSAGES.INVALID_CATEGORY],
      },
      formErrors: [],
    },
  });
}

function productFailureFromError(error: unknown): ProductFailure {
  if (isNotFoundError(error)) {
    return productFailure("NOT_FOUND");
  }

  if (
    isUniqueConstraintError(error) &&
    errorTargetsFields(error, ["establishmentId", "slug"])
  ) {
    return productFailure("DUPLICATE_SLUG");
  }

  return productFailure("DATABASE_ERROR");
}

function isUniqueConstraintError(error: unknown) {
  return isRecord(error) && error.code === "P2002";
}

function isNotFoundError(error: unknown) {
  return isRecord(error) && error.code === "P2025";
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
    return fields.every((field) =>
      target.some((value) => String(value).includes(field)),
    );
  }

  if (typeof target === "string") {
    return fields.every((field) => target.includes(field));
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
