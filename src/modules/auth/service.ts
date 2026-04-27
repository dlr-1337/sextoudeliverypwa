import "server-only";

import {
  EstablishmentStatus,
  type PrismaClient,
  UserRole,
  UserStatus,
} from "@/generated/prisma/client";
import { db } from "@/server/db";

import {
  createAuthServiceCore,
  type AuthServiceClient,
} from "./service-core";

const authDb: PrismaClient = db;

export const authService = createAuthServiceCore({
  db: authDb as unknown as AuthServiceClient,
  enums: {
    userRole: UserRole,
    userStatus: UserStatus,
    establishmentStatus: EstablishmentStatus,
  },
});

export type AuthService = typeof authService;
