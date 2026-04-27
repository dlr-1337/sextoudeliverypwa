import { slugify as defaultSlugify } from "../../lib/slug";

import {
  activateCategorySchema,
  categoryListByTypeSchema,
  createCategorySchema,
  formatCategoryValidationErrors,
  inactivateCategorySchema,
  type CategoryTypeValue,
  type CategoryValidationErrors,
  updateCategorySchema,
} from "./schemas";

const CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  type: true,
  description: true,
  displayOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const DEFAULT_CATEGORY_ENUMS = {
  categoryType: {
    ESTABLISHMENT: "ESTABLISHMENT",
    PRODUCT: "PRODUCT",
  },
} as const satisfies CategoryServiceEnums;

export const CATEGORY_ERROR_MESSAGES = {
  VALIDATION_FAILED: "Revise os campos destacados.",
  DUPLICATE_CATEGORY:
    "Já existe uma categoria com este nome para o tipo selecionado.",
  NOT_FOUND: "Categoria não encontrada.",
  DATABASE_ERROR:
    "Não foi possível concluir a operação de categoria. Tente novamente.",
} as const;

export type CategoryFailureCode = keyof typeof CATEGORY_ERROR_MESSAGES;

export type CategoryFailure = {
  ok: false;
  code: CategoryFailureCode;
  message: string;
  validationErrors?: CategoryValidationErrors;
};

export type CategorySuccess<TData> = {
  ok: true;
  data: TData;
};

export type CategoryResult<TData> = CategoryFailure | CategorySuccess<TData>;

export type CategoryServiceEnums = {
  categoryType: Record<"ESTABLISHMENT" | "PRODUCT", CategoryTypeValue>;
};

