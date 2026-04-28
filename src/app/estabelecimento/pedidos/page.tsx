import type { Metadata } from "next";
import Link from "next/link";

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
  MERCHANT_ORDER_LIST_LIMIT,
  type MerchantOrderListDto,
  type MerchantOrderListItemDto,
  type OrderStatusValue,
} from "@/modules/orders/service-core";

import {
  getMerchantOrderEmptyState,
  getMerchantOrderInvalidFilterState,
  getMerchantOrderListTitle,
  getMerchantOrderStatusCopy,
  MERCHANT_ORDER_STATUS_VALUES,
  parseMerchantOrderStatusFilter,
} from "./page-helpers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pedidos do estabelecimento",
  description:
    "Caixa de entrada protegida com pedidos próprios do estabelecimento.",
};

type MerchantOrdersPageProps = {
  searchParams: Promise<{
    status?: string | string[];
  }>;
};

type MerchantOrderInboxState =
  | { status: "loaded"; data: MerchantOrderListDto }
  | { status: "invalid-filter" }
  | { status: "unavailable"; message: string };

export default async function MerchantOrdersPage({
  searchParams,
}: MerchantOrdersPageProps) {
  const auth = await requireMerchantPageSession();
  const params = await searchParams;
  const state = await loadMerchantOrderInbox(auth.user.id, params.status);
  const selectedStatus = state.status === "loaded" ? state.data.status : null;

  return (
    <main className="relative isolate min-h-dvh overflow-hidden py-6 sm:py-10">
      <MerchantOrdersBackdrop />
      <Container className="space-y-7">
        <MerchantOrdersHeader />

        <section className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-6 shadow-xl shadow-orange-950/10 backdrop-blur sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
            Caixa de entrada
          </p>
          <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_0.42fr] lg:items-end">
            <div className="space-y-4">
              <h1 className="text-4xl font-black tracking-[-0.055em] text-orange-950 sm:text-5xl">
                Pedidos da loja
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-700 sm:text-base">
                A lista abaixo usa a sessão MERCHANT para resolver sua loja no
                servidor. Nenhum identificador de loja é aceito pela URL, e os
                cartões mostram somente o resumo necessário para triagem.
              </p>
            </div>
            <MerchantOrderCount state={state} />
          </div>
        </section>

        <MerchantOrderFilters selectedStatus={selectedStatus} />
        <MerchantOrderState state={state} />
      </Container>
    </main>
  );
}

async function loadMerchantOrderInbox(
  ownerId: string,
  statusInput: string | string[] | undefined,
): Promise<MerchantOrderInboxState> {
  const parsedStatus = parseMerchantOrderStatusFilter(statusInput);

  if (!parsedStatus.valid) {
    return { status: "invalid-filter" };
  }

  try {
    const result = await orderService.listMerchantOrdersForOwner(ownerId, {
      limit: MERCHANT_ORDER_LIST_LIMIT,
      status: parsedStatus.status,
    });

    if (!result.ok) {
      return { status: "unavailable", message: result.message };
    }

    return { status: "loaded", data: result.data };
  } catch {
    return {
      status: "unavailable",
      message: "Não foi possível carregar pedidos agora. Tente novamente.",
    };
  }
}

function MerchantOrderState({ state }: { state: MerchantOrderInboxState }) {
  if (state.status === "invalid-filter") {
    const copy = getMerchantOrderInvalidFilterState();

    return (
      <FeedbackState
        action={<MerchantOrdersFallbackLink label="Ver todos os pedidos" />}
        description={copy.description}
        title={copy.title}
        tone="error"
      />
    );
  }

  if (state.status === "unavailable") {
    return (
      <FeedbackState
        action={<MerchantOrdersFallbackLink label="Tentar sem filtro" />}
        description={state.message}
        title="Pedidos indisponíveis"
        tone="error"
      />
    );
  }

  if (state.data.orders.length === 0) {
    const copy = getMerchantOrderEmptyState(state.data.status ?? undefined);

    return (
      <FeedbackState
        action={<MerchantOrdersFallbackLink label="Ver todos" />}
        description={copy.description}
        title={copy.title}
        tone="empty"
      />
    );
  }

  return <MerchantOrderList data={state.data} />;
}

function MerchantOrderFilters({
  selectedStatus,
}: {
  selectedStatus: OrderStatusValue | null;
}) {
  return (
    <nav
      aria-label="Filtros de status dos pedidos"
      className="rounded-[2rem] border border-orange-100 bg-white/88 p-4 shadow-sm shadow-orange-950/5 backdrop-blur"
    >
      <div className="flex flex-wrap gap-2">
        <MerchantOrderFilterLink
          href="/estabelecimento/pedidos"
          isActive={selectedStatus === null}
          label="Todos"
        />
        {MERCHANT_ORDER_STATUS_VALUES.map((status) => (
          <MerchantOrderFilterLink
            href={`/estabelecimento/pedidos?status=${status}`}
            isActive={selectedStatus === status}
            key={status}
            label={getMerchantOrderStatusCopy(status).pluralLabel}
          />
        ))}
      </div>
    </nav>
  );
}

