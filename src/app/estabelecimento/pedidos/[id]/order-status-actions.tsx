"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import {
  MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
  type MerchantOrderTransitionActionState,
} from "@/modules/orders/action-state";
import { transitionMerchantOrderStatusAction } from "@/modules/orders/actions";
import { getOrderStatusLabel } from "@/modules/orders/display";
import type { OrderStatusValue } from "@/modules/orders/service-core";

type OrderStatusActionsProps = {
  currentStatus: OrderStatusValue;
  noteMaxLength: number;
  orderId: string;
  targets: OrderStatusValue[];
};

type StatusActionCopy = {
  label: string;
  pendingLabel: string;
  tone: "primary" | "danger";
};

const STATUS_ACTION_COPY: Partial<Record<OrderStatusValue, StatusActionCopy>> = {
  ACCEPTED: {
    label: "Aceitar pedido",
    pendingLabel: "Aceitando pedido",
    tone: "primary",
  },
  PREPARING: {
    label: "Iniciar preparo",
    pendingLabel: "Iniciando preparo",
    tone: "primary",
  },
  OUT_FOR_DELIVERY: {
    label: "Saiu para entrega",
    pendingLabel: "Marcando saída para entrega",
    tone: "primary",
  },
  DELIVERED: {
    label: "Marcar como entregue",
    pendingLabel: "Marcando como entregue",
    tone: "primary",
  },
  REJECTED: {
    label: "Recusar pedido",
    pendingLabel: "Recusando pedido",
    tone: "danger",
  },
  CANCELED: {
    label: "Cancelar pedido",
    pendingLabel: "Cancelando pedido",
    tone: "danger",
  },
};

const GENERIC_ACTION_FAILURE_MESSAGE =
  "Não foi possível atualizar o pedido agora. Tente novamente.";
const TERMINAL_STATUS_MESSAGE =
  "Este pedido não possui ações de status disponíveis nesta etapa.";

export function OrderStatusActions({
  currentStatus,
  noteMaxLength,
  orderId,
  targets,
}: OrderStatusActionsProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    transitionMerchantOrderStatusAction,
    MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE,
  );
  const handledSuccessKeyRef = useRef<string | null>(null);
  const fieldErrors = state.status === "error" ? state.fieldErrors ?? {} : {};
  const noteErrorId = "merchant-order-status-note-error";
  const statusErrorId = "merchant-order-status-target-error";
  const noteErrors = fieldErrors.note;
  const targetErrors = fieldErrors.targetStatus;
  const describedBy = [noteErrors?.length ? noteErrorId : null, "merchant-order-status-note-hint"]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (state.status !== "success") {
      return;
    }

    const successKey = `${state.currentStatus}:${state.changedAt}`;

    if (handledSuccessKeyRef.current === successKey) {
      return;
    }

    handledSuccessKeyRef.current = successKey;
    router.refresh();
  }, [router, state]);

  return (
    <section
      aria-labelledby="merchant-order-status-actions-heading"
      className="rounded-[2rem] border border-orange-200/75 bg-white/92 p-6 shadow-xl shadow-orange-950/10 backdrop-blur sm:p-7"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_0.7fr] lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
            Operação do pedido
          </p>
          <h2
            className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950"
            id="merchant-order-status-actions-heading"
          >
            Atualizar status
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Escolha uma ação permitida para o status atual. A autorização e a
            sequência final continuam validadas no servidor.
          </p>
        </div>
        <div className="rounded-3xl border border-orange-100 bg-orange-50/75 p-4 text-sm font-bold leading-6 text-orange-950">
          Status atual: {getOrderStatusLabel(currentStatus)}
        </div>
      </div>

      <OrderStatusActionFeedback state={state} />

      {targets.length === 0 ? (
        <p
          aria-live="polite"
          className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-700"
          role="status"
        >
          {TERMINAL_STATUS_MESSAGE}
        </p>
      ) : (
        <form action={formAction} className="mt-5 grid gap-4">
          <input name="orderId" type="hidden" value={orderId} />
          <input name="expectedStatus" type="hidden" value={currentStatus} />

          <label
            className="grid gap-2 text-sm font-bold text-slate-800"
            htmlFor="merchant-order-status-note"
          >
            Observação opcional
            <textarea
              aria-describedby={describedBy}
              aria-invalid={noteErrors?.length ? true : undefined}
              className="min-h-28 rounded-2xl border border-orange-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-65"
              defaultValue={state.status === "error" ? state.values?.note ?? "" : ""}
              id="merchant-order-status-note"
              maxLength={noteMaxLength}
              name="note"
              placeholder="Ex.: Cliente avisado pelo WhatsApp."
            />
            <span
              className="text-xs font-semibold text-slate-500"
              id="merchant-order-status-note-hint"
            >
              Até {noteMaxLength} caracteres; deixe em branco se não houver
              observação pública para o histórico.
            </span>
            <OrderStatusFieldError errors={noteErrors} id={noteErrorId} />
          </label>

          <div className="flex flex-wrap gap-3" role="group" aria-label="Ações de status disponíveis">
            {targets.map((target) => (
              <StatusSubmitButton
                key={target}
                target={target}
                targetErrorId={targetErrors?.length ? statusErrorId : undefined}
              />
            ))}
          </div>
          <OrderStatusFieldError errors={targetErrors} id={statusErrorId} />
        </form>
      )}
    </section>
  );
}

