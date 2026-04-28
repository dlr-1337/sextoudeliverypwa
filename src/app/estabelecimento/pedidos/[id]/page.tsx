import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Container } from "@/components/ui/container";
import { FeedbackState } from "@/components/ui/feedback-state";
import { requireMerchantPageSession } from "@/modules/merchant/auth";
import {
  formatPublicOrderDateTime,
  formatPublicOrderMoney,
  getOrderStatusLabel,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
} from "@/modules/orders/display";
import { orderService } from "@/modules/orders/service";
import {
  MERCHANT_ORDER_TRANSITION_NOTE_MAX_LENGTH,
  getAllowedMerchantOrderTransitionTargets,
  type MerchantOrderDetailDto,
  type MerchantOrderDetailFailureCode,
  type MerchantOrderDetailItemDto,
  type MerchantOrderDetailStatusHistoryDto,
} from "@/modules/orders/service-core";

import { getMerchantOrderStatusCopy } from "../page-helpers";
import { OrderStatusActions } from "./order-status-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Detalhe do pedido do estabelecimento",
  description:
    "Detalhe operacional protegido para o estabelecimento acompanhar um pedido próprio.",
};

type MerchantOrderDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type MerchantOrderDetailState =
  | { status: "found"; order: MerchantOrderDetailDto }
  | { status: "not-found" }
  | { status: "unavailable" };

export default async function MerchantOrderDetailPage({
  params,
}: MerchantOrderDetailPageProps) {
  const auth = await requireMerchantPageSession();
  const { id } = await params;
  const state = await loadMerchantOrderDetail(auth.user.id, id);

  return (
    <main className="relative isolate min-h-dvh overflow-hidden py-6 sm:py-10">
      <MerchantOrderDetailBackdrop />
      <Container className="space-y-7">
        <MerchantOrderDetailHeader />
        {state.status === "found" ? (
          <MerchantOrderDetailContent order={state.order} orderId={id} />
        ) : state.status === "not-found" ? (
          <MerchantOrderNotFoundState />
        ) : (
          <MerchantOrderUnavailableState />
        )}
      </Container>
    </main>
  );
}

async function loadMerchantOrderDetail(
  ownerId: string,
  orderId: string,
): Promise<MerchantOrderDetailState> {
  try {
    const result = await orderService.getMerchantOrderDetailForOwner(
      ownerId,
      orderId,
    );

    if (result.ok) {
      return { status: "found", order: result.data };
    }

    if (isSafeMissingOrderCode(result.code)) {
      return { status: "not-found" };
    }

    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

function isSafeMissingOrderCode(code: MerchantOrderDetailFailureCode) {
  return (
    code === "INVALID_ORDER" ||
    code === "ORDER_NOT_FOUND" ||
    code === "ESTABLISHMENT_NOT_FOUND"
  );
}

function MerchantOrderDetailContent({
  order,
  orderId,
}: {
  order: MerchantOrderDetailDto;
  orderId: string;
}) {
  return (
    <>
      <MerchantOrderHero order={order} />
      <OrderStatusActions
        currentStatus={order.status}
        noteMaxLength={MERCHANT_ORDER_TRANSITION_NOTE_MAX_LENGTH}
        orderId={orderId}
        targets={[...getAllowedMerchantOrderTransitionTargets(order.status)]}
      />

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <CustomerPanel order={order} />
        <DeliveryPanel order={order} />
      </section>

      <ObservationPanel order={order} />
      <OrderItemsPanel items={order.items} />
      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <PaymentPanel order={order} />
        <TotalsPanel order={order} />
      </section>
      <StatusHistoryPanel history={order.statusHistory} />
    </>
  );
}

function MerchantOrderHero({ order }: { order: MerchantOrderDetailDto }) {
  const statusCopy = getMerchantOrderStatusCopy(order.status);
  const statusLabel = getOrderStatusLabel(order.status);

  return (
    <section className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-6 shadow-xl shadow-orange-950/10 backdrop-blur sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
        Detalhe operacional
      </p>
      <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_0.44fr] lg:items-end">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start gap-3">
            <h1 className="text-4xl font-black tracking-[-0.055em] text-orange-950 sm:text-5xl lg:text-6xl">
              Pedido {order.publicCode}
            </h1>
            <span
              className={[
                "rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em]",
                statusCopy.className,
              ].join(" ")}
            >
              {statusLabel}
            </span>
          </div>
          <p className="max-w-3xl text-sm leading-7 text-slate-700 sm:text-base">
            {statusCopy.description} Esta visão é protegida pela sessão da loja
            e mostra somente dados operacionais do pedido próprio.
          </p>
        </div>
        <div className="grid gap-3 rounded-3xl border border-orange-100 bg-orange-50/80 p-5 text-sm font-bold text-orange-950">
          <span>Código público: {order.publicCode}</span>
          <span>Status atual: {statusLabel}</span>
          <span>Atualizado em: {formatPublicOrderDateTime(order.timestamps.updatedAt)}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <TimestampGrid order={order} />
        <MerchantOrderDetailActions order={order} />
      </div>
    </section>
  );
}

function TimestampGrid({ order }: { order: MerchantOrderDetailDto }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <DetailMetric
        label="Recebido em"
        value={formatPublicOrderDateTime(order.timestamps.placedAt)}
      />
      <DetailMetric
        label="Aceito em"
        value={formatPublicOrderDateTime(order.timestamps.acceptedAt)}
      />
      <DetailMetric
        label="Criado em"
        value={formatPublicOrderDateTime(order.timestamps.createdAt)}
      />
      <DetailMetric
        label="Entregue em"
        value={formatPublicOrderDateTime(order.timestamps.deliveredAt)}
      />
      <DetailMetric
        label="Cancelado em"
        value={formatPublicOrderDateTime(order.timestamps.canceledAt)}
      />
      <DetailMetric
        label="Última atualização"
        value={formatPublicOrderDateTime(order.timestamps.updatedAt)}
      />
    </dl>
  );
}