export type CategoryDto = {
  id: string;
  name: string;
  slug: string;
  type: CategoryTypeValue;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CategoryDbCategory = CategoryDto;

export type CategoryCreateData = {
  name: string;
  slug: string;
  type: CategoryTypeValue;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
};

export type CategoryUpdateData = Partial<{
  name: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
}>;

export type CategoryFindManyArgs = {
  where?: {
    type?: CategoryTypeValue;
    isActive?: boolean;
  };
  orderBy?: Array<
    | { displayOrder: "asc" | "desc" }
    | { name: "asc" | "desc" }
    | { id: "asc" | "desc" }
  >;
  take?: number;
  select?: unknown;
};

export type CategoryServiceClient = {
  category: {
    findMany(args: CategoryFindManyArgs): Promise<CategoryDbCategory[]>;
    create(args: {
      data: CategoryCreateData;
      select?: unknown;
    }): Promise<CategoryDbCategory>;
    update(args: {
      where: { id: string };
      data: CategoryUpdateData;
      select?: unknown;
    }): Promise<CategoryDbCategory>;
  };
};

export type CategoryServiceCoreDependencies = {
  db: CategoryServiceClient;
  enums?: CategoryServiceEnums;
  slugifyFn?: typeof defaultSlugify;
};

export function createCategoryServiceCore(
  dependencies: CategoryServiceCoreDependencies,
) {
  const db = dependencies.db;
  const enums = dependencies.enums ?? DEFAULT_CATEGORY_ENUMS;
  const slugifyFn = dependencies.slugifyFn ?? defaultSlugify;

  async function listByType(input: unknown): Promise<CategoryResult<CategoryDto[]>> {
    const parsed = categoryListByTypeSchema.safeParse(input);

    if (!parsed.success) {
      return categoryFailure("VALIDATION_FAILED", {
        validationErrors: formatCategoryValidationErrors(parsed.error),
      });
    }

    const where: CategoryFindManyArgs["where"] = {
      type: toCategoryType(parsed.data.type),
    };

    if (!parsed.data.includeInactive) {
      where.isActive = true;
    }

    try {
      const categories = await db.category.findMany({
        where,
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }],
        take: parsed.data.limit,
        select: CATEGORY_SELECT,
      });

      return categorySuccess(categories.map(toCategoryDto));
    } catch {
      return categoryFailure("DATABASE_ERROR");
    }
  }

  async function create(input: unknown): Promise<CategoryResult<CategoryDto>> {
    const parsed = createCategorySchema.safeParse(input);

    if (!parsed.success) {
      return categoryFailure("VALIDATION_FAILED", {
        validationErrors: formatCategoryValidationErrors(parsed.error),
      });
    }

    try {
      const category = await db.category.create({
        data: {
          name: parsed.data.name,
          slug: slugifyFn(parsed.data.name, "categoria"),
          type: toCategoryType(parsed.data.type),
          description: parsed.data.description,
          displayOrder: parsed.data.displayOrder,
          isActive: true,
        },
        select: CATEGORY_SELECT,
      });

      return categorySuccess(toCategoryDto(category));
    } catch (error) {
      return categoryFailureFromError(error);
    }
  }

  async function update(input: unknown): Promise<CategoryResult<CategoryDto>> {
    const parsed = updateCategorySchema.safeParse(input);

    if (!parsed.success) {
      return categoryFailure("VALIDATION_FAILED", {
        validationErrors: formatCategoryValidationErrors(parsed.error),
      });
    }

    const data: CategoryUpdateData = {};

    if (parsed.data.name !== undefined) {
      data.name = parsed.data.name;
    }

    if (parsed.data.description !== undefined) {
      data.description = parsed.data.description;
    }

    if (parsed.data.displayOrder !== undefined) {
      data.displayOrder = parsed.data.displayOrder;
    }

    try {
      const category = await db.category.update({
        where: { id: parsed.data.id },
        data,
        select: CATEGORY_SELECT,
      });

      return categorySuccess(toCategoryDto(category));
    } catch (error) {
      return categoryFailureFromError(error);
    }
  }

  async function activate(input: unknown): Promise<CategoryResult<CategoryDto>> {
    const parsed = activateCategorySchema.safeParse(input);

    if (!parsed.success) {
      return categoryFailure("VALIDATION_FAILED", {
        validationErrors: formatCategoryValidationErrors(parsed.error),
      });
    }

    return setCategoryActivity(parsed.data.id, true);
  }

  async function inactivate(input: unknown): Promise<CategoryResult<CategoryDto>> {
    const parsed = inactivateCategorySchema.safeParse(input);

    if (!parsed.success) {
      return categoryFailure("VALIDATION_FAILED", {
        validationErrors: formatCategoryValidationErrors(parsed.error),
      });
    }

    return setCategoryActivity(parsed.data.id, false);
  }

  async function setCategoryActivity(
    id: string,
    isActive: boolean,
  ): Promise<CategoryResult<CategoryDto>> {
    try {
      const category = await db.category.update({
        where: { id },
        data: { isActive },
        select: CATEGORY_SELECT,
      });

      return categorySuccess(toCategoryDto(category));
    } catch (error) {
      return categoryFailureFromError(error);
    }
  }

  function toCategoryType(type: CategoryTypeValue): CategoryTypeValue {
    return type === "ESTABLISHMENT"
      ? enums.categoryType.ESTABLISHMENT
      : enums.categoryType.PRODUCT;
  }

  return {
    activate,
    create,
    inactivate,
    listByType,
    update,
  };
}

export type CategoryServiceCore = ReturnType<typeof createCategoryServiceCore>;

function categorySuccess<TData>(data: TData): CategoryResult<TData> {
  return { ok: true, data };
}

function categoryFailure(
  code: CategoryFailureCode,
  options: Pick<CategoryFailure, "validationErrors"> = {},
): CategoryFailure {
  return {
    ok: false,
    code,
    message: CATEGORY_ERROR_MESSAGES[code],
    ...options,
  };
}

function categoryFailureFromError(error: unknown): CategoryFailure {
  if (isNotFoundError(error)) {
    return categoryFailure("NOT_FOUND");
  }

  if (isUniqueConstraintError(error) && errorTargetsFields(error, ["slug", "type"])) {
    return categoryFailure("DUPLICATE_CATEGORY");
  }

  return categoryFailure("DATABASE_ERROR");
}

function toCategoryDto(category: CategoryDbCategory): CategoryDto {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    type: category.type,
    description: category.description ?? null,
    displayOrder: category.displayOrder,
    isActive: category.isActive,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
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
