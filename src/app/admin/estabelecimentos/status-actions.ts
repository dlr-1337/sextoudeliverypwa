import type { EstablishmentStatusValue } from "@/modules/establishments/service-core";

export type EstablishmentStatusActionId =
  | "approve"
  | "block"
  | "reactivate"
  | "inactivate";

export type EstablishmentStatusActionDefinition = {
  id: EstablishmentStatusActionId;
  label: string;
  pendingLabel: string;
  successHint: string;
  description: string;
  className: string;
};

const ACTION_DEFINITIONS = {
  approve: {
    id: "approve",
    label: "Aprovar",
    pendingLabel: "Aprovando...",
    successHint: "O estabelecimento passa a operar como ativo.",
    description: "Libera a loja pendente para aparecer nas próximas etapas operacionais.",
    className:
      "border-lime-200 bg-lime-600 text-white shadow-lime-900/15 hover:bg-lime-700 focus:ring-lime-100",
  },
  block: {
    id: "block",
    label: "Bloquear",
    pendingLabel: "Bloqueando...",
    successHint: "O estabelecimento fica bloqueado até reativação administrativa.",
    description: "Pausa uma loja pendente ou ativa sem remover seu histórico.",
    className:
      "border-rose-200 bg-rose-600 text-white shadow-rose-900/15 hover:bg-rose-700 focus:ring-rose-100",
  },
  reactivate: {
    id: "reactivate",
    label: "Reativar",
    pendingLabel: "Reativando...",
    successHint: "O estabelecimento volta para o estado ativo.",
    description: "Retorna uma loja bloqueada ou inativa para operação ativa.",
    className:
      "border-orange-200 bg-orange-600 text-white shadow-orange-900/15 hover:bg-orange-700 focus:ring-orange-100",
  },
  inactivate: {
    id: "inactivate",
    label: "Inativar",
    pendingLabel: "Inativando...",
    successHint: "O estabelecimento sai da operação ativa.",
    description: "Retira uma loja pendente, ativa ou bloqueada da operação.",
    className:
      "border-slate-200 bg-slate-800 text-white shadow-slate-900/15 hover:bg-slate-900 focus:ring-slate-100",
  },
} as const satisfies Record<
  EstablishmentStatusActionId,
  EstablishmentStatusActionDefinition
>;

const ACTIONS_BY_STATUS = {
  PENDING: ["approve", "block", "inactivate"],
  ACTIVE: ["block", "inactivate"],
  BLOCKED: ["reactivate", "inactivate"],
  INACTIVE: ["reactivate"],
} as const satisfies Record<
  EstablishmentStatusValue,
  readonly EstablishmentStatusActionId[]
>;

export function getEstablishmentStatusActions(
  status: EstablishmentStatusValue,
): EstablishmentStatusActionDefinition[] {
  return ACTIONS_BY_STATUS[status].map((actionId) => ACTION_DEFINITIONS[actionId]);
}

export function canRunEstablishmentStatusAction(
  status: EstablishmentStatusValue,
  actionId: EstablishmentStatusActionId,
) {
  const validActions: readonly EstablishmentStatusActionId[] =
    ACTIONS_BY_STATUS[status];

  return validActions.includes(actionId);
}
