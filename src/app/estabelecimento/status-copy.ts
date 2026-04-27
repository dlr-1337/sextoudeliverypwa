import type { MerchantEstablishmentStatus } from "@/modules/merchant/service-core";

export type MerchantPanelStatus = MerchantEstablishmentStatus | "missing";
export type MerchantPanelNoticeTone = "loading" | "error" | "empty";
export type MerchantStatusBadgeTone = "success" | "warning" | "danger" | "neutral";

export type MerchantStatusBadgeCopy = {
  label: string;
  tone: MerchantStatusBadgeTone;
};

export type MerchantPanelStatusCopy = {
  badge: MerchantStatusBadgeCopy;
  canMutate: boolean;
  description: string;
  emptyMessage: string;
  formUnavailableMessage: string;
  noticeTone: MerchantPanelNoticeTone;
  title: string;
};

const STATUS_BADGE_COPY = {
  PENDING: { label: "Pendente", tone: "warning" },
  ACTIVE: { label: "Ativo", tone: "success" },
  BLOCKED: { label: "Bloqueado", tone: "danger" },
  INACTIVE: { label: "Inativo", tone: "neutral" },
  missing: { label: "Não encontrada", tone: "danger" },
} as const satisfies Record<MerchantPanelStatus, MerchantStatusBadgeCopy>;

const FORM_UNAVAILABLE_MESSAGE =
  "Este perfil não pode ser editado no status atual do estabelecimento.";

const STATUS_COPY = {
  PENDING: {
    badge: STATUS_BADGE_COPY.PENDING,
    canMutate: false,
    description:
      "Seu estabelecimento está aguardando aprovação da administração antes de vender ou editar dados operacionais.",
    emptyMessage:
      "A loja foi criada, mas ainda não há ações disponíveis até a aprovação.",
    formUnavailableMessage: FORM_UNAVAILABLE_MESSAGE,
    noticeTone: "loading",
    title: "Aprovação pendente",
  },
  ACTIVE: {
    badge: STATUS_BADGE_COPY.ACTIVE,
    canMutate: true,
    description:
      "Use os formulários abaixo para atualizar dados operacionais e o logo. Identificador, dono, status e slug continuam protegidos no servidor.",
    emptyMessage:
      "Nenhuma ação pendente: mantenha seus dados e logo atualizados para os clientes.",
    formUnavailableMessage: "",
    noticeTone: "empty",
    title: "Loja ativa",
  },
  BLOCKED: {
    badge: STATUS_BADGE_COPY.BLOCKED,
    canMutate: false,
    description:
      "Seu estabelecimento está bloqueado. Fale com o suporte antes de continuar.",
    emptyMessage:
      "As edições estão bloqueadas enquanto a operação não for liberada.",
    formUnavailableMessage: FORM_UNAVAILABLE_MESSAGE,
    noticeTone: "error",
    title: "Loja bloqueada",
  },
  INACTIVE: {
    badge: STATUS_BADGE_COPY.INACTIVE,
    canMutate: false,
    description:
      "Seu estabelecimento está inativo. Reative a operação com o suporte antes de editar dados.",
    emptyMessage:
      "Não há formulários disponíveis para estabelecimentos inativos.",
    formUnavailableMessage: FORM_UNAVAILABLE_MESSAGE,
    noticeTone: "error",
    title: "Loja inativa",
  },
  missing: {
    badge: STATUS_BADGE_COPY.missing,
    canMutate: false,
    description:
      "Não encontramos uma loja para esta conta. Tente cadastrar novamente ou fale com o suporte.",
    emptyMessage: "Nenhum estabelecimento foi encontrado para esta sessão merchant.",
    formUnavailableMessage: FORM_UNAVAILABLE_MESSAGE,
    noticeTone: "error",
    title: "Loja não encontrada",
  },
} as const satisfies Record<MerchantPanelStatus, MerchantPanelStatusCopy>;

export function getMerchantStatusBadgeCopy(
  status: MerchantPanelStatus,
): MerchantStatusBadgeCopy {
  return STATUS_BADGE_COPY[status];
}

export function getMerchantPanelStatusCopy(
  status: MerchantPanelStatus,
): MerchantPanelStatusCopy {
  return STATUS_COPY[status];
}

export function canMutateMerchantProfile(status: MerchantPanelStatus) {
  return status === "ACTIVE";
}

export function shouldRenderMerchantMutationForms(
  status: MerchantPanelStatus | null | undefined,
) {
  return status === "ACTIVE";
}