function MerchantOrderDetailActions({
  order,
}: {
  order: MerchantOrderDetailDto;
}) {
  return (
    <div className="flex flex-wrap gap-3 lg:justify-end">
      <Link
        className="inline-flex rounded-full border border-orange-200 bg-white px-5 py-3 text-sm font-black text-orange-900 shadow-sm shadow-orange-950/5 transition hover:border-orange-300 hover:bg-orange-50 focus:outline-none focus:ring-4 focus:ring-orange-100"
        href="/estabelecimento/pedidos"
      >
        Voltar aos pedidos
      </Link>
      <Link
        className="inline-flex rounded-full bg-orange-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100"
        href={`/pedido/${encodeURIComponent(order.publicCode)}`}
      >
        Ver acompanhamento público
      </Link>
    </div>
  );
}

function CustomerPanel({ order }: { order: MerchantOrderDetailDto }) {
  return (
    <InfoPanel eyebrow="Cliente" title="Cliente e contato">
      <InfoGrid>
        <InfoItem label="Nome" value={formatOptionalText(order.customer.name)} />
        <InfoItem
          label="Telefone"
          value={formatOptionalText(order.customer.phone)}
        />
      </InfoGrid>
    </InfoPanel>
  );
}

function DeliveryPanel({ order }: { order: MerchantOrderDetailDto }) {
  return (
    <InfoPanel eyebrow="Entrega" title="Entrega e referência">
      <InfoGrid>
        <InfoItem label="Endereço" value={formatDeliveryAddress(order)} />
        <InfoItem label="Rua" value={formatOptionalText(order.delivery.street)} />
        <InfoItem
          label="Número"
          value={formatOptionalText(order.delivery.number)}
        />
        <InfoItem
          label="Complemento"
          value={formatOptionalText(order.delivery.complement)}
        />
        <InfoItem
          label="Bairro"
          value={formatOptionalText(order.delivery.neighborhood)}
        />
        <InfoItem
          label="Cidade/UF"
          value={formatCityState(order.delivery.city, order.delivery.state)}
        />
        <InfoItem
          label="CEP"
          value={formatOptionalText(order.delivery.postalCode)}
        />
        <InfoItem
          label="Referência"
          value={formatOptionalText(order.delivery.reference)}
        />
      </InfoGrid>
    </InfoPanel>
  );
}

