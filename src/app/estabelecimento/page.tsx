import Link from "next/link";
import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import { FeedbackState } from "@/components/ui/feedback-state";
import { logoutAction } from "@/modules/auth/actions";
import { categoryService } from "@/modules/categories/service";
import type { CategoryDto } from "@/modules/categories/service-core";
import { requireMerchantPageSession } from "@/modules/merchant/auth";
import { merchantService } from "@/modules/merchant/service";
import type {
  MerchantCategoryDto,
  MerchantDashboardDto,
  MerchantEstablishmentDto,
} from "@/modules/merchant/service-core";
import { productService } from "@/modules/products/service";
import type { ProductDto } from "@/modules/products/service-core";

import { LogoUploadForm } from "./logo-upload-form";
import {
  ProductCreateForm,
  ProductEditForm,
  ProductLifecycleControls,
  type MerchantProductFormProduct,
  type ProductCategoryOption,
} from "./product-forms";
import { ProductPhotoUploadForm } from "./product-photo-upload-form";
import {
  getProductEmptyStateCopy,
  getProductStatusBadgeCopy,
  getProductUnavailableStatusCopy,
} from "./product-copy";
import { ProfileForm } from "./profile-form";
import {
  getMerchantPanelStatusCopy,
  getMerchantStatusBadgeCopy,
  shouldRenderMerchantMutationForms,
  type MerchantPanelStatus,
  type MerchantStatusBadgeTone,
} from "./status-copy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Estabelecimento",
  description: "Área protegida para estabelecimentos do Sextou Delivery.",
};

type MerchantCategoryOptionsState = {
  categories: MerchantCategoryDto[];
  errorMessage: string | null;
};

type ProductCategoryOptionsState = {
  categories: ProductCategoryOption[];
  errorMessage: string | null;
};

type ProductListState = {
  errorMessage: string | null;
  products: ProductDto[];
};

export default async function EstablishmentPage() {
  const auth = await requireMerchantPageSession();
  const dashboardResult = await merchantService.getDashboardForOwner(auth.user.id);
  const dashboard = dashboardResult.ok ? dashboardResult.data : null;
  const status = dashboard?.establishment.status ?? "missing";
  const statusCopy = getMerchantPanelStatusCopy(status);
  const canRenderMutationForms = shouldRenderMerchantMutationForms(status);

  const [categoryOptions, productList, productCategoryOptions] = dashboard
    ? await Promise.all([
        dashboard.canEditProfile
          ? getActiveEstablishmentCategoryOptions()
          : emptyMerchantCategoryOptions(),
        getMerchantProductList(auth.user.id),
        canRenderMutationForms
          ? getActiveProductCategoryOptions()
          : emptyProductCategoryOptions(),
      ])
    : [
        emptyMerchantCategoryOptions(),
        emptyProductList(),
        emptyProductCategoryOptions(),
      ];

  return (
    <main className="relative isolate min-h-dvh overflow-hidden py-6 sm:py-10">
      <PrivateBackdrop />
      <Container className="space-y-7">
        <PrivateHeader eyebrow="Estabelecimento" title="Painel da loja" />

        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-6 shadow-xl shadow-orange-950/10 backdrop-blur">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
              Sessão merchant
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-orange-950 sm:text-5xl">
              Olá, {auth.user.name}.
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              Esta rota valida sua sessão MERCHANT antes de buscar dados da loja.
              Identificador, dono, status e slug são resolvidos no servidor e
              nunca por campos enviados pelo cliente.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <StatusPill label="Perfil" value="MERCHANT" />
              <StatusPill label="Conta" value={auth.user.status} />
              <StatusPill
                label="Loja"
                tone={statusCopy.badge.tone}
                value={statusCopy.badge.label}
              />
            </div>
          </article>

          <div className="space-y-5">
            {dashboard ? (
              <EstablishmentStatusPanel dashboard={dashboard} />
            ) : (
              <FeedbackState
                description={
                  dashboardResult.ok
                    ? statusCopy.description
                    : dashboardResult.message
                }
                title={
                  dashboardResult.ok || dashboardResult.code === "NOT_FOUND"
                    ? statusCopy.title
                    : "Não foi possível carregar o painel"
                }
                tone="error"
              />
            )}
            <LogoutPanel />
          </div>
        </section>

        {dashboard ? (
          <section className="grid gap-5">
            <ReadOnlyEstablishmentCard establishment={dashboard.establishment} />
            <OrdersShortcutPanel />

            {categoryOptions.errorMessage ? (
              <FeedbackState
                description={categoryOptions.errorMessage}
                title="Categorias indisponíveis"
                tone="error"
              />
            ) : null}

            {canRenderMutationForms ? (
              <div className="grid gap-5">
                <LogoUploadForm establishment={dashboard.establishment} />
                <ProfileForm
                  categories={categoryOptions.categories}
                  establishment={dashboard.establishment}
                />
              </div>
            ) : (
              <FeedbackState
                description={statusCopy.formUnavailableMessage}
                title="Edição indisponível"
                tone={statusCopy.noticeTone}
              />
            )}

            <ProductsPanel
              canRenderMutationForms={canRenderMutationForms}
              categoryErrorMessage={productCategoryOptions.errorMessage}
              categories={productCategoryOptions.categories}
              productErrorMessage={productList.errorMessage}
              products={productList.products}
              status={status}
            />
          </section>
        ) : null}
      </Container>
    </main>
  );
}

