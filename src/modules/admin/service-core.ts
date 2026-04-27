export type AdminEstablishmentStatus =
  | "PENDING"
  | "ACTIVE"
  | "BLOCKED"
  | "INACTIVE";
export type AdminCategoryType = "ESTABLISHMENT" | "PRODUCT";
export type AdminUserStatus = "ACTIVE" | "INVITED" | "SUSPENDED";

export const ADMIN_LIST_LIMITS = {
  CATEGORIES_PER_TYPE: 100,
  CUSTOMERS: 100,
  RECENT_PENDING_ESTABLISHMENTS: 5,
} as const;

export const ADMIN_SERVICE_ERROR_MESSAGES = {
  DASHBOARD_READ_FAILED:
    "Não foi possível carregar os indicadores administrativos. Tente novamente.",
  CATEGORIES_READ_FAILED:
    "Não foi possível carregar as categorias administrativas. Tente novamente.",
  CUSTOMERS_READ_FAILED:
    "Não foi possível carregar os clientes. Tente novamente.",
} as const;

export const ADMIN_RECENT_ESTABLISHMENT_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  city: true,
  state: true,
  createdAt: true,
  owner: {
    select: {
      name: true,
      email: true,
      phone: true,
      status: true,
    },
  },
  category: {
    select: {
      name: true,
      isActive: true,
    },
  },
} as const;

