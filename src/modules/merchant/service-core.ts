import {
  formatMerchantValidationErrors,
  merchantLogoUrlInputSchema,
  merchantOwnerInputSchema,
  merchantProfileSchema,
  type MerchantProfileInput,
  type MerchantValidationErrors,
} from "./schemas";

export const MERCHANT_ESTABLISHMENT_SELECT = {
  id: true,
  ownerId: true,
  categoryId: true,
  name: true,
  slug: true,
  description: true,
  logoUrl: true,
  status: true,
  phone: true,
  whatsapp: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  deliveryFee: true,
  minimumOrder: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      isActive: true,
    },
  },
} as const;

export const MERCHANT_CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  type: true,
  isActive: true,
} as const;

export const MERCHANT_ERROR_MESSAGES = {
  VALIDATION_FAILED: "Revise os campos destacados.",
  NOT_FOUND: "Estabelecimento não encontrado para este comerciante.",
  INACTIVE_STATUS: "Este estabelecimento precisa estar ativo para editar o perfil.",
  INVALID_CATEGORY: "Selecione uma categoria ativa de estabelecimento.",
  DATABASE_ERROR:
    "Não foi possível concluir a operação do estabelecimento. Tente novamente.",
} as const;

export const MERCHANT_STATUS_MESSAGES = {
  PENDING: "Seu estabelecimento está aguardando aprovação.",
  ACTIVE: "Seu estabelecimento está ativo.",
  BLOCKED: "Seu estabelecimento está bloqueado. Entre em contato com o suporte.",
  INACTIVE: "Seu estabelecimento está inativo.",
} as const satisfies Record<MerchantEstablishmentStatus, string>;

const DEFAULT_MERCHANT_ENUMS = {
  establishmentStatus: {
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    BLOCKED: "BLOCKED",
    INACTIVE: "INACTIVE",
  },
  categoryType: {
    ESTABLISHMENT: "ESTABLISHMENT",
    PRODUCT: "PRODUCT",
  },
} as const satisfies MerchantServiceEnums;

export type MerchantEstablishmentStatus =
  | "PENDING"
  | "ACTIVE"
  | "BLOCKED"
  | "INACTIVE";
export type MerchantCategoryType = "ESTABLISHMENT" | "PRODUCT";
export type MerchantFailureCode = keyof typeof MERCHANT_ERROR_MESSAGES;
export type DecimalLike = { toString(): string } | number | string;

export type MerchantFailure = {
  ok: false;
  code: MerchantFailureCode;
  message: string;
  validationErrors?: MerchantValidationErrors;
};

export type MerchantSuccess<TData> = {
  ok: true;
  data: TData;
};

export type MerchantResult<TData> = MerchantFailure | MerchantSuccess<TData>;

export type MerchantDbCategory = {
  id: string;
  name: string;
  slug: string;
  type: MerchantCategoryType;
  isActive: boolean;
};

export type MerchantDbEstablishment = {
  id: string;
  ownerId: string;
  categoryId: string | null;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  status: MerchantEstablishmentStatus;
  phone: string | null;
  whatsapp: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  deliveryFee: DecimalLike;
  minimumOrder: DecimalLike;
  createdAt: Date;
  updatedAt: Date;
  category: MerchantDbCategory | null;
};

export type MerchantCategoryDto = MerchantDbCategory;

export type MerchantEstablishmentDto = {
  id: string;
  categoryId: string | null;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  status: MerchantEstablishmentStatus;
  phone: string | null;
  whatsapp: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  deliveryFee: string;
  minimumOrder: string;
  createdAt: Date;
  updatedAt: Date;
  category: MerchantCategoryDto | null;
};

export type MerchantDashboardDto = {
  establishment: MerchantEstablishmentDto;
  canEditProfile: boolean;
  statusMessage: string;
};

export type MerchantFindFirstArgs = {
  where: { ownerId: string };
  orderBy?: Array<{ createdAt: "asc" | "desc" } | { id: "asc" | "desc" }>;
  select?: unknown;
};

export type MerchantUpdateData = Partial<{
  categoryId: string | null;
  name: string;
  description: string | null;
  logoUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  deliveryFee: string;
  minimumOrder: string;
}>;

export type MerchantCategoryFindFirstArgs = {
  where: {
    id?: string;
    type?: MerchantCategoryType;
    isActive?: boolean;
  };
  select?: unknown;
};

export type MerchantServiceClient = {
  establishment: {
    findFirst(args: MerchantFindFirstArgs): Promise<MerchantDbEstablishment | null>;
    update(args: {
      where: { id: string };
      data: MerchantUpdateData;
      select?: unknown;
    }): Promise<MerchantDbEstablishment>;
  };
  category: {
    findFirst(args: MerchantCategoryFindFirstArgs): Promise<MerchantDbCategory | null>;
  };
};