async function getActiveEstablishmentCategoryOptions(): Promise<MerchantCategoryOptionsState> {
  const categories = await categoryService.listByType({
    includeInactive: false,
    limit: 100,
    type: "ESTABLISHMENT",
  });

  if (!categories.ok) {
    return {
      categories: [],
      errorMessage: categories.message,
    };
  }

  return {
    categories: toMerchantCategoryOptions(categories.data),
    errorMessage: null,
  };
}

async function getActiveProductCategoryOptions(): Promise<ProductCategoryOptionsState> {
  const categories = await categoryService.listByType({
    includeInactive: false,
    limit: 100,
    type: "PRODUCT",
  });

  if (!categories.ok) {
    return {
      categories: [],
      errorMessage: categories.message,
    };
  }

  return {
    categories: toProductCategoryOptions(categories.data),
    errorMessage: null,
  };
}

async function getMerchantProductList(ownerId: string): Promise<ProductListState> {
  const products = await productService.listForOwner(ownerId);

  if (!products.ok) {
    return {
      errorMessage: products.message,
      products: [],
    };
  }

  return {
    errorMessage: null,
    products: products.data,
  };
}

function emptyMerchantCategoryOptions(): MerchantCategoryOptionsState {
  return { categories: [], errorMessage: null };
}

function emptyProductCategoryOptions(): ProductCategoryOptionsState {
  return { categories: [], errorMessage: null };
}

function emptyProductList(): ProductListState {
  return { errorMessage: null, products: [] };
}

function toMerchantCategoryOptions(
  categories: CategoryDto[],
): MerchantCategoryDto[] {
  return categories.map(({ id, isActive, name, slug, type }) => ({
    id,
    isActive,
    name,
    slug,
    type,
  }));
}

function toProductCategoryOptions(categories: CategoryDto[]): ProductCategoryOption[] {
  return categories.map(({ id, name }) => ({ id, name }));
}

function EstablishmentStatusPanel({
  dashboard,
}: {
  dashboard: MerchantDashboardDto;
}) {
  const establishment = dashboard.establishment;
  const copy = getMerchantPanelStatusCopy(establishment.status);

  return (
    <FeedbackState
      description={copy.description}
      title={copy.title}
      tone={copy.noticeTone}
    />
  );
}

function ReadOnlyEstablishmentCard({
  establishment,
}: {
  establishment: MerchantEstablishmentDto;
}) {
  const statusBadge = getMerchantStatusBadgeCopy(establishment.status);

  return (
    <section className="rounded-[1.75rem] border border-orange-100 bg-white/92 p-5 shadow-sm shadow-orange-950/5 backdrop-blur">
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
            Perfil da loja
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950">
            {establishment.name}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Confira os dados resolvidos da loja antes de alterar informações
            operacionais. Os campos abaixo são somente leitura nesta tela.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ReadOnlyField label="Slug público" value={establishment.slug} />
          <ReadOnlyField label="Status" value={statusBadge.label} />
          <ReadOnlyField
            label="Categoria atual"
            value={establishment.category?.name ?? "Sem categoria"}
          />
          <ReadOnlyField
            label="Logo atual"
            value={establishment.logoUrl ? "Logo cadastrado" : "Sem logo"}
          />
        </div>
      </div>
    </section>
  );
}

