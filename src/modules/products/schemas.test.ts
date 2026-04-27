import { describe, expect, it } from "vitest";

import {
  createProductSchema,
  formatProductValidationErrors,
  productImageUrlInputSchema,
  productOwnerInputSchema,
  updateProductSchema,
} from "./schemas";

describe("product input schemas", () => {
  it("normalizes required product prices from comma and dot money strings", () => {
    expect(
      createProductSchema.parse({
        name: "  Porção de Batata  ",
        description: "  Crocante  ",
        categoryId: " category-1 ",
        price: "12,5",
      }),
    ).toEqual({
      name: "Porção de Batata",
      description: "Crocante",
      categoryId: "category-1",
      price: "12.50",
    });

    expect(
      createProductSchema.parse({
        name: "Refrigerante",
        description: " ",
        categoryId: " ",
        price: "10.00",
      }),
    ).toMatchObject({
      description: null,
      categoryId: null,
      price: "10.00",
    });

    expect(updateProductSchema.parse({ price: 7 })).toEqual({ price: "7.00" });
  });

  it("rejects forbidden authority fields in normal create and update payloads", () => {
    const forbiddenFields = [
      "id",
      "ownerId",
      "establishmentId",
      "slug",
      "status",
      "imageUrl",
      "isFeatured",
    ];
    const result = createProductSchema.safeParse({
      name: "Produto válido",
      price: "9,99",
      id: "product-b",
      ownerId: "owner-b",
      establishmentId: "est-b",
      slug: "forged-slug",
      status: "ACTIVE",
      imageUrl: "/uploads/forged.webp",
      isFeatured: true,
    });

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error("Expected forbidden fields to fail validation.");
    }

    const errors = formatProductValidationErrors(result.error);

    for (const field of forbiddenFields) {
      expect(errors.fieldErrors[field]).toContain("Campo não permitido.");
    }

    const updateResult = updateProductSchema.safeParse({
      name: "Produto válido",
      ownerId: "owner-b",
      status: "ARCHIVED",
    });

    expect(updateResult.success).toBe(false);
  });

  it("returns field errors for malformed owner ids, categories, prices, and image URLs", () => {
    const ownerResult = productOwnerInputSchema.safeParse({ ownerId: " " });
    expect(ownerResult.success).toBe(false);

    if (!ownerResult.success) {
      expect(
        formatProductValidationErrors(ownerResult.error).fieldErrors.ownerId,
      ).toContain("Informe o identificador do comerciante.");
    }

    const createResult = createProductSchema.safeParse({
      name: "A",
      categoryId: "c".repeat(129),
      price: "-1",
    });

    expect(createResult.success).toBe(false);

    if (!createResult.success) {
      const errors = formatProductValidationErrors(createResult.error);
      expect(errors.fieldErrors.name).toContain(
        "Informe um nome com pelo menos 2 caracteres.",
      );
      expect(errors.fieldErrors.categoryId).toContain(
        "Informe um identificador com até 128 caracteres.",
      );
      expect(errors.fieldErrors.price).toContain(
        "Informe um valor maior que zero.",
      );
    }

    const malformedPrice = createProductSchema.safeParse({
      name: "Produto válido",
      price: "abc",
    });

    expect(malformedPrice.success).toBe(false);

    if (!malformedPrice.success) {
      expect(
        formatProductValidationErrors(malformedPrice.error).fieldErrors.price,
      ).toContain("Informe um valor em dinheiro válido.");
    }

    const emptyPrice = createProductSchema.safeParse({
      name: "Produto válido",
      price: " ",
    });

    expect(emptyPrice.success).toBe(false);

    if (!emptyPrice.success) {
      expect(formatProductValidationErrors(emptyPrice.error).fieldErrors.price).toContain(
        "Informe o preço do produto.",
      );
    }

    const imageResult = productImageUrlInputSchema.safeParse({
      imageUrl: "https://evil.example/photo.webp",
    });

    expect(imageResult.success).toBe(false);

    if (!imageResult.success) {
      expect(formatProductValidationErrors(imageResult.error).fieldErrors.imageUrl).toContain(
        "Informe um caminho de upload válido.",
      );
    }
  });
});
