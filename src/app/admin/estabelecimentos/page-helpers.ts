import type { EstablishmentStatusValue } from "@/modules/establishments/service-core";

export const ESTABLISHMENT_STATUS_VALUES = [
  "PENDING",
  "ACTIVE",
  "BLOCKED",
  "INACTIVE",
] as const satisfies readonly EstablishmentStatusValue[];

export type AdminEstablishmentStatusFilter = EstablishmentStatusValue;

export type ParsedStatusFilter =
  | { valid: true; status?: AdminEstablishmentStatusFilter }
  | { valid: false; status?: undefined };

export const ESTABLISHMENT_STATUS_COPY = {
  PENDING: {
    label: "Pendente",
    pluralLabel: "Pendentes",
    description: "Aguardam aprovação administrativa.",
    className: "border-amber-200 bg-amber-100 text-amber-950",
  },
  ACTIVE: {
    label: "Ativo",
    pluralLabel: "Ativos",
    description: "Liberados para operar.",
    className: "border-lime-200 bg-lime-100 text-lime-950",
  },
  BLOCKED: {
    label: "Bloqueado",
    pluralLabel: "Bloqueados",
    description: "Pausados pela administração.",
    className: "border-rose-200 bg-rose-100 text-rose-950",
  },
  INACTIVE: {
    label: "Inativo",
    pluralLabel: "Inativos",
    description: "Retirados da operação.",
    className: "border-slate-200 bg-slate-100 text-slate-700",
  },
} as const satisfies Record<
  EstablishmentStatusValue,
  {
    label: string;
    pluralLabel: string;
    description: string;
    className: string;
  }
>;

export function parseAdminEstablishmentStatusFilter(
  value: string | string[] | undefined,
): ParsedStatusFilter {
  if (value === undefined) {
    return { valid: true };
  }

  if (Array.isArray(value)) {
    return { valid: false };
  }

  if (isEstablishmentStatus(value)) {
    return { valid: true, status: value };
  }

  return { valid: false };
}

export function getEstablishmentListTitle(
  status?: EstablishmentStatusValue,
) {
  return status
    ? `Estabelecimentos ${ESTABLISHMENT_STATUS_COPY[status].pluralLabel.toLowerCase()}`
    : "Todos os estabelecimentos";
}

export function getEstablishmentEmptyState(status?: EstablishmentStatusValue) {
  if (!status) {
    return {
      title: "Nenhum estabelecimento encontrado",
      description:
        "Quando comerciantes se cadastrarem, suas lojas aparecerão aqui para consulta e operação administrativa.",
    };
  }

  return {
    title: `Nenhum estabelecimento ${ESTABLISHMENT_STATUS_COPY[
      status
    ].label.toLowerCase()} encontrado`,
    description:
      status === "PENDING"
        ? "Não há lojas aguardando aprovação no momento. Novos cadastros de comerciantes entram nesta fila."
        : `Não há lojas com status ${ESTABLISHMENT_STATUS_COPY[
            status
          ].label.toLowerCase()} no momento.`,
  };
}

function isEstablishmentStatus(
  value: string,
): value is EstablishmentStatusValue {
  return ESTABLISHMENT_STATUS_VALUES.some((status) => status === value);
}
