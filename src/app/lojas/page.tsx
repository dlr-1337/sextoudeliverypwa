import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import { FeedbackState } from "@/components/ui/feedback-state";
import { catalogService } from "@/modules/catalog/service";
import type { CatalogStoreSummaryDto } from "@/modules/catalog/service-core";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lojas ativas",
  description: "Catálogo público de lojas ativas no Sextou Delivery.",
};

const STORE_LIST_LIMIT = 50;

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

export default async function StoresPage() {
  const stores = await catalogService.listActiveStores({ limit: STORE_LIST_LIMIT });

  return (
    <main className="relative isolate min-h-dvh overflow-hidden py-6 sm:py-10">
      <PublicCatalogBackdrop />
      <Container className="space-y-7">
        <PublicCatalogHeader />

        <section className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-6 shadow-xl shadow-orange-950/10 backdrop-blur sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
            Catálogo público
          </p>
          <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_0.72fr] lg:items-end">
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-black tracking-[-0.055em] text-orange-950 sm:text-5xl lg:text-6xl">
                Encontre lojas ativas para pedir no Sextou Delivery.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-700 sm:text-base">
                A vitrine mostra apenas estabelecimentos aprovados e ativos. Lojas
                pendentes, bloqueadas ou inativas não aparecem no catálogo público.
              </p>
            </div>
            <div className="rounded-3xl border border-orange-100 bg-orange-50/80 p-5 text-sm font-semibold leading-7 text-orange-950">
              Exibindo até {STORE_LIST_LIMIT} lojas ativas, ordenadas por nome para
              facilitar a navegação.
            </div>
          </div>
        </section>

        {!stores.ok ? (
          <FeedbackState
            description={stores.message}
            title="Não foi possível carregar as lojas"
            tone="error"
          />
        ) : stores.data.length === 0 ? (
          <FeedbackState
            description="Ainda não há lojas ativas disponíveis para pedidos. Volte em breve para conferir os estabelecimentos aprovados."
            title="Nenhuma loja ativa no momento"
            tone="empty"
          />
        ) : (
          <section aria-labelledby="active-stores-heading" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
                  Lojas disponíveis
                </p>
                <h2
                  className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950"
                  id="active-stores-heading"
                >
                  Escolha uma loja ativa
                </h2>
              </div>
              <span className="rounded-full border border-orange-100 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-orange-800 shadow-sm shadow-orange-950/5">
                {stores.data.length}/{STORE_LIST_LIMIT} exibidas
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {stores.data.map((store) => (
                <StoreCard key={store.slug} store={store} />
              ))}
            </div>
          </section>
        )}
      </Container>
    </main>
  );
}

function StoreCard({ store }: { store: CatalogStoreSummaryDto }) {
  const logoUrl = getSafeLocalImageUrl(store.logoUrl);

  return (
    <Link
      className="group rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-xl hover:shadow-orange-950/10 focus:outline-none focus:ring-4 focus:ring-orange-100"
      href={`/lojas/${store.slug}`}
    >
      <article className="flex h-full flex-col gap-5">
        <div className="flex items-start gap-4">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-orange-100 bg-orange-50 text-xl font-black text-orange-700">
            {logoUrl ? (
              <Image
                alt={`Logotipo de ${store.name}`}
                className="h-full w-full object-cover"
                height={64}
                src={logoUrl}
                width={64}
              />
            ) : (
              <span aria-hidden="true">{store.name.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-600">
              {store.category?.name ?? "Loja local"}
            </p>
            <h3 className="mt-2 text-xl font-black tracking-[-0.04em] text-orange-950 group-hover:text-orange-700">
              {store.name}
            </h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {formatLocation(store)}
            </p>
          </div>
        </div>

        <p className="line-clamp-3 text-sm leading-7 text-slate-700">
          {store.description ?? "Cardápio ativo disponível para pedidos locais."}
        </p>

        <div className="mt-auto grid gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm font-bold text-slate-700">
          <span>Entrega: {formatMoney(store.deliveryFee)}</span>
          <span>Pedido mínimo: {formatMinimumOrder(store.minimumOrder)}</span>
        </div>
      </article>
    </Link>
  );
}

function PublicCatalogHeader() {
  return (
    <nav
      aria-label="Navegação do catálogo público"
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
      <span className="rounded-full bg-lime-100 px-4 py-2 text-xs font-bold text-lime-800">
        Lojas ativas
      </span>
    </nav>
  );
}

function PublicCatalogBackdrop() {
  return (
    <>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.24),transparent_34%),linear-gradient(135deg,rgba(255,247,237,0.96),rgba(255,255,255,0.9)_48%,rgba(254,243,199,0.74))]" />
      <div className="absolute right-8 top-24 -z-10 h-56 w-56 rounded-full bg-orange-300/20 blur-3xl" />
    </>
  );
}

function formatLocation(store: CatalogStoreSummaryDto) {
  if (store.city && store.state) {
    return `${store.city}, ${store.state}`;
  }

  return store.city ?? store.state ?? "Atendimento local";
}

function formatMinimumOrder(value: string) {
  return Number(value) === 0 ? "sem mínimo" : formatMoney(value);
}

function formatMoney(value: string) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return `R$ ${value}`;
  }

  return moneyFormatter.format(numericValue);
}

function getSafeLocalImageUrl(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}
