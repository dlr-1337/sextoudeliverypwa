import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui/container";
import { FeedbackState } from "@/components/ui/feedback-state";
import {
  formatPublicOrderDateTime,
  formatPublicOrderMoney,
  getManualCashPaymentDescription,
  getOrderStatusLabel,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
} from "@/modules/orders/display";
import { orderService } from "@/modules/orders/service";
import type {
  PublicOrderDto,
  PublicOrderItemDto,
  PublicOrderStatusHistoryDto,
} from "@/modules/orders/service-core";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acompanhar pedido",
  description:
    "Acompanhe o status público do pedido pelo código recebido no checkout.",
};

type PublicOrderPageProps = {
  params: Promise<{
    publicCode: string;
  }>;
};

type PublicOrderLoadState =
  | { status: "found"; order: PublicOrderDto }
  | { status: "not-found" }
  | { status: "unavailable" };

export default async function PublicOrderTrackingPage({
  params,
}: PublicOrderPageProps) {
  const { publicCode } = await params;
  const state = await loadPublicOrder(publicCode);

  return (
    <main className="relative isolate min-h-dvh overflow-hidden py-6 sm:py-10">
      <PublicOrderBackdrop />
      <Container className="space-y-7">
        <PublicOrderHeader />
        {state.status === "found" ? (
          <PublicOrderDetails order={state.order} />
        ) : state.status === "not-found" ? (
          <PublicOrderNotFoundState />
        ) : (
          <PublicOrderUnavailableState />
        )}
      </Container>
    </main>
  );
}

async function loadPublicOrder(publicCode: string): Promise<PublicOrderLoadState> {
  try {
    const order = await orderService.getPublicOrderByCode(publicCode);

    return order ? { status: "found", order } : { status: "not-found" };
  } catch {
    return { status: "unavailable" };
  }
}

function PublicOrderDetails({ order }: { order: PublicOrderDto }) {
  const statusLabel = getOrderStatusLabel(order.status);
  const updatedAtLabel = formatPublicOrderDateTime(order.updatedAt);

  return (
    <>
      <section className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-6 shadow-xl shadow-orange-950/10 backdrop-blur sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
          Acompanhamento público
        </p>
        <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_0.5fr] lg:items-end">
          <div className="space-y-4">
            <h1 className="text-4xl font-black tracking-[-0.055em] text-orange-950 sm:text-5xl lg:text-6xl">
              Pedido {order.publicCode}
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-700 sm:text-base">
              Status do pedido: <strong>{statusLabel}</strong>. As próximas
              atualizações públicas aparecerão neste endereço sem exigir login.
            </p>
          </div>
          <div className="grid gap-3 rounded-3xl border border-orange-100 bg-orange-50/80 p-5 text-sm font-bold text-orange-950">
            <span>Código do pedido: {order.publicCode}</span>
            <span>Status atual: {statusLabel}</span>
            <span>Atualizado em: {updatedAtLabel}</span>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="inline-flex rounded-full bg-orange-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100"
            href={`/lojas/${order.establishment.slug}`}
          >
            Ver loja {order.establishment.name}
          </Link>
          <Link
            className="inline-flex rounded-full border border-orange-200 bg-white px-5 py-3 text-sm font-black text-orange-900 shadow-sm shadow-orange-950/5 transition hover:border-orange-300 hover:bg-orange-50 focus:outline-none focus:ring-4 focus:ring-orange-100"
            href="/lojas"
          >
            Voltar às lojas
          </Link>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <PaymentSummary order={order} />
        <TotalsSummary order={order} />
      </section>

      <OrderItems items={order.items} />
      <OrderTimeline history={order.statusHistory} />
    </>
  );
}

