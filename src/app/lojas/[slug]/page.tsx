import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import { FeedbackState } from "@/components/ui/feedback-state";
import { catalogService } from "@/modules/catalog/service";
import type { CatalogStoreCatalogDto } from "@/modules/catalog/service-core";
import { StoreCart } from "./store-cart";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Catálogo da loja",
  description: "Produtos ativos de uma loja ativa no Sextou Delivery.",
};

type StoreCatalogPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

export default async function StoreCatalogPage({ params }: StoreCatalogPageProps) {
  const { slug } = await params;
  const catalog = await catalogService.getActiveStoreCatalog({ slug });

  return (
    <main className="relative isolate min-h-dvh overflow-hidden py-6 sm:py-10">
      <PublicCatalogBackdrop />
      <Container className="space-y-7">
        <PublicCatalogHeader />

        {!catalog.ok ? (
          <FeedbackState
            action={
              <Link
                className="inline-flex rounded-full bg-orange-600 px-4 py-2 text-sm font-black text-white shadow-sm shadow-orange-950/10 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100"
                href="/lojas"
              >
                Ver lojas ativas
              </Link>
            }
            description={catalog.message}
            title={
              catalog.code === "DATABASE_ERROR"
                ? "Catálogo indisponível"
                : "Loja não encontrada"
            }
            tone={catalog.code === "DATABASE_ERROR" ? "error" : "empty"}
          />
        ) : (
          <StoreCatalog catalog={catalog.data} />
        )}
      </Container>
    </main>
  );
}

function StoreCatalog({ catalog }: { catalog: CatalogStoreCatalogDto }) {
  return (
    <>
      <StoreHeader catalog={catalog} />
      <StoreCart catalog={catalog} />
    </>
  );
}

function StoreHeader({ catalog }: { catalog: CatalogStoreCatalogDto }) {
  const logoUrl = getSafeLocalImageUrl(catalog.logoUrl);

  return (
    <section className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-6 shadow-xl shadow-orange-950/10 backdrop-blur sm:p-8">
      <Link
        className="inline-flex text-sm font-black text-orange-700 transition hover:text-orange-950 focus:outline-none focus:ring-4 focus:ring-orange-100"
        href="/lojas"
      >
        ← Voltar para lojas ativas
      </Link>

      <div className="mt-6 grid gap-6 lg:grid-cols-[auto_1fr_0.45fr] lg:items-center">
        <div className="grid size-24 place-items-center overflow-hidden rounded-[1.75rem] border border-orange-100 bg-orange-50 text-3xl font-black text-orange-700 sm:size-32">
          {logoUrl ? (
            <Image
              alt={`Logotipo de ${catalog.name}`}
              className="h-full w-full object-cover"
              height={128}
              priority
              src={logoUrl}
              width={128}
            />
          ) : (
            <span aria-hidden="true">{catalog.name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>

        <div className="space-y-4">
          <p className="w-fit rounded-full bg-orange-100 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-orange-700">
            {catalog.category?.name ?? "Loja local"}
          </p>
          <div>
            <h1 className="text-4xl font-black tracking-[-0.055em] text-orange-950 sm:text-5xl lg:text-6xl">
              {catalog.name}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-700 sm:text-base">
              {catalog.description ?? "Catálogo ativo disponível para pedidos locais."}
            </p>
          </div>
        </div>

        <div className="grid gap-3 rounded-3xl border border-orange-100 bg-orange-50/80 p-5 text-sm font-bold text-orange-950">
          <span>{formatLocation(catalog)}</span>
          <span>Entrega: {formatMoney(catalog.deliveryFee)}</span>
          <span>Pedido mínimo: {formatMinimumOrder(catalog.minimumOrder)}</span>
        </div>
      </div>
    </section>
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
      <Link
        className="rounded-full bg-lime-100 px-4 py-2 text-xs font-bold text-lime-800 transition hover:bg-lime-200 focus:outline-none focus:ring-4 focus:ring-lime-100"
        href="/lojas"
      >
        Lojas ativas
      </Link>
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

function formatLocation(store: CatalogStoreCatalogDto) {
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
