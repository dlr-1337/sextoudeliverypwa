import "server-only";

import {
  CategoryType,
  EstablishmentStatus,
  UserRole,
  UserStatus,
  type PrismaClient,
} from "@/generated/prisma/client";
import { db } from "@/server/db";

import {
  createAdminServiceCore,
  type AdminServiceClient,
} from "./service-core";

const adminDb: PrismaClient = db;

export const adminService = createAdminServiceCore({
  db: adminDb as unknown as AdminServiceClient,
  enums: {
    categoryType: CategoryType,
    establishmentStatus: EstablishmentStatus,
    userRole: UserRole,
    userStatus: UserStatus,
  },
});

export type AdminService = typeof adminService;