function PaymentSummary({ order }: { order: PublicOrderDto }) {
  const paymentMethod = order.payment?.method ?? order.paymentMethod;
  const paymentStatus = order.payment?.status ?? order.paymentStatus;
  const paymentAmount = order.payment?.amount ?? order.total;

  return (
    <section
      aria-labelledby="public-order-payment-heading"
      className="rounded-[2rem] border border-amber-200/75 bg-white/90 p-6 shadow-xl shadow-orange-950/10 backdrop-blur sm:p-7"
    >
      <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-700">
        Pagamento manual
      </p>
      <h2
        className="mt-3 text-2xl font-black tracking-[-0.04em] text-orange-950"
        id="public-order-payment-heading"
      >
        Pagamento em dinheiro
      </h2>
      <p className="mt-3 text-sm leading-7 text-slate-700">
        {getManualCashPaymentDescription(paymentMethod, paymentStatus)}
      </p>
      <dl className="mt-5 grid gap-3 text-sm font-bold text-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
          <dt>Forma de pagamento</dt>
          <dd>{getPaymentMethodLabel(paymentMethod)}</dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
          <dt>Status do pagamento</dt>
          <dd>{getPaymentStatusLabel(paymentStatus)}</dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
          <dt>Valor para pagamento</dt>
          <dd>{formatPublicOrderMoney(paymentAmount)}</dd>
        </div>
      </dl>
    </section>
  );
}

