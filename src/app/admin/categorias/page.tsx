import type { Metadata } from "next";

import { FeedbackState } from "@/components/ui/feedback-state";
import { requireAdminPageSession } from "@/modules/admin/auth";
import { adminService } from "@/modules/admin/service";

import { CategoryAdminForms } from "./category-admin-forms";

export const metadata: Metadata = {
  title: "Categorias administrativas",
  description:
    "Gestão administrativa de categorias de estabelecimentos e produtos.",
};

export default async function AdminCategoriesPage() {
  await requireAdminPageSession("/admin/categorias");

  const categories = await adminService.listCategories();

  if (!categories.ok) {
    return (
      <FeedbackState
        description={categories.message}
        title="Categorias indisponíveis"
        tone="error"
      />
    );
  }

  return (
    <CategoryAdminForms
      categoriesByType={categories.data.byType}
      limitPerType={categories.data.limitPerType}
    />
  );
}