export type MerchantServiceEnums = {
  establishmentStatus: Record<MerchantEstablishmentStatus, MerchantEstablishmentStatus>;
  categoryType: Record<MerchantCategoryType, MerchantCategoryType>;
};

export type MerchantServiceCoreDependencies = {
  db: MerchantServiceClient;
  enums?: MerchantServiceEnums;
};

export function createMerchantServiceCore(
  dependencies: MerchantServiceCoreDependencies,
) {
  const db = dependencies.db;
  const enums = dependencies.enums ?? DEFAULT_MERCHANT_ENUMS;

  async function getDashboardForOwner(
    ownerIdInput: unknown,
  ): Promise<MerchantResult<MerchantDashboardDto>> {
    const ownerId = parseOwnerId(ownerIdInput);

    if (!ownerId.ok) {
      return ownerId;
    }

    const establishment = await readEstablishmentForOwner(ownerId.data);

    if (!establishment.ok) {
      return establishment;
    }

    return merchantSuccess(toDashboardDto(establishment.data));
  }

  async function updateProfileForOwner(
    ownerIdInput: unknown,
    input: unknown,
  ): Promise<MerchantResult<MerchantEstablishmentDto>> {
    const ownerId = parseOwnerId(ownerIdInput);

    if (!ownerId.ok) {
      return ownerId;
    }

    const parsed = merchantProfileSchema.safeParse(input);

    if (!parsed.success) {
      return merchantFailure("VALIDATION_FAILED", {
        validationErrors: formatMerchantValidationErrors(parsed.error),
      });
    }

    const establishment = await readEstablishmentForOwner(ownerId.data);

    if (!establishment.ok) {
      return establishment;
    }

    const activeCheck = requireActiveStatus(establishment.data);

    if (!activeCheck.ok) {
      return activeCheck;
    }

    const categoryData = await resolveCategoryUpdate(parsed.data.categoryId);

    if (!categoryData.ok) {
      return categoryData;
    }

    const data = toProfileUpdateData(parsed.data);

    if (categoryData.data.shouldSetCategory) {
      data.categoryId = categoryData.data.categoryId;
    }

    return updateEstablishment(establishment.data.id, data);
  }

  async function updateLogoForOwner(
    ownerIdInput: unknown,
    logoUrlInput: unknown,
  ): Promise<MerchantResult<MerchantEstablishmentDto>> {
    const ownerId = parseOwnerId(ownerIdInput);

    if (!ownerId.ok) {
      return ownerId;
    }

    const parsed = merchantLogoUrlInputSchema.safeParse({ logoUrl: logoUrlInput });

    if (!parsed.success) {
      return merchantFailure("VALIDATION_FAILED", {
        validationErrors: formatMerchantValidationErrors(parsed.error),
      });
    }

    const establishment = await readEstablishmentForOwner(ownerId.data);

    if (!establishment.ok) {
      return establishment;
    }

    const activeCheck = requireActiveStatus(establishment.data);

    if (!activeCheck.ok) {
      return activeCheck;
    }

    return updateEstablishment(establishment.data.id, {
      logoUrl: parsed.data.logoUrl,
    });
  }

  async function readEstablishmentForOwner(
    ownerId: string,
  ): Promise<MerchantResult<MerchantDbEstablishment>> {
    try {
      const establishment = await db.establishment.findFirst({
        where: { ownerId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: MERCHANT_ESTABLISHMENT_SELECT,
      });

      if (!establishment) {
        return merchantFailure("NOT_FOUND");
      }

      return merchantSuccess(establishment);
    } catch {
      return merchantFailure("DATABASE_ERROR");
    }
  }

  async function resolveCategoryUpdate(
    categoryId: MerchantProfileInput["categoryId"],
  ): Promise<
    MerchantResult<
      | { shouldSetCategory: false; categoryId?: never }
      | { shouldSetCategory: true; categoryId: string | null }
    >
  > {
    if (categoryId === undefined) {
      return merchantSuccess({ shouldSetCategory: false });
    }

    if (categoryId === null) {
      return merchantSuccess({ shouldSetCategory: true, categoryId: null });
    }

    try {
      const category = await db.category.findFirst({
        where: {
          id: categoryId,
          type: enums.categoryType.ESTABLISHMENT,
          isActive: true,
        },
        select: MERCHANT_CATEGORY_SELECT,
      });

      if (!category) {
        return invalidCategoryFailure();
      }

      return merchantSuccess({ shouldSetCategory: true, categoryId: category.id });
    } catch {
      return merchantFailure("DATABASE_ERROR");
    }
  }

  async function updateEstablishment(
    id: string,
    data: MerchantUpdateData,
  ): Promise<MerchantResult<MerchantEstablishmentDto>> {
    try {
      const updated = await db.establishment.update({
        where: { id },
        data,
        select: MERCHANT_ESTABLISHMENT_SELECT,
      });

      return merchantSuccess(toEstablishmentDto(updated));
    } catch (error) {
      return merchantFailureFromError(error);
    }
  }

  function requireActiveStatus(
    establishment: MerchantDbEstablishment,
  ): MerchantResult<true> {
    if (establishment.status !== enums.establishmentStatus.ACTIVE) {
      return merchantFailure("INACTIVE_STATUS");
    }

    return merchantSuccess(true);
  }

  return {
    getDashboardForOwner,
    updateLogoForOwner,
    updateProfileForOwner,
  };
}

export type MerchantServiceCore = ReturnType<typeof createMerchantServiceCore>;

function parseOwnerId(ownerIdInput: unknown): MerchantResult<string> {
  const parsed = merchantOwnerInputSchema.safeParse({ ownerId: ownerIdInput });

  if (!parsed.success) {
    return merchantFailure("VALIDATION_FAILED", {
      validationErrors: formatMerchantValidationErrors(parsed.error),
    });
  }

  return merchantSuccess(parsed.data.ownerId);
}

function toProfileUpdateData(input: MerchantProfileInput): MerchantUpdateData {
  const data: MerchantUpdateData = {};

  setIfDefined(data, "name", input.name);
  setIfDefined(data, "description", input.description);
  setIfDefined(data, "phone", input.phone);
  setIfDefined(data, "whatsapp", input.whatsapp);
  setIfDefined(data, "addressLine1", input.addressLine1);
  setIfDefined(data, "addressLine2", input.addressLine2);
  setIfDefined(data, "city", input.city);
  setIfDefined(data, "state", input.state);
  setIfDefined(data, "postalCode", input.postalCode);
  setIfDefined(data, "deliveryFee", input.deliveryFee);
  setIfDefined(data, "minimumOrder", input.minimumOrder);

  return data;
}

function setIfDefined<TKey extends keyof MerchantUpdateData>(
  data: MerchantUpdateData,
  key: TKey,
  value: MerchantUpdateData[TKey] | undefined,
) {
  if (value !== undefined) {
    data[key] = value;
  }
}

function toDashboardDto(
  establishment: MerchantDbEstablishment,
): MerchantDashboardDto {
  return {
    establishment: toEstablishmentDto(establishment),
    canEditProfile: establishment.status === "ACTIVE",
    statusMessage: MERCHANT_STATUS_MESSAGES[establishment.status],
  };
}

function toEstablishmentDto(
  establishment: MerchantDbEstablishment,
): MerchantEstablishmentDto {
  return {
    id: establishment.id,
    categoryId: establishment.categoryId ?? null,
    name: establishment.name,
    slug: establishment.slug,
    description: establishment.description ?? null,
    logoUrl: establishment.logoUrl ?? null,
    status: establishment.status,
    phone: establishment.phone ?? null,
    whatsapp: establishment.whatsapp ?? null,
    addressLine1: establishment.addressLine1 ?? null,
    addressLine2: establishment.addressLine2 ?? null,
    city: establishment.city ?? null,
    state: establishment.state ?? null,
    postalCode: establishment.postalCode ?? null,
    deliveryFee: moneyToString(establishment.deliveryFee),
    minimumOrder: moneyToString(establishment.minimumOrder),
    createdAt: establishment.createdAt,
    updatedAt: establishment.updatedAt,
    category: establishment.category ? toCategoryDto(establishment.category) : null,
  };
}

function toCategoryDto(category: MerchantDbCategory): MerchantCategoryDto {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    type: category.type,
    isActive: category.isActive,
  };
}

function moneyToString(value: DecimalLike) {
  return value.toString();
}

function merchantSuccess<TData>(data: TData): MerchantResult<TData> {
  return { ok: true, data };
}

function merchantFailure(
  code: MerchantFailureCode,
  options: Pick<MerchantFailure, "validationErrors"> = {},
): MerchantFailure {
  return {
    ok: false,
    code,
    message: MERCHANT_ERROR_MESSAGES[code],
    ...options,
  };
}

function invalidCategoryFailure(): MerchantFailure {
  return merchantFailure("INVALID_CATEGORY", {
    validationErrors: {
      fieldErrors: {
        categoryId: [MERCHANT_ERROR_MESSAGES.INVALID_CATEGORY],
      },
      formErrors: [],
    },
  });
}

function merchantFailureFromError(error: unknown): MerchantFailure {
  if (isNotFoundError(error)) {
    return merchantFailure("NOT_FOUND");
  }

  return merchantFailure("DATABASE_ERROR");
}

function isNotFoundError(error: unknown) {
  return isRecord(error) && error.code === "P2025";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
