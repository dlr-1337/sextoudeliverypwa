import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  canActivateProductStatus,
  canArchiveProductStatus,
  canEditProductStatus,
  canMutateProductsForEstablishment,
  canPauseProductStatus,
  canUploadProductPhotoForStatus,
  getProductActionLabel,
  getProductEmptyStateCopy,
  getProductStatusBadgeCopy,
  getProductUnavailableStatusCopy,
  type ProductActionKind,
} from "./product-copy";

const nonActiveEstablishmentStatuses = [
  "PENDING",
  "BLOCKED",
  "INACTIVE",
  "missing",
] as const;

describe("merchant product copy helpers", () => {
  it("provides Portuguese labels and tones for every product lifecycle status", () => {
    expect(getProductStatusBadgeCopy("ACTIVE")).toMatchObject({
      label: "Ativo",
      tone: "success",
    });
    expect(getProductStatusBadgeCopy("PAUSED")).toMatchObject({
      label: "Pausado",
      tone: "warning",
    });
    expect(getProductStatusBadgeCopy("ARCHIVED")).toMatchObject({
      label: "Arquivado",
      tone: "neutral",
    });
    expect(getProductStatusBadgeCopy("DRAFT")).toMatchObject({
      label: "Rascunho",
      tone: "neutral",
    });
  });

  it("centralizes empty and unavailable Portuguese product panel copy", () => {
    expect(getProductEmptyStateCopy()).toMatchObject({
      title: "Nenhum produto cadastrado",
    });
    expect(getProductEmptyStateCopy().description).toContain("cadastre");

    expect(getProductUnavailableStatusCopy("PENDING")).toMatchObject({
      title: "Produtos aguardando aprovação",
      tone: "loading",
    });
    expect(getProductUnavailableStatusCopy("BLOCKED")).toMatchObject({
      title: "Produtos bloqueados",
      tone: "error",
    });
    expect(getProductUnavailableStatusCopy("INACTIVE")).toMatchObject({
      title: "Produtos indisponíveis",
      tone: "error",
    });
    expect(getProductUnavailableStatusCopy("missing").description).toContain(
      "loja",
    );
  });

  it("allows dashboard product mutations only for active establishments", () => {
    expect(canMutateProductsForEstablishment("ACTIVE")).toBe(true);

    for (const status of nonActiveEstablishmentStatuses) {
      expect(canMutateProductsForEstablishment(status)).toBe(false);
      expect(getProductUnavailableStatusCopy(status).description).not.toContain(
        "DATABASE_URL",
      );
    }
  });

  it("gates product-specific controls by product status without hard-delete wording", () => {
    expect(canEditProductStatus("ACTIVE")).toBe(true);
    expect(canEditProductStatus("PAUSED")).toBe(true);
    expect(canEditProductStatus("DRAFT")).toBe(true);
    expect(canEditProductStatus("ARCHIVED")).toBe(false);

    expect(canUploadProductPhotoForStatus("ACTIVE")).toBe(true);
    expect(canUploadProductPhotoForStatus("PAUSED")).toBe(false);
    expect(canUploadProductPhotoForStatus("DRAFT")).toBe(false);
    expect(canUploadProductPhotoForStatus("ARCHIVED")).toBe(false);

    expect(canPauseProductStatus("ACTIVE")).toBe(true);
    expect(canPauseProductStatus("PAUSED")).toBe(false);
    expect(canActivateProductStatus("PAUSED")).toBe(true);
    expect(canActivateProductStatus("DRAFT")).toBe(true);
    expect(canActivateProductStatus("ARCHIVED")).toBe(false);
    expect(canArchiveProductStatus("ACTIVE")).toBe(true);
    expect(canArchiveProductStatus("PAUSED")).toBe(true);
    expect(canArchiveProductStatus("DRAFT")).toBe(true);
    expect(canArchiveProductStatus("ARCHIVED")).toBe(false);

    expect(getProductActionLabel("archive", false)).toBe("Arquivar produto");
    expect(getProductActionLabel("archive", true)).toBe("Arquivando...");
    expect(getProductActionLabel("archive", false).toLowerCase()).not.toContain(
      "excluir",
    );
  });

  it("provides pending labels for all product actions", () => {
    const actions = [
      "create",
      "update",
      "activate",
      "pause",
      "archive",
      "photo",
    ] as const satisfies readonly ProductActionKind[];

    for (const action of actions) {
      expect(getProductActionLabel(action, false)).not.toBe(
        getProductActionLabel(action, true),
      );
      expect(getProductActionLabel(action, true)).toMatch(/\.\.\.$/);
    }
  });

  it("keeps client product forms free of forged owner, establishment, and status fields", () => {
    const formSource = readFileSync(
      join(process.cwd(), "src/app/estabelecimento/product-forms.tsx"),
      "utf8",
    );
    const uploadSource = readFileSync(
      join(process.cwd(), "src/app/estabelecimento/product-photo-upload-form.tsx"),
      "utf8",
    );
    const combinedSource = `${formSource}\n${uploadSource}`;

    expect(combinedSource).not.toMatch(/name=["']ownerId["']/);
    expect(combinedSource).not.toMatch(/name=["']establishmentId["']/);
    expect(combinedSource).not.toMatch(/name=["']status["']/);
    expect(combinedSource).not.toContain("Excluir produto");
    expect(combinedSource).toContain("name=\"productId\"");
    expect(combinedSource).toContain("name=\"photo\"");
  });
});