function StatusSubmitButton({
  target,
  targetErrorId,
}: {
  target: OrderStatusValue;
  targetErrorId?: string;
}) {
  const { data, pending } = useFormStatus();
  const copy = getStatusActionCopy(target);
  const isCurrentSubmit = pending && data?.get("targetStatus") === target;

  return (
    <button
      aria-describedby={targetErrorId}
      className={[
        "min-h-11 rounded-2xl px-5 py-3 text-sm font-black uppercase tracking-[0.16em] shadow-sm transition-transform transition-colors focus:outline-none focus:ring-4 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-65 disabled:active:scale-100",
        copy.tone === "danger"
          ? "border border-rose-200 bg-white text-rose-800 shadow-rose-950/5 hover:bg-rose-50 focus:ring-rose-100"
          : "bg-orange-600 text-white shadow-orange-600/20 hover:bg-orange-700 focus:ring-orange-100",
      ].join(" ")}
      disabled={pending}
      name="targetStatus"
      type="submit"
      value={target}
    >
      {isCurrentSubmit ? copy.pendingLabel : copy.label}
    </button>
  );
}

function OrderStatusActionFeedback({
  state,
}: {
  state: MerchantOrderTransitionActionState;
}) {
  if (state.status === "idle") {
    return null;
  }

  const isError = state.status === "error";
  const message = state.message || GENERIC_ACTION_FAILURE_MESSAGE;

  return (
    <div
      aria-live={isError ? "assertive" : "polite"}
      className={[
        "mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold leading-6",
        isError
          ? "border-rose-200 bg-rose-50 text-rose-950"
          : "border-lime-200 bg-lime-50 text-lime-950",
      ].join(" ")}
      role={isError ? "alert" : "status"}
    >
      <p>{message}</p>
      {state.status === "success" ? (
        <p className="mt-1">
          Novo status: {getOrderStatusLabel(state.currentStatus)}. A página será
          atualizada para refletir o histórico público.
        </p>
      ) : null}
      {state.status === "error" && state.formErrors?.length ? (
        <ul className="mt-2 list-disc pl-5">
          {state.formErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function OrderStatusFieldError({
  errors,
  id,
}: {
  errors?: string[];
  id: string;
}) {
  if (!errors?.length) {
    return null;
  }

  return (
    <span className="text-xs font-bold text-rose-700" id={id}>
      {errors[0]}
    </span>
  );
}

function getStatusActionCopy(target: OrderStatusValue): StatusActionCopy {
  return (
    STATUS_ACTION_COPY[target] ?? {
      label: "Atualizar status",
      pendingLabel: "Atualizando status",
      tone: "primary",
    }
  );
}
