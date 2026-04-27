import { z } from "zod";

const ESTABLISHMENT_STATUSES = [
  "PENDING",
  "ACTIVE",
  "BLOCKED",
  "INACTIVE",
] as const;

const REQUIRED_FIELD_MESSAGE = "Campo obrigatório.";
const FORBIDDEN_FIELD_MESSAGE = "Campo não permitido.";
const ESTABLISHMENT_SELECT = {
  id: true,
  ownerId: true,
  categoryId: true,
  name: true,
  slug: true,
  description: true,
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
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      phone: true,
    },
  },
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

const DEFAULT_ESTABLISHMENT_ENUMS = {
  establishmentStatus: {
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    BLOCKED: "BLOCKED",
    INACTIVE: "INACTIVE",
  },
} as const satisfies EstablishmentServiceEnums;

const TRANSITIONS = {
  approve: {
    target: "ACTIVE",
    allowedFrom: ["PENDING"],
  },
  block: {
    target: "BLOCKED",
    allowedFrom: ["PENDING", "ACTIVE"],
  },
  reactivate: {
    target: "ACTIVE",
    allowedFrom: ["BLOCKED", "INACTIVE"],
  },
  inactivate: {
    target: "INACTIVE",
    allowedFrom: ["PENDING", "ACTIVE", "BLOCKED"],
  },
} as const satisfies Record<string, EstablishmentTransition>;

export const ESTABLISHMENT_ERROR_MESSAGES = {
  VALIDATION_FAILED: "Revise os campos destacados.",
  NOT_FOUND: "Estabelecimento não encontrado.",
  INVALID_TRANSITION:
    "Transição de status não permitida para este estabelecimento.",
  DATABASE_ERROR:
    "Não foi possível concluir a operação de estabelecimento. Tente novamente.",
} as const;

export type EstablishmentStatusValue = (typeof ESTABLISHMENT_STATUSES)[number];
export type EstablishmentFailureCode = keyof typeof ESTABLISHMENT_ERROR_MESSAGES;
export type CategoryTypeValue = "ESTABLISHMENT" | "PRODUCT";
export type OwnerRoleValue = "ADMIN" | "MERCHANT" | "CUSTOMER";
export type OwnerStatusValue = "ACTIVE" | "INVITED" | "SUSPENDED";
export type EstablishmentFieldErrors = Record<string, string[]>;
export type EstablishmentValidationErrors = {
  fieldErrors: EstablishmentFieldErrors;
  formErrors: string[];
};

export type EstablishmentFailure = {
  ok: false;
  code: EstablishmentFailureCode;
  message: string;
  validationErrors?: EstablishmentValidationErrors;
};

export type EstablishmentSuccess<TData> = {
  ok: true;
  data: TData;
};

export type EstablishmentResult<TData> =
  | EstablishmentFailure
  | EstablishmentSuccess<TData>;

export type EstablishmentServiceEnums = {
  establishmentStatus: Record<
    "PENDING" | "ACTIVE" | "BLOCKED" | "INACTIVE",
    EstablishmentStatusValue
  >;
};

export type DecimalLike = { toString(): string } | number | string;

export type EstablishmentDbOwner = {
  id: string;
  name: string;
  email: string;
  role: OwnerRoleValue;
  status: OwnerStatusValue;
  phone: string | null;
  passwordHash?: string;
  sessions?: unknown;
};

export type EstablishmentDbCategory = {
  id: string;
  name: string;
  slug: string;
  type: CategoryTypeValue;
  isActive: boolean;
};

export type EstablishmentDbRow = {
  id: string;
  ownerId: string;
  categoryId: string | null;
  name: string;
  slug: string;
  description: string | null;
  status: EstablishmentStatusValue;
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
  owner: EstablishmentDbOwner;
  category: EstablishmentDbCategory | null;
};

export type EstablishmentOwnerDto = {
  id: string;
  name: string;
  email: string;
  role: OwnerRoleValue;
  status: OwnerStatusValue;
  phone: string | null;
};

