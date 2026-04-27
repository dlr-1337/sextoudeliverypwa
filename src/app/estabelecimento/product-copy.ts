import type { ProductStatusValue } from "@/modules/products/service-core";

import type {
  MerchantPanelNoticeTone,
  MerchantPanelStatus,
  MerchantStatusBadgeTone,
} from "./status-copy";

export type ProductStatusBadgeCopy = {
  label: string;
  tone: MerchantStatusBadgeTone;
};

export type ProductPanelCopy = {
  description: string;
  title: string;
  tone: MerchantPanelNoticeTone;
};

export type ProductActionKind =
  | "activate"
  | "archive"
  | "create"
  | "pause"
  | "photo"
  | "update";

const PRODUCT_STATUS_BADGE_COPY = {
  ACTIVE: { label: "Ativo", tone: "success" },
  PAUSED: { label: "Pausado", tone: "warning" },
  ARCHIVED: { label: "Arquivado", tone: "neutral" },
  DRAFT: { label: "Rascunho", tone: "neutral" },
} as const satisfies Record<ProductStatusValue, ProductStatusBadgeCopy>;

const PRODUCT_EMPTY_STATE_COPY = {
  title: "Nenhum produto cadastrado",
  description:
    "Comece pelo cadastro: cadastre seu primeiro produto para que ele apareça no catálogo público quando estiver ativo.",
  tone: "empty",
} as const satisfies ProductPanelCopy;

const PRODUCT_UNAVAILABLE_STATUS_COPY = {
  PENDING: {
    title: "Produtos aguardando aprovação",
    description:
      "Seu estabelecimento precisa ser aprovado pela administração antes de cadastrar produtos.",
    tone: "loading",
  },
  ACTIVE: {
    title: "Produtos liberados",
    description:
      "Cadastre, edite e organize produtos da loja ativa usando os controles abaixo.",
    tone: "empty",
  },
  BLOCKED: {
    title: "Produtos bloqueados",
    description:
      "A gestão de produtos está bloqueada para esta loja. Fale com o suporte antes de continuar.",
    tone: "error",
  },
  INACTIVE: {
    title: "Produtos indisponíveis",
    description:
      "Reative a operação da loja com o suporte antes de editar ou cadastrar produtos.",
    tone: "error",
  },
  missing: {
    title: "Produtos indisponíveis",
    description:
      "Não encontramos uma loja para esta sessão merchant, então a gestão de produtos não está disponível.",
    tone: "error",
  },
} as const satisfies Record<MerchantPanelStatus, ProductPanelCopy>;

const PRODUCT_ACTION_LABELS = {
  create: { idle: "Cadastrar produto", pending: "Cadastrando..." },
  update: { idle: "Salvar produto", pending: "Salvando..." },
  activate: { idle: "Ativar produto", pending: "Ativando..." },
  pause: { idle: "Pausar produto", pending: "Pausando..." },
  archive: { idle: "Arquivar produto", pending: "Arquivando..." },
  photo: { idle: "Enviar foto", pending: "Enviando..." },
} as const satisfies Record<ProductActionKind, { idle: string; pending: string }>;

export function getProductStatusBadgeCopy(
  status: ProductStatusValue,
): ProductStatusBadgeCopy {
  return PRODUCT_STATUS_BADGE_COPY[status];
}

export function getProductEmptyStateCopy(): ProductPanelCopy {
  return PRODUCT_EMPTY_STATE_COPY;
}

export function getProductUnavailableStatusCopy(
  status: MerchantPanelStatus,
): ProductPanelCopy {
  return PRODUCT_UNAVAILABLE_STATUS_COPY[status];
}

export function canMutateProductsForEstablishment(status: MerchantPanelStatus) {
  return status === "ACTIVE";
}

export function canEditProductStatus(status: ProductStatusValue) {
  return status !== "ARCHIVED";
}

export function canUploadProductPhotoForStatus(status: ProductStatusValue) {
  return status === "ACTIVE";
}

export function canPauseProductStatus(status: ProductStatusValue) {
  return status === "ACTIVE";
}

export function canActivateProductStatus(status: ProductStatusValue) {
  return status === "PAUSED" || status === "DRAFT";
}

export function canArchiveProductStatus(status: ProductStatusValue) {
  return status !== "ARCHIVED";
}

export function getProductActionLabel(
  action: ProductActionKind,
  pending: boolean,
) {
  return pending
    ? PRODUCT_ACTION_LABELS[action].pending
    : PRODUCT_ACTION_LABELS[action].idle;
}
