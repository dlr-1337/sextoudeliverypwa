"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  approveEstablishmentAction,
  blockEstablishmentAction,
  inactivateEstablishmentAction,
  reactivateEstablishmentAction,
} from "@/modules/admin/actions";
import { ADMIN_ACTION_IDLE_STATE } from "@/modules/admin/action-state";
import type {
  AdminActionHandler,
  AdminActionState,
} from "@/modules/admin/action-state";
import type { EstablishmentStatusValue } from "@/modules/establishments/service-core";

import {
  getEstablishmentStatusActions,
  type EstablishmentStatusActionDefinition,
  type EstablishmentStatusActionId,
} from "./status-actions";

const ACTION_HANDLERS = {
  approve: approveEstablishmentAction,
  block: blockEstablishmentAction,
  reactivate: reactivateEstablishmentAction,
  inactivate: inactivateEstablishmentAction,
} as const satisfies Record<EstablishmentStatusActionId, AdminActionHandler>;

type EstablishmentStatusFormsProps = {
  establishmentId: string;
  status: EstablishmentStatusValue;
  compact?: boolean;
};

export function EstablishmentStatusForms({
  compact = false,
  establishmentId,
  status,
}: EstablishmentStatusFormsProps) {
  const actions = getEstablishmentStatusActions(status);

  if (actions.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">
        Nenhuma ação administrativa disponível para o status atual.
      </p>
    );
  }

  return (
    <section
      aria-label="Ações de status do estabelecimento"
      className={compact ? "space-y-3" : "rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5"}
    >
      {!compact ? (
        <div className="mb-4">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
            Operação
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950">
            Alterar status
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Apenas transições permitidas pelo serviço aparecem aqui. Falhas de
            autorização, validação ou transição voltam como mensagens seguras.
          </p>
        </div>
      ) : null}

      <div className={compact ? "flex flex-wrap gap-2" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-4"}>
        {actions.map((definition) => (
          <StatusActionForm
            definition={definition}
            establishmentId={establishmentId}
            key={definition.id}
            compact={compact}
          />
        ))}
      </div>
    </section>
  );
}

function StatusActionForm({
  compact,
  definition,
  establishmentId,
}: {
  compact: boolean;
  definition: EstablishmentStatusActionDefinition;
  establishmentId: string;
}) {
  const [state, formAction] = useActionState(
    ACTION_HANDLERS[definition.id],
    ADMIN_ACTION_IDLE_STATE,
  );

  return (
    <form
      action={formAction}
      className={
        compact
          ? "min-w-32"
          : "rounded-3xl border border-orange-100 bg-orange-50/50 p-4"
      }
    >
      <input name="id" type="hidden" value={establishmentId} />
      {!compact ? (
        <p className="mb-3 text-xs font-semibold leading-5 text-slate-600">
          {definition.description}
        </p>
      ) : null}
      <SubmitButton definition={definition} compact={compact} />
      <FieldError errors={state.fieldErrors?.id} />
      <ActionFeedback state={state} compact={compact} />
    </form>
  );
}

function SubmitButton({
  compact,
  definition,
}: {
  compact: boolean;
  definition: EstablishmentStatusActionDefinition;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={[
        "w-full rounded-2xl border px-4 py-3 text-xs font-black uppercase tracking-[0.16em] shadow-lg transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-65",
        compact ? "px-3 py-2" : "",
        definition.className,
      ].join(" ")}
      disabled={pending}
      type="submit"
    >
      {pending ? definition.pendingLabel : definition.label}
    </button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="mt-2 text-xs font-bold text-rose-700">{errors[0]}</p>;
}

function ActionFeedback({
  compact,
  state,
}: {
  compact: boolean;
  state: AdminActionState;
}) {
  if (state.status === "idle") {
    return null;
  }

  const isError = state.status === "error";

  return (
    <div
      aria-live={isError ? "assertive" : "polite"}
      className={[
        "mt-3 rounded-2xl border px-3 py-2 text-xs font-semibold leading-5",
        compact ? "max-w-xs" : "",
        isError
          ? "border-rose-200 bg-rose-50 text-rose-950"
          : "border-lime-200 bg-lime-50 text-lime-950",
      ].join(" ")}
      role={isError ? "alert" : "status"}
    >
      {state.message ??
        (isError
          ? "Não foi possível concluir a operação."
          : "Operação concluída com sucesso.")}
      {!isError ? (
        <span className="mt-1 block opacity-80">{state.establishmentId ? "Atualize a lista se o status ainda não refletiu." : null}</span>
      ) : null}
      {state.formErrors?.length ? (
        <ul className="mt-2 list-disc pl-4">
          {state.formErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
