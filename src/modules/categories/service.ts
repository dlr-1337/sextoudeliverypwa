import "server-only";

import { CategoryType, type PrismaClient } from "@/generated/prisma/client";
import { db } from "@/server/db";

import {
  createCategoryServiceCore,
  type CategoryServiceClient,
} from "./service-core";

const categoryDb: PrismaClient = db;

export const categoryService = createCategoryServiceCore({
  db: categoryDb as unknown as CategoryServiceClient,
  enums: {
    categoryType: CategoryType,
  },
});

export type CategoryService = typeof categoryService;