export type EstablishmentCategoryDto = {
  id: string;
  name: string;
  slug: string;
  type: CategoryTypeValue;
  isActive: boolean;
};

export type EstablishmentListItemDto = {
  id: string;
  ownerId: string;
  categoryId: string | null;
  name: string;
  slug: string;
  status: EstablishmentStatusValue;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  state: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner: EstablishmentOwnerDto;
  category: EstablishmentCategoryDto | null;
};

export type EstablishmentDetailDto = EstablishmentListItemDto & {
  description: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  deliveryFee: string;
  minimumOrder: string;
};

export type EstablishmentDashboardDto = {
  countsByStatus: Record<EstablishmentStatusValue, number>;
  recentPending: EstablishmentListItemDto[];
};

export type EstablishmentFindManyArgs = {
  where?: {
    status?: EstablishmentStatusValue;
  };
  orderBy?: Array<
    | { createdAt: "asc" | "desc" }
    | { name: "asc" | "desc" }
    | { id: "asc" | "desc" }
  >;
  take?: number;
  select?: unknown;
};

export type EstablishmentServiceClient = {
  establishment: {
    count(args?: { where?: { status?: EstablishmentStatusValue } }): Promise<number>;
    findMany(args?: EstablishmentFindManyArgs): Promise<EstablishmentDbRow[]>;
    findUnique(args: {
      where: { id: string };
      select?: unknown;
    }): Promise<EstablishmentDbRow | null>;
    update(args: {
      where: { id: string };
      data: { status?: EstablishmentStatusValue };
      select?: unknown;
    }): Promise<EstablishmentDbRow>;
  };
};

export type EstablishmentServiceCoreDependencies = {
  db: EstablishmentServiceClient;
  enums?: EstablishmentServiceEnums;
};

type EstablishmentTransition = {
  target: EstablishmentStatusValue;
  allowedFrom: readonly EstablishmentStatusValue[];
};

const establishmentStatusSchema = z.enum(ESTABLISHMENT_STATUSES, {
  error: "Selecione um status de estabelecimento válido.",
});

const establishmentIdSchema = z
  .string({ error: REQUIRED_FIELD_MESSAGE })
  .trim()
  .min(1, "Informe o identificador do estabelecimento.")
  .max(128, "Informe um identificador com até 128 caracteres.");

const establishmentIdInputSchema = z
  .object({
    id: establishmentIdSchema,
  })
  .strict();

const limitSchema = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    if (typeof value === "string") {
      const trimmedValue = value.trim();

      return trimmedValue.length > 0 ? Number(trimmedValue) : undefined;
    }

    return value;
  }, z.number({ error: "Informe um limite numérico." }).int("Informe um limite inteiro.").min(1, "Informe um limite maior que zero.").max(100, "Informe um limite de até 100 estabelecimentos."))
  .optional();

const establishmentListSchema = z
  .object({
    status: establishmentStatusSchema.optional(),
    limit: limitSchema,
  })
  .strict()
  .transform(({ limit, status }) => ({
    status,
    limit: limit ?? 50,
  }));