function OrdersShortcutPanel() {
  return (
    <section className="rounded-[1.75rem] border border-amber-200/75 bg-amber-50/80 p-5 shadow-sm shadow-orange-950/5 backdrop-blur">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-700">
            Pedidos
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950">
            Caixa de entrada da loja
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Acompanhe pedidos próprios em uma rota operacional separada para
            manter este painel focado em perfil e cardápio.
          </p>
        </div>
        <Link
          className="inline-flex justify-center rounded-full bg-orange-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100"
          href="/estabelecimento/pedidos"
        >
          Ver pedidos
        </Link>
      </div>
    </section>
  );
}

function ProductsPanel({
  canRenderMutationForms,
  categories,
  categoryErrorMessage,
  productErrorMessage,
  products,
  status,
}: {
  canRenderMutationForms: boolean;
  categories: ProductCategoryOption[];
  categoryErrorMessage: string | null;
  productErrorMessage: string | null;
  products: ProductDto[];
  status: MerchantPanelStatus;
}) {
  const unavailableCopy = getProductUnavailableStatusCopy(status);
  const emptyCopy = getProductEmptyStateCopy();

  return (
    <section
      className="rounded-[2rem] border border-orange-100 bg-white/92 p-5 shadow-sm shadow-orange-950/5 backdrop-blur"
      id="produtos"
    >
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
            Cardápio
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-orange-950">
            Produtos da loja
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Gerencie produtos com as ações protegidas por sessão. Apenas produtos
            ativos aparecem no catálogo público de lojas.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ReadOnlyField label="Produtos visíveis no painel" value={String(products.length)} />
          <ReadOnlyField
            label="Categorias de produto"
            value={
              categoryErrorMessage
                ? "Indisponíveis agora"
                : `${categories.length} ativa${categories.length === 1 ? "" : "s"}`
            }
          />
        </div>
      </div>

      <div className="mt-5 grid gap-5">
        {productErrorMessage ? (
          <FeedbackState
            description={productErrorMessage}
            title="Não foi possível carregar os produtos"
            tone="error"
          />
        ) : null}

        {!canRenderMutationForms ? (
          <FeedbackState
            description={unavailableCopy.description}
            title={unavailableCopy.title}
            tone={unavailableCopy.tone}
          />
        ) : null}

        {canRenderMutationForms && categoryErrorMessage ? (
          <FeedbackState
            description={categoryErrorMessage}
            title="Categorias de produto indisponíveis"
            tone="error"
          />
        ) : null}

        {canRenderMutationForms ? (
          <ProductCreateForm categories={categories} />
        ) : null}

        {!productErrorMessage && products.length === 0 ? (
          <FeedbackState
            description={emptyCopy.description}
            title={emptyCopy.title}
            tone={emptyCopy.tone}
          />
        ) : null}

        {!productErrorMessage && products.length > 0 ? (
          <div className="grid gap-5">
            {products.map((product) => (
              <ProductCard
                canRenderMutationForms={canRenderMutationForms}
                categories={categories}
                key={product.id}
                product={product}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProductCard({
  canRenderMutationForms,
  categories,
  product,
}: {
  canRenderMutationForms: boolean;
  categories: ProductCategoryOption[];
  product: ProductDto;
}) {
  const statusBadge = getProductStatusBadgeCopy(product.status);
  const formProduct = toMerchantProductFormProduct(product);

  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-slate-50/70 shadow-sm shadow-slate-950/5">
      <div className="grid gap-0 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="relative min-h-64 bg-orange-100/70">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Product uploads live under /uploads and cards need a plain responsive preview.
            <img
              alt={`Foto de ${product.name}`}
              className="h-full min-h-64 w-full object-cover"
              src={product.imageUrl}
            />
          ) : (
            <div className="grid h-full min-h-64 place-items-center p-6 text-center">
              <div className="grid size-28 place-items-center rounded-[2rem] bg-white text-4xl font-black text-orange-900 shadow-inner shadow-orange-950/5">
                {product.name.slice(0, 1).toUpperCase() || "P"}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-700">
                {product.category?.name ?? "Sem categoria"}
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950">
                {product.name}
              </h3>
              {product.description ? (
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {product.description}
                </p>
              ) : null}
            </div>

            <ProductStatusPill
              label={statusBadge.label}
              tone={statusBadge.tone}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ReadOnlyField label="Preço" value={formatProductPrice(product.price)} />
            <ReadOnlyField label="Slug público" value={product.slug} />
          </div>

          {canRenderMutationForms ? (
            <div className="grid gap-4">
              <ProductEditForm categories={categories} product={formProduct} />
              <div className="grid gap-4 xl:grid-cols-2">
                <ProductLifecycleControls
                  product={{
                    id: product.id,
                    name: product.name,
                    status: product.status,
                  }}
                />
                <ProductPhotoUploadForm
                  product={{
                    id: product.id,
                    imageUrl: product.imageUrl,
                    name: product.name,
                    status: product.status,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function toMerchantProductFormProduct(product: ProductDto): MerchantProductFormProduct {
  return {
    categoryId: product.categoryId,
    description: product.description,
    id: product.id,
    name: product.name,
    price: product.price,
    status: product.status,
  };
}

function formatProductPrice(price: string) {
  const value = Number(price);

  if (!Number.isFinite(value)) {
    return `R$ ${price}`;
  }

  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(value);
}

function ProductStatusPill({
  label,
  tone,
}: {
  label: string;
  tone: MerchantStatusBadgeTone;
}) {
  const toneClasses: Record<MerchantStatusBadgeTone, string> = {
    danger: "border-rose-100 bg-rose-50 text-rose-900",
    neutral: "border-slate-200 bg-white text-slate-700",
    success: "border-lime-100 bg-lime-50 text-lime-900",
    warning: "border-amber-100 bg-amber-50 text-amber-900",
  };

  return (
    <span
      className={[
        "rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em]",
        toneClasses[tone],
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-700">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-black text-orange-950">
        {value}
      </p>
    </div>
  );
}

function PrivateHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-orange-200/70 bg-white/80 px-4 py-3 shadow-sm shadow-orange-950/5 backdrop-blur">
      <Link className="flex items-center gap-3" href="/">
        <span className="grid size-10 place-items-center rounded-full bg-orange-500 text-lg font-black text-white shadow-lg shadow-orange-500/30">
          S
        </span>
        <span className="text-sm font-black uppercase tracking-[0.24em] text-orange-950">
          Sextou Delivery
        </span>
      </Link>
      <span className="rounded-full bg-orange-100 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-orange-800">
        {eyebrow} · {title}
      </span>
    </nav>
  );
}

function StatusPill({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: MerchantStatusBadgeTone;
  value: string;
}) {
  const toneClasses: Record<MerchantStatusBadgeTone, string> = {
    danger: "border-rose-100 bg-rose-50/80 text-rose-950",
    neutral: "border-orange-100 bg-orange-50/70 text-orange-950",
    success: "border-lime-100 bg-lime-50/80 text-lime-950",
    warning: "border-amber-100 bg-amber-50/80 text-amber-950",
  };

  return (
    <div className={["rounded-2xl border p-4", toneClasses[tone]].join(" ")}>
      <p className="text-xs font-black uppercase tracking-[0.2em] opacity-70">
        {label}
      </p>
      <p className="mt-2 text-sm font-black">{value}</p>
    </div>
  );
}

function LogoutPanel() {
  return (
    <form
      action={logoutAction}
      className="rounded-3xl border border-slate-200/80 bg-white/85 p-5 shadow-sm shadow-slate-950/5 backdrop-blur"
    >
      <p className="text-sm font-bold leading-6 text-slate-700">
        Sair revoga a sessão no banco e limpa o cookie httpOnly no navegador.
      </p>
      <button
        className="mt-4 rounded-2xl bg-orange-950 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:bg-orange-900 focus:outline-none focus:ring-4 focus:ring-orange-100"
        type="submit"
      >
        Sair
      </button>
    </form>
  );
}

function PrivateBackdrop() {
  return (
    <>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.24),transparent_34%),linear-gradient(135deg,rgba(255,247,237,0.96),rgba(255,255,255,0.9)_48%,rgba(254,243,199,0.74))]" />
      <div className="absolute right-[-6rem] top-24 -z-10 h-72 w-72 rounded-full bg-orange-300/25 blur-3xl" />
    </>
  );
}