export const ADMIN_CATEGORY_SELECT = {
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

export const ADMIN_CUSTOMER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type AdminUserRole = "ADMIN" | "MERCHANT" | "CUSTOMER";

export type AdminServiceFailureCode = keyof typeof ADMIN_SERVICE_ERROR_MESSAGES;

export type AdminServiceFailure = {
  ok: false;
  code: AdminServiceFailureCode;
  message: string;
};

export type AdminServiceSuccess<TData> = {
  ok: true;
  data: TData;
};

export type AdminServiceResult<TData> =
  | AdminServiceFailure
  | AdminServiceSuccess<TData>;

export type AdminRecentEstablishmentDto = {
  id: string;
  name: string;
  slug: string;
  status: AdminEstablishmentStatus;
  city: string | null;
  state: string | null;
  createdAt: string;
  owner: {
    name: string;
    email: string;
    phone: string | null;
    status: AdminUserStatus;
  };
  category: {
    name: string;
    isActive: boolean;
  } | null;
};

export type AdminCategoryListItemDto = {
  id: string;
  name: string;
  slug: string;
  type: AdminCategoryType;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminCustomerListItemDto = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: AdminUserStatus;
  createdAt: string;
  updatedAt: string;
};

export type AdminDashboardDto = {
  generatedAt: string;
  establishmentCounts: Record<AdminEstablishmentStatus, number>;
  categoryCounts: Record<
    AdminCategoryType,
    {
      active: number;
      inactive: number;
      total: number;
    }
  >;
  customerCounts: {
    total: number;
    byStatus: Record<AdminUserStatus, number>;
  };
  recentPendingEstablishments: AdminRecentEstablishmentDto[];
};

export type AdminCategoryListDto = {
  byType: Record<AdminCategoryType, AdminCategoryListItemDto[]>;
  limitPerType: number;
};

export type AdminCustomerListDto = {
  customers: AdminCustomerListItemDto[];
  total: number;
  limit: number;
};

type CountArgs<TWhere> = {
  where?: TWhere;
};

type FindManyArgs<TWhere> = {
  where?: TWhere;
  orderBy?: unknown;
  take?: number;
  select?: unknown;
};

export type AdminRecentEstablishmentDbRow = {
  id: string;
  name: string;
  slug: string;
  status: AdminEstablishmentStatus;
  city: string | null;
  state: string | null;
  createdAt: Date;
  owner: {
    name: string;
    email: string;
    phone: string | null;
    status: AdminUserStatus;
  };
  category: {
    name: string;
    isActive: boolean;
  } | null;
};

export type AdminCategoryDbRow = {
  id: string;
  name: string;
  slug: string;
  type: AdminCategoryType;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminCustomerDbRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: AdminUserStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminServiceClient = {
  establishment: {
    count(
      args: CountArgs<{ status?: AdminEstablishmentStatus }>,
    ): Promise<number>;
    findMany(
      args: FindManyArgs<{ status?: AdminEstablishmentStatus }>,
    ): Promise<AdminRecentEstablishmentDbRow[]>;
  };
  category: {
    count(
      args: CountArgs<{ type?: AdminCategoryType; isActive?: boolean }>,
    ): Promise<number>;
    findMany(
      args: FindManyArgs<{ type?: AdminCategoryType }>,
    ): Promise<AdminCategoryDbRow[]>;
  };
  user: {
    count(args: CountArgs<{ role?: AdminUserRole; status?: AdminUserStatus }>): Promise<number>;
    findMany(
      args: FindManyArgs<{ role?: AdminUserRole }>,
    ): Promise<AdminCustomerDbRow[]>;
  };
};

export type AdminServiceEnums = {
  establishmentStatus: Record<AdminEstablishmentStatus, AdminEstablishmentStatus>;
  categoryType: Record<AdminCategoryType, AdminCategoryType>;
  userRole: Record<AdminUserRole, AdminUserRole>;
  userStatus: Record<AdminUserStatus, AdminUserStatus>;
};

export type AdminServiceCoreDependencies = {
  db: AdminServiceClient;
  enums?: AdminServiceEnums;
  now?: () => Date;
};

const DEFAULT_ADMIN_ENUMS = {
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
  userRole: {
    ADMIN: "ADMIN",
    MERCHANT: "MERCHANT",
    CUSTOMER: "CUSTOMER",
  },
  userStatus: {
    ACTIVE: "ACTIVE",
    INVITED: "INVITED",
    SUSPENDED: "SUSPENDED",
  },
} as const satisfies AdminServiceEnums;

export function createAdminServiceCore(
  dependencies: AdminServiceCoreDependencies,
) {
  const db = dependencies.db;
  const enums = dependencies.enums ?? DEFAULT_ADMIN_ENUMS;
  const now = dependencies.now ?? (() => new Date());

  async function getDashboard(): Promise<
    AdminServiceResult<AdminDashboardDto>
  > {
    try {
      const [
        pendingEstablishments,
        activeEstablishments,
        blockedEstablishments,
        inactiveEstablishments,
        establishmentCategoriesActive,
        establishmentCategoriesInactive,
        productCategoriesActive,
        productCategoriesInactive,
        activeCustomers,
        invitedCustomers,
        suspendedCustomers,
        totalCustomers,
        recentPendingEstablishments,
      ] = await Promise.all([
        countEstablishments("PENDING"),
        countEstablishments("ACTIVE"),
        countEstablishments("BLOCKED"),
        countEstablishments("INACTIVE"),
        countCategories("ESTABLISHMENT", true),
        countCategories("ESTABLISHMENT", false),
        countCategories("PRODUCT", true),
        countCategories("PRODUCT", false),
        countCustomersByStatus("ACTIVE"),
        countCustomersByStatus("INVITED"),
        countCustomersByStatus("SUSPENDED"),
        db.user.count({ where: { role: enums.userRole.CUSTOMER } }),
        db.establishment.findMany({
          where: { status: enums.establishmentStatus.PENDING },
          orderBy: [{ createdAt: "desc" }, { name: "asc" }, { id: "asc" }],
          take: ADMIN_LIST_LIMITS.RECENT_PENDING_ESTABLISHMENTS,
          select: ADMIN_RECENT_ESTABLISHMENT_SELECT,
        }),
      ]);

      return serviceSuccess({
        generatedAt: now().toISOString(),
        establishmentCounts: {
          PENDING: pendingEstablishments,
          ACTIVE: activeEstablishments,
          BLOCKED: blockedEstablishments,
          INACTIVE: inactiveEstablishments,
        },
        categoryCounts: {
          ESTABLISHMENT: {
            active: establishmentCategoriesActive,
            inactive: establishmentCategoriesInactive,
            total: establishmentCategoriesActive + establishmentCategoriesInactive,
          },
          PRODUCT: {
            active: productCategoriesActive,
            inactive: productCategoriesInactive,
            total: productCategoriesActive + productCategoriesInactive,
          },
        },
        customerCounts: {
          total: totalCustomers,
          byStatus: {
            ACTIVE: activeCustomers,
            INVITED: invitedCustomers,
            SUSPENDED: suspendedCustomers,
          },
        },
        recentPendingEstablishments: recentPendingEstablishments.map(
          toRecentEstablishmentDto,
        ),
      });
    } catch {
      return serviceFailure("DASHBOARD_READ_FAILED");
    }
  }

  async function listCategories(): Promise<
    AdminServiceResult<AdminCategoryListDto>
  > {
    try {
      const [establishmentCategories, productCategories] = await Promise.all([
        findCategoriesByType("ESTABLISHMENT"),
        findCategoriesByType("PRODUCT"),
      ]);

      return serviceSuccess({
        byType: {
          ESTABLISHMENT: establishmentCategories.map(toCategoryDto),
          PRODUCT: productCategories.map(toCategoryDto),
        },
        limitPerType: ADMIN_LIST_LIMITS.CATEGORIES_PER_TYPE,
      });
    } catch {
      return serviceFailure("CATEGORIES_READ_FAILED");
    }
  }

  async function listCustomers(): Promise<
    AdminServiceResult<AdminCustomerListDto>
  > {
    try {
      const [total, customers] = await Promise.all([
        db.user.count({ where: { role: enums.userRole.CUSTOMER } }),
        db.user.findMany({
          where: { role: enums.userRole.CUSTOMER },
          orderBy: [{ createdAt: "desc" }, { name: "asc" }, { id: "asc" }],
          take: ADMIN_LIST_LIMITS.CUSTOMERS,
          select: ADMIN_CUSTOMER_SELECT,
        }),
      ]);

      return serviceSuccess({
        customers: customers.map(toCustomerDto),
        total,
        limit: ADMIN_LIST_LIMITS.CUSTOMERS,
      });
    } catch {
      return serviceFailure("CUSTOMERS_READ_FAILED");
    }
  }

  function countEstablishments(status: AdminEstablishmentStatus) {
    return db.establishment.count({
      where: { status: enums.establishmentStatus[status] },
    });
  }

  function countCategories(type: AdminCategoryType, isActive: boolean) {
    return db.category.count({
      where: { type: enums.categoryType[type], isActive },
    });
  }

  function countCustomersByStatus(status: AdminUserStatus) {
    return db.user.count({
      where: { role: enums.userRole.CUSTOMER, status: enums.userStatus[status] },
    });
  }

  function findCategoriesByType(type: AdminCategoryType) {
    return db.category.findMany({
      where: { type: enums.categoryType[type] },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      take: ADMIN_LIST_LIMITS.CATEGORIES_PER_TYPE,
      select: ADMIN_CATEGORY_SELECT,
    });
  }

  return {
    getDashboard,
    listCategories,
    listCustomers,
  };
}

export type AdminServiceCore = ReturnType<typeof createAdminServiceCore>;

function serviceSuccess<TData>(data: TData): AdminServiceResult<TData> {
  return { ok: true, data };
}

function serviceFailure(code: AdminServiceFailureCode): AdminServiceFailure {
  return {
    ok: false,
    code,
    message: ADMIN_SERVICE_ERROR_MESSAGES[code],
  };
}

function toRecentEstablishmentDto(
  establishment: AdminRecentEstablishmentDbRow,
): AdminRecentEstablishmentDto {
  return {
    id: establishment.id,
    name: establishment.name,
    slug: establishment.slug,
    status: establishment.status,
    city: establishment.city ?? null,
    state: establishment.state ?? null,
    createdAt: toIsoString(establishment.createdAt),
    owner: {
      name: establishment.owner.name,
      email: establishment.owner.email,
      phone: establishment.owner.phone ?? null,
      status: establishment.owner.status,
    },
    category: establishment.category
      ? {
          name: establishment.category.name,
          isActive: establishment.category.isActive,
        }
      : null,
  };
}

function toCategoryDto(category: AdminCategoryDbRow): AdminCategoryListItemDto {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    type: category.type,
    description: category.description ?? null,
    displayOrder: category.displayOrder,
    isActive: category.isActive,
    createdAt: toIsoString(category.createdAt),
    updatedAt: toIsoString(category.updatedAt),
  };
}

function toCustomerDto(customer: AdminCustomerDbRow): AdminCustomerListItemDto {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone ?? null,
    status: customer.status,
    createdAt: toIsoString(customer.createdAt),
    updatedAt: toIsoString(customer.updatedAt),
  };
}

function toIsoString(value: Date) {
  return value.toISOString();
}