export function createEstablishmentServiceCore(
  dependencies: EstablishmentServiceCoreDependencies,
) {
  const db = dependencies.db;
  const enums = dependencies.enums ?? DEFAULT_ESTABLISHMENT_ENUMS;

  async function getDashboard(): Promise<
    EstablishmentResult<EstablishmentDashboardDto>
  > {
    try {
      const [pending, active, blocked, inactive, recentPending] = await Promise.all([
        db.establishment.count({ where: { status: enums.establishmentStatus.PENDING } }),
        db.establishment.count({ where: { status: enums.establishmentStatus.ACTIVE } }),
        db.establishment.count({ where: { status: enums.establishmentStatus.BLOCKED } }),
        db.establishment.count({ where: { status: enums.establishmentStatus.INACTIVE } }),
        db.establishment.findMany({
          where: { status: enums.establishmentStatus.PENDING },
          orderBy: [{ createdAt: "desc" }, { name: "asc" }, { id: "asc" }],
          take: 5,
          select: ESTABLISHMENT_SELECT,
        }),
      ]);

      return establishmentSuccess({
        countsByStatus: {
          PENDING: pending,
          ACTIVE: active,
          BLOCKED: blocked,
          INACTIVE: inactive,
        },
        recentPending: recentPending.map(toEstablishmentListItemDto),
      });
    } catch {
      return establishmentFailure("DATABASE_ERROR");
    }
  }

  async function list(
    input: unknown = {},
  ): Promise<EstablishmentResult<EstablishmentListItemDto[]>> {
    const parsed = establishmentListSchema.safeParse(input ?? {});

    if (!parsed.success) {
      return establishmentFailure("VALIDATION_FAILED", {
        validationErrors: formatEstablishmentValidationErrors(parsed.error),
      });
    }

    const where: EstablishmentFindManyArgs["where"] = {};

    if (parsed.data.status) {
      where.status = toEstablishmentStatus(parsed.data.status);
    }

    try {
      const establishments = await db.establishment.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { name: "asc" }, { id: "asc" }],
        take: parsed.data.limit,
        select: ESTABLISHMENT_SELECT,
      });

      return establishmentSuccess(
        establishments.map(toEstablishmentListItemDto),
      );
    } catch {
      return establishmentFailure("DATABASE_ERROR");
    }
  }

  async function getById(
    input: unknown,
  ): Promise<EstablishmentResult<EstablishmentDetailDto>> {
    const parsed = establishmentIdInputSchema.safeParse(input);

    if (!parsed.success) {
      return establishmentFailure("VALIDATION_FAILED", {
        validationErrors: formatEstablishmentValidationErrors(parsed.error),
      });
    }

    const result = await readEstablishmentById(parsed.data.id);

    if (!result.ok) {
      return result;
    }

    return establishmentSuccess(toEstablishmentDetailDto(result.data));
  }

  async function approve(
    input: unknown,
  ): Promise<EstablishmentResult<EstablishmentDetailDto>> {
    return transition(input, TRANSITIONS.approve);
  }

  async function block(
    input: unknown,
  ): Promise<EstablishmentResult<EstablishmentDetailDto>> {
    return transition(input, TRANSITIONS.block);
  }

  async function reactivate(
    input: unknown,
  ): Promise<EstablishmentResult<EstablishmentDetailDto>> {
    return transition(input, TRANSITIONS.reactivate);
  }

  async function inactivate(
    input: unknown,
  ): Promise<EstablishmentResult<EstablishmentDetailDto>> {
    return transition(input, TRANSITIONS.inactivate);
  }

  async function transition(
    input: unknown,
    transitionConfig: EstablishmentTransition,
  ): Promise<EstablishmentResult<EstablishmentDetailDto>> {
    const parsed = establishmentIdInputSchema.safeParse(input);

    if (!parsed.success) {
      return establishmentFailure("VALIDATION_FAILED", {
        validationErrors: formatEstablishmentValidationErrors(parsed.error),
      });
    }

    const current = await readEstablishmentById(parsed.data.id);

    if (!current.ok) {
      return current;
    }

    if (current.data.status === transitionConfig.target) {
      return establishmentSuccess(toEstablishmentDetailDto(current.data));
    }

    if (!transitionConfig.allowedFrom.includes(current.data.status)) {
      return establishmentFailure("INVALID_TRANSITION");
    }

    try {
      const establishment = await db.establishment.update({
        where: { id: parsed.data.id },
        data: { status: toEstablishmentStatus(transitionConfig.target) },
        select: ESTABLISHMENT_SELECT,
      });

      return establishmentSuccess(toEstablishmentDetailDto(establishment));
    } catch (error) {
      return establishmentFailureFromError(error);
    }
  }

  async function readEstablishmentById(
    id: string,
  ): Promise<EstablishmentResult<EstablishmentDbRow>> {
    try {
      const establishment = await db.establishment.findUnique({
        where: { id },
        select: ESTABLISHMENT_SELECT,
      });

      if (!establishment) {
        return establishmentFailure("NOT_FOUND");
      }

      return establishmentSuccess(establishment);
    } catch {
      return establishmentFailure("DATABASE_ERROR");
    }
  }

  function toEstablishmentStatus(
    status: EstablishmentStatusValue,
  ): EstablishmentStatusValue {
    switch (status) {
      case "PENDING":
        return enums.establishmentStatus.PENDING;
      case "ACTIVE":
        return enums.establishmentStatus.ACTIVE;
      case "BLOCKED":
        return enums.establishmentStatus.BLOCKED;
      case "INACTIVE":
        return enums.establishmentStatus.INACTIVE;
    }
  }

  return {
    approve,
    block,
    getById,
    getDashboard,
    inactivate,
    list,
    reactivate,
  };
}