function MerchantOrderFilterLink({
  href,
  isActive,
  label,
}: {
  href: string;
  isActive: boolean;
  label: string;
}) {
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={[
        "rounded-full border px-4 py-2 text-sm font-black transition focus:outline-none focus:ring-4 focus:ring-orange-100",
        isActive
          ? "border-orange-600 bg-orange-600 text-white shadow-lg shadow-orange-600/20"
          : "border-orange-100 bg-white text-orange-900 hover:border-orange-300 hover:bg-orange-50",
      ].join(" ")}
      href={href}
    >
      {label}
    </Link>
  );
}

function MerchantOrderList({ data }: { data: MerchantOrderListDto }) {
  return (
    <section aria-labelledby="merchant-order-list-heading" className="space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
          Lista operacional
        </p>
        <h2
          className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950"
          id="merchant-order-list-heading"
        >
          {getMerchantOrderListTitle(data.status ?? undefined)}
        </h2>
      </div>

      <div className="grid gap-4">
        {data.orders.map((order) => (
          <MerchantOrderCard key={order.id} order={order} />
        ))}
      </div>
    </section>
  );
}

function MerchantOrderCard({ order }: { order: MerchantOrderListItemDto }) {
  const statusCopy = getMerchantOrderStatusCopy(order.status);
  const paymentMethod = order.payment?.method ?? order.paymentMethod;
  const paymentStatus = order.payment?.status ?? order.paymentStatus;
  const paymentAmount = order.payment?.amount ?? order.total;
  const orderDate = order.placedAt ?? order.createdAt;

  return (
    <article className="rounded-[1.75rem] border border-orange-100 bg-white/92 p-5 shadow-sm shadow-orange-950/5 backdrop-blur">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-700">
                Pedido {order.publicCode}
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950">
                {formatCustomerSummary(order.customerName)}
              </h3>
            </div>
            <span
              className={[
                "rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em]",
                statusCopy.className,
              ].join(" ")}
            >
              {getOrderStatusLabel(order.status)}
            </span>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MerchantOrderMetric label="Pagamento" value={getPaymentMethodLabel(paymentMethod)} />
            <MerchantOrderMetric label="Status do pagamento" value={getPaymentStatusLabel(paymentStatus)} />
            <MerchantOrderMetric label="Total" value={formatPublicOrderMoney(order.total)} />
            <MerchantOrderMetric label="Criado em" value={formatPublicOrderDateTime(orderDate)} />
          </dl>
        </div>

        <div className="grid gap-3 rounded-3xl border border-orange-100 bg-orange-50/75 p-4 text-sm font-bold text-orange-950 lg:min-w-64">
          <span>Valor para conferência: {formatPublicOrderMoney(paymentAmount)}</span>
          <span>{statusCopy.description}</span>
          <Link
            className="mt-1 inline-flex justify-center rounded-full bg-orange-600 px-4 py-2 text-sm font-black text-white shadow-sm shadow-orange-950/10 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100"
            href={`/estabelecimento/pedidos/${encodeURIComponent(order.id)}`}
          >
            Abrir detalhes
          </Link>
        </div>
      </div>
    </article>
  );
}

function MerchantOrderMetric({ label, value }: { label: string; value: string }) {
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

function MerchantOrderCount({ state }: { state: MerchantOrderInboxState }) {
  if (state.status !== "loaded") {
    return (
      <div className="rounded-3xl border border-orange-100 bg-orange-50/80 p-5 text-sm font-bold text-orange-950">
        Lista limitada a {MERCHANT_ORDER_LIST_LIMIT} pedidos por carregamento.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-orange-100 bg-orange-50/80 p-5 text-sm font-bold text-orange-950">
      <span>
        Exibindo {state.data.count} de até {state.data.limit} pedidos neste
        carregamento.
      </span>
    </div>
  );
}

function MerchantOrdersFallbackLink({ label }: { label: string }) {
  return (
    <Link
      className="inline-flex rounded-full bg-orange-600 px-4 py-2 text-sm font-black text-white shadow-sm shadow-orange-950/10 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100"
      href="/estabelecimento/pedidos"
    >
      {label}
    </Link>
  );
}

function MerchantOrdersHeader() {
  return (
    <nav
      aria-label="Navegação dos pedidos do estabelecimento"
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
        href="/estabelecimento"
      >
        Voltar ao painel
      </Link>
    </nav>
  );
}

function formatCustomerSummary(customerName: string) {
  const name = customerName.trim();

  return name || "Cliente sem nome público";
}

function MerchantOrdersBackdrop() {
  return (
    <>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.24),transparent_34%),linear-gradient(135deg,rgba(255,247,237,0.96),rgba(255,255,255,0.9)_48%,rgba(254,243,199,0.74))]" />
      <div className="absolute right-[-6rem] top-24 -z-10 h-72 w-72 rounded-full bg-orange-300/25 blur-3xl" />
      <div className="absolute bottom-[-8rem] left-[-4rem] -z-10 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl" />
    </>
  );
}
