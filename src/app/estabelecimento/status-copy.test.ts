import { describe, expect, it } from "vitest";

import {
  canMutateMerchantProfile,
  getMerchantPanelStatusCopy,
  getMerchantStatusBadgeCopy,
  shouldRenderMerchantMutationForms,
  type MerchantPanelStatus,
} from "./status-copy";

const nonActiveStatuses = [
  "PENDING",
  "BLOCKED",
  "INACTIVE",
  "missing",
] as const satisfies readonly MerchantPanelStatus[];

describe("merchant panel status copy", () => {
  it("provides Portuguese badge labels and notices for every route status", () => {
    expect(getMerchantStatusBadgeCopy("PENDING")).toMatchObject({
      label: "Pendente",
      tone: "warning",
    });
    expect(getMerchantStatusBadgeCopy("ACTIVE")).toMatchObject({
      label: "Ativo",
      tone: "success",
    });
    expect(getMerchantStatusBadgeCopy("BLOCKED")).toMatchObject({
      label: "Bloqueado",
      tone: "danger",
    });
    expect(getMerchantStatusBadgeCopy("INACTIVE")).toMatchObject({
      label: "Inativo",
      tone: "neutral",
    });
    expect(getMerchantStatusBadgeCopy("missing")).toMatchObject({
      label: "Não encontrada",
      tone: "danger",
    });
  });

  it("centralizes status-specific Portuguese empty, error, and success messaging", () => {
    expect(getMerchantPanelStatusCopy("PENDING")).toMatchObject({
      canMutate: false,
      noticeTone: "loading",
      title: "Aprovação pendente",
    });
    expect(getMerchantPanelStatusCopy("PENDING").description).toContain(
      "aguardando aprovação",
    );

    expect(getMerchantPanelStatusCopy("ACTIVE")).toMatchObject({
      canMutate: true,
      noticeTone: "empty",
      title: "Loja ativa",
    });
    expect(getMerchantPanelStatusCopy("ACTIVE").description).toContain(
      "atualizar dados operacionais e o logo",
    );

    expect(getMerchantPanelStatusCopy("BLOCKED")).toMatchObject({
      canMutate: false,
      noticeTone: "error",
      title: "Loja bloqueada",
    });
    expect(getMerchantPanelStatusCopy("INACTIVE")).toMatchObject({
      canMutate: false,
      noticeTone: "error",
      title: "Loja inativa",
    });
    expect(getMerchantPanelStatusCopy("missing")).toMatchObject({
      canMutate: false,
      noticeTone: "error",
      title: "Loja não encontrada",
    });
  });

  it("allows mutation forms only for active establishments", () => {
    expect(canMutateMerchantProfile("ACTIVE")).toBe(true);
    expect(shouldRenderMerchantMutationForms("ACTIVE")).toBe(true);

    for (const status of nonActiveStatuses) {
      expect(canMutateMerchantProfile(status)).toBe(false);
      expect(shouldRenderMerchantMutationForms(status)).toBe(false);
      expect(getMerchantPanelStatusCopy(status).formUnavailableMessage).toContain(
        "não pode ser editado",
      );
    }
  });
});