export type EstablishmentServiceCore = ReturnType<
  typeof createEstablishmentServiceCore
>;

function establishmentSuccess<TData>(
  data: TData,
): EstablishmentResult<TData> {
  return { ok: true, data };
}

function establishmentFailure(
  code: EstablishmentFailureCode,
  options: Pick<EstablishmentFailure, "validationErrors"> = {},
): EstablishmentFailure {
  return {
    ok: false,
    code,
    message: ESTABLISHMENT_ERROR_MESSAGES[code],
    ...options,
  };
}

function establishmentFailureFromError(error: unknown): EstablishmentFailure {
  if (isNotFoundError(error)) {
    return establishmentFailure("NOT_FOUND");
  }

  return establishmentFailure("DATABASE_ERROR");
}

function toEstablishmentListItemDto(
  establishment: EstablishmentDbRow,
): EstablishmentListItemDto {
  return {
    id: establishment.id,
    ownerId: establishment.ownerId,
    categoryId: establishment.categoryId ?? null,
    name: establishment.name,
    slug: establishment.slug,
    status: establishment.status,
    phone: establishment.phone ?? null,
    whatsapp: establishment.whatsapp ?? null,
    city: establishment.city ?? null,
    state: establishment.state ?? null,
    createdAt: establishment.createdAt,
    updatedAt: establishment.updatedAt,
    owner: toOwnerDto(establishment.owner),
    category: toCategoryDto(establishment.category),
  };
}

function toEstablishmentDetailDto(
  establishment: EstablishmentDbRow,
): EstablishmentDetailDto {
  return {
    ...toEstablishmentListItemDto(establishment),
    description: establishment.description ?? null,
    addressLine1: establishment.addressLine1 ?? null,
    addressLine2: establishment.addressLine2 ?? null,
    postalCode: establishment.postalCode ?? null,
    deliveryFee: moneyToString(establishment.deliveryFee),
    minimumOrder: moneyToString(establishment.minimumOrder),
  };
}

function toOwnerDto(owner: EstablishmentDbOwner): EstablishmentOwnerDto {
  return {
    id: owner.id,
    name: owner.name,
    email: owner.email,
    role: owner.role,
    status: owner.status,
    phone: owner.phone ?? null,
  };
}

function toCategoryDto(
  category: EstablishmentDbCategory | null,
): EstablishmentCategoryDto | null {
  if (!category) {
    return null;
  }

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

function formatEstablishmentValidationErrors(
  error: z.ZodError,
): EstablishmentValidationErrors {
  const fieldErrors: EstablishmentFieldErrors = {};
  const formErrors: string[] = [];

  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        addFieldError(fieldErrors, key, FORBIDDEN_FIELD_MESSAGE);
      }
      continue;
    }

    const [field] = issue.path;

    if (typeof field === "string") {
      addFieldError(fieldErrors, field, issue.message);
    } else {
      formErrors.push(issue.message);
    }
  }

  return { fieldErrors, formErrors };
}

function addFieldError(
  fieldErrors: EstablishmentFieldErrors,
  field: string,
  message: string,
) {
  fieldErrors[field] = [...(fieldErrors[field] ?? []), message];
}

function isNotFoundError(error: unknown) {
  return isRecord(error) && error.code === "P2025";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