function ObservationPanel({ order }: { order: MerchantOrderDetailDto }) {
  return (
    <InfoPanel eyebrow="Observações" title="Observações do pedido">
      <InfoGrid>
        <InfoItem
          label="Observação do cliente"
          value={formatOptionalText(order.observation.customer)}
        />
        <InfoItem
          label="Observação interna"
          value={formatOptionalText(order.observation.internal)}
        />
      </InfoGrid>
    </InfoPanel>
  );
}

function OrderItemsPanel({ items }: { items: MerchantOrderDetailItemDto[] }) {
  return (
    <section aria-labelledby="merchant-order-items-heading" className="space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
          Itens do pedido
        </p>
        <h2
          className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950"
          id="merchant-order-items-heading"
        >
          Snapshots dos itens
        </h2>
      </div>
      {items.length === 0 ? (
        <FeedbackState
          description="Os itens deste pedido não estão disponíveis agora. Use os totais e o status atual para triagem enquanto tenta novamente."
          title="Itens indisponíveis"
          tone="empty"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item, index) => (
            <article
              className="rounded-[1.75rem] border border-orange-100 bg-white/92 p-5 shadow-sm shadow-orange-950/5 backdrop-blur"
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
                <ItemRow
                  label="Valor unitário"
                  value={formatPublicOrderMoney(item.unitPrice)}
                />
                <ItemRow
                  label="Total do item"
                  value={formatPublicOrderMoney(item.total)}
                />
                <ItemRow
                  label="Observação do item"
                  value={formatOptionalText(item.notes)}
                />
                <ItemRow
                  label="Registrado em"
                  value={formatPublicOrderDateTime(item.createdAt)}
                />
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PaymentPanel({ order }: { order: MerchantOrderDetailDto }) {
  const paymentMethod = order.payment?.method ?? order.paymentMethod;
  const paymentStatus = order.payment?.status ?? order.paymentStatus;
  const paymentAmount = order.payment?.amount ?? order.totals.total;

  return (
    <InfoPanel eyebrow="Pagamento" title="Pagamento e conferência">
      <div className="space-y-4">
        <p className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-sm font-bold leading-6 text-amber-950">
          {order.payment
            ? "Pagamento registrado para conferência operacional."
            : "Pagamento sem lançamento dedicado; usando os dados resumidos do pedido."}
        </p>
        <InfoGrid>
          <InfoItem
            label="Forma de pagamento"
            value={getPaymentMethodLabel(paymentMethod)}
          />
          <InfoItem
            label="Status do pagamento"
            value={getPaymentStatusLabel(paymentStatus)}
          />
          <InfoItem
            label="Valor para pagamento"
            value={formatPublicOrderMoney(paymentAmount)}
          />
          <InfoItem
            label="Registrado em"
            value={formatPublicOrderDateTime(order.payment?.createdAt ?? null)}
          />
          <InfoItem
            label="Pago em"
            value={formatPublicOrderDateTime(order.payment?.paidAt ?? null)}
          />
          <InfoItem
            label="Falhou em"
            value={formatPublicOrderDateTime(order.payment?.failedAt ?? null)}
          />
        </InfoGrid>
      </div>
    </InfoPanel>
  );
}

function TotalsPanel({ order }: { order: MerchantOrderDetailDto }) {
  const totals = [
    { label: "Subtotal", value: order.totals.subtotal, highlight: false },
    { label: "Entrega", value: order.totals.deliveryFee, highlight: false },
    { label: "Desconto", value: order.totals.discount, highlight: false },
    { label: "Total", value: order.totals.total, highlight: true },
  ] as const;

  return (
    <InfoPanel eyebrow="Totais" title="Totais do pedido">
      <dl className="grid gap-3">
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
    </InfoPanel>
  );
}

function StatusHistoryPanel({
  history,
}: {
  history: MerchantOrderDetailStatusHistoryDto[];
}) {
  return (
    <section
      aria-labelledby="merchant-order-history-heading"
      className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-6 shadow-xl shadow-orange-950/10 backdrop-blur sm:p-7"
    >
      <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
        Histórico do status
      </p>
      <h2
        className="mt-3 text-2xl font-black tracking-[-0.04em] text-orange-950"
        id="merchant-order-history-heading"
      >
        Linha do tempo operacional
      </h2>
      {history.length === 0 ? (
        <p className="mt-4 text-sm leading-7 text-slate-700">
          Histórico sem eventos disponíveis. O status atual permanece visível no
          topo da página para operação segura.
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
                  {event.note?.trim() || "Sem observação para este evento."}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function MerchantOrderNotFoundState() {
  return (
    <FeedbackState
      action={<MerchantOrderFallbackActions />}
      description="Não encontramos um pedido desta loja para o endereço informado. Confira a caixa de entrada e abra o detalhe por lá."
      title="Pedido não encontrado"
      tone="empty"
    />
  );
}

function MerchantOrderUnavailableState() {
  return (
    <FeedbackState
      action={<MerchantOrderFallbackActions />}
      description="Não foi possível carregar o detalhe do pedido agora. Tente novamente em instantes ou volte para a caixa de entrada."
      title="Pedidos indisponíveis"
      tone="error"
    />
  );
}

function MerchantOrderFallbackActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Link
        className="inline-flex rounded-full bg-orange-600 px-4 py-2 text-sm font-black text-white shadow-sm shadow-orange-950/10 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100"
        href="/estabelecimento/pedidos"
      >
        Voltar aos pedidos
      </Link>
      <Link
        className="inline-flex rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-black text-orange-900 shadow-sm shadow-orange-950/5 transition hover:border-orange-300 hover:bg-orange-50 focus:outline-none focus:ring-4 focus:ring-orange-100"
        href="/estabelecimento"
      >
        Voltar ao painel
      </Link>
    </div>
  );
}

function MerchantOrderDetailHeader() {
  return (
    <nav
      aria-label="Navegação do detalhe do pedido do estabelecimento"
      className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-orange-200/70 bg-white/80 px-4 py-3 shadow-sm shadow-orange-950/5 backdrop-blur"
    >
      <Link
        className="flex items-center gap-3 focus:outline-none focus:ring-4 focus:ring-orange-100"
        href="/"
      >
        <span className="grid size-10 place-items-center rounded-full bg-orange-500 text-lg font-black text-white shadow-lg shadow-orange-500/30">
          S
        </span>
        <span className="text-sm font-black uppercase tracking-[0.24em] text-orange-950">
          Sextou Delivery
        </span>
      </Link>
      <Link
        className="rounded-full bg-orange-100 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-orange-800 transition hover:bg-orange-200 focus:outline-none focus:ring-4 focus:ring-orange-100"
        href="/estabelecimento/pedidos"
      >
        Pedidos da loja
      </Link>
    </nav>
  );
}

function InfoPanel({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-6 shadow-xl shadow-orange-950/10 backdrop-blur sm:p-7">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-orange-950">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function InfoGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>;
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
      <dt className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-black leading-6 text-slate-800">
        {value}
      </dd>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
      <dt className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-black text-slate-800">
        {value}
      </dd>
    </div>
  );
}

function ItemRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatOptionalText(value: string | null) {
  const text = value?.trim();

  return text ? text : "Não informado";
}

function formatDeliveryAddress(order: MerchantOrderDetailDto) {
  const savedAddress = order.delivery.address?.trim();

  if (savedAddress) {
    return savedAddress;
  }

  const complement = order.delivery.complement
    ? ` - ${order.delivery.complement}`
    : "";
  const cityState = formatCityState(order.delivery.city, order.delivery.state);

  return `${order.delivery.street}, ${order.delivery.number}${complement} - ${order.delivery.neighborhood}, ${cityState}, ${order.delivery.postalCode}`;
}

function formatCityState(city: string, state: string) {
  const cityText = city.trim();
  const stateText = state.trim();

  if (!cityText && !stateText) {
    return "Não informado";
  }

  if (!cityText) {
    return stateText;
  }

  if (!stateText) {
    return cityText;
  }

  return `${cityText}/${stateText}`;
}

function MerchantOrderDetailBackdrop() {
  return (
    <>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.24),transparent_34%),linear-gradient(135deg,rgba(255,247,237,0.96),rgba(255,255,255,0.9)_48%,rgba(254,243,199,0.74))]" />
      <div className="absolute right-[-6rem] top-24 -z-10 h-72 w-72 rounded-full bg-orange-300/25 blur-3xl" />
      <div className="absolute bottom-[-8rem] left-[-4rem] -z-10 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl" />
    </>
  );
}