function TotalsSummary({ order }: { order: PublicOrderDto }) {
  const totals = [
    { label: "Subtotal", value: order.subtotal, highlight: false },
    { label: "Entrega", value: order.deliveryFee, highlight: false },
    { label: "Desconto", value: order.discount, highlight: false },
    { label: "Total", value: order.total, highlight: true },
  ] as const;

  return (
    <section
      aria-labelledby="public-order-totals-heading"
      className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-6 shadow-xl shadow-orange-950/10 backdrop-blur sm:p-7"
    >
      <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
        Totais
      </p>
      <h2
        className="mt-3 text-2xl font-black tracking-[-0.04em] text-orange-950"
        id="public-order-totals-heading"
      >
        Valores do pedido
      </h2>
      <dl className="mt-5 grid gap-3">
        {totals.map((total) => (
          <div
            className={[
              "flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-4 text-sm font-bold",
              total.highlight
                ? "border-orange-200 bg-orange-50 text-orange-950"
                : "border-slate-100 bg-slate-50/80 text-slate-700",
            ].join(" ")}
            key={total.label}
          >
            <dt>{total.label}</dt>
            <dd>{formatPublicOrderMoney(total.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function OrderItems({ items }: { items: PublicOrderItemDto[] }) {
  return (
    <section aria-labelledby="public-order-items-heading" className="space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
          Itens do pedido
        </p>
        <h2
          className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950"
          id="public-order-items-heading"
        >
          Resumo dos itens
        </h2>
      </div>
      {items.length === 0 ? (
        <FeedbackState
          description="Os itens deste pedido não estão disponíveis para acompanhamento público agora. O status e os totais continuam visíveis."
          title="Itens indisponíveis"
          tone="empty"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item, index) => (
            <article
              className="rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5"
              key={`${item.productName}-${item.quantity}-${index}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black tracking-[-0.03em] text-orange-950">
                    {item.productName}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Quantidade: {item.quantity}
                  </p>
                </div>
                <span className="rounded-full bg-orange-100 px-4 py-2 text-sm font-black text-orange-800">
                  {formatPublicOrderMoney(item.total)}
                </span>
              </div>
              <dl className="mt-4 grid gap-2 text-sm font-semibold text-slate-700">
                <div className="flex justify-between gap-2">
                  <dt>Valor unitário</dt>
                  <dd>{formatPublicOrderMoney(item.unitPrice)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Total do item</dt>
                  <dd>{formatPublicOrderMoney(item.total)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function OrderTimeline({
  history,
}: {
  history: PublicOrderStatusHistoryDto[];
}) {
  return (
    <section
      aria-labelledby="public-order-history-heading"
      className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-6 shadow-xl shadow-orange-950/10 backdrop-blur sm:p-7"
    >
      <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
        Histórico do pedido
      </p>
      <h2
        className="mt-3 text-2xl font-black tracking-[-0.04em] text-orange-950"
        id="public-order-history-heading"
      >
        Linha do tempo pública
      </h2>
      {history.length === 0 ? (
        <p className="mt-4 text-sm leading-7 text-slate-700">
          Histórico público ainda não disponível. O status atual permanece no
          topo da página e novas atualizações aparecerão aqui.
        </p>
      ) : (
        <ol className="mt-6 space-y-4">
          {history.map((event, index) => (
            <li
              className="grid gap-3 rounded-3xl border border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-[auto_1fr]"
              key={`${event.status}-${index}`}
            >
              <span className="grid size-10 place-items-center rounded-full bg-orange-600 text-sm font-black text-white">
                {index + 1}
              </span>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-black text-orange-950">
                    {getOrderStatusLabel(event.status)}
                  </h3>
                  <time className="text-sm font-bold text-slate-500">
                    {formatPublicOrderDateTime(event.createdAt)}
                  </time>
                </div>
                <p className="mt-2 text-sm leading-7 text-slate-700">
                  {event.note?.trim() || "Sem observação pública para este evento."}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function PublicOrderNotFoundState() {
  return (
    <FeedbackState
      action={<PublicOrderFallbackActions />}
      description="Não encontramos um pedido público para este código. Confira o link recebido no checkout ou volte às lojas para montar um novo pedido."
      title="Pedido não encontrado"
      tone="empty"
    />
  );
}

function PublicOrderUnavailableState() {
  return (
    <FeedbackState
      action={<PublicOrderFallbackActions />}
      description="O acompanhamento está indisponível no momento. Tente novamente em instantes; seus dados privados continuam protegidos."
      title="Acompanhamento indisponível"
      tone="error"
    />
  );
}

function PublicOrderFallbackActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Link
        className="inline-flex rounded-full bg-orange-600 px-4 py-2 text-sm font-black text-white shadow-sm shadow-orange-950/10 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100"
        href="/lojas"
      >
        Ver lojas
      </Link>
      <Link
        className="inline-flex rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-black text-orange-900 shadow-sm shadow-orange-950/5 transition hover:border-orange-300 hover:bg-orange-50 focus:outline-none focus:ring-4 focus:ring-orange-100"
        href="/checkout"
      >
        Voltar ao checkout
      </Link>
    </div>
  );
}

function PublicOrderHeader() {
  return (
    <nav
      aria-label="Navegação do acompanhamento público"
      className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-orange-200/70 bg-white/80 px-4 py-3 shadow-sm shadow-orange-950/5 backdrop-blur"
    >
      <Link className="flex items-center gap-3 focus:outline-none focus:ring-4 focus:ring-orange-100" href="/">
        <span className="grid size-10 place-items-center rounded-full bg-orange-500 text-lg font-black text-white shadow-lg shadow-orange-500/30">
          S
        </span>
        <span className="text-sm font-black uppercase tracking-[0.24em] text-orange-950">
          Sextou Delivery
        </span>
      </Link>
      <Link
        className="rounded-full bg-lime-100 px-4 py-2 text-xs font-bold text-lime-800 transition hover:bg-lime-200 focus:outline-none focus:ring-4 focus:ring-lime-100"
        href="/lojas"
      >
        Lojas ativas
      </Link>
    </nav>
  );
}

function PublicOrderBackdrop() {
  return (
    <>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.24),transparent_34%),linear-gradient(135deg,rgba(255,247,237,0.96),rgba(255,255,255,0.9)_48%,rgba(254,243,199,0.74))]" />
      <div className="absolute right-8 top-24 -z-10 h-56 w-56 rounded-full bg-orange-300/20 blur-3xl" />
      <div className="absolute bottom-[-8rem] left-[-4rem] -z-10 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl" />
    </>
  );
}
