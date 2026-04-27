import "server-only";

import { EstablishmentStatus, type PrismaClient } from "@/generated/prisma/client";
import { db } from "@/server/db";

import {
  createEstablishmentServiceCore,
  type EstablishmentServiceClient,
} from "./service-core";

const establishmentDb: PrismaClient = db;

export const establishmentService = createEstablishmentServiceCore({
  db: establishmentDb as unknown as EstablishmentServiceClient,
  enums: {
    establishmentStatus: EstablishmentStatus,
  },
});

export type EstablishmentService = typeof establishmentService;
