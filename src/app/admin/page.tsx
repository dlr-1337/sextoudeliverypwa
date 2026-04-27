import Link from "next/link";
import type { Metadata } from "next";

import { FeedbackState } from "@/components/ui/feedback-state";
import { requireAdminPageSession } from "@/modules/admin/auth";
import { adminService } from "@/modules/admin/service";
import type {
  AdminCategoryType,
  AdminDashboardDto,
  AdminEstablishmentStatus,
  AdminUserStatus,
} from "@/modules/admin/service-core";

export const metadata: Metadata = {
  title: "Dashboard administrativo",
  description:
    "Indicadores administrativos de estabelecimentos, categorias e clientes.",
};

const ESTABLISHMENT_STATUS_COPY: Record<
  AdminEstablishmentStatus,
  { label: string; description: string; className: string }
> = {
  PENDING: {
    label: "Pendentes",
    description: "lojas aguardando aprovação",
    className: "border-amber-200 bg-amber-50 text-amber-950",
  },
  ACTIVE: {
    label: "Ativos",
    description: "lojas liberadas para operar",
    className: "border-lime-200 bg-lime-50 text-lime-950",
  },
  BLOCKED: {
    label: "Bloqueados",
    description: "lojas pausadas pela administração",
    className: "border-rose-200 bg-rose-50 text-rose-950",
  },
  INACTIVE: {
    label: "Inativos",
    description: "lojas retiradas da operação",
    className: "border-slate-200 bg-slate-50 text-slate-950",
  },
};

const CATEGORY_TYPE_COPY: Record<AdminCategoryType, string> = {
  ESTABLISHMENT: "Estabelecimentos",
  PRODUCT: "Produtos",
};

const USER_STATUS_COPY: Record<AdminUserStatus, string> = {
  ACTIVE: "Ativos",
  INVITED: "Convidados",
  SUSPENDED: "Suspensos",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function AdminPage() {
  await requireAdminPageSession("/admin");

  const dashboard = await adminService.getDashboard();

  if (!dashboard.ok) {
    return (
      <FeedbackState
        description={dashboard.message}
        title="Dashboard indisponível"
        tone="error"
      />
    );
  }

  return <DashboardContent dashboard={dashboard.data} />;
}

function DashboardContent({ dashboard }: { dashboard: AdminDashboardDto }) {
  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-orange-100 bg-orange-950 p-6 text-white shadow-xl shadow-orange-950/15">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-200">
              Operação administrativa
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-[-0.055em] sm:text-5xl">
              Categorias, aprovações e clientes em uma base operacional.
            </h2>
          </div>
          <p className="max-w-sm rounded-2xl border border-white/15 bg-white/10 p-4 text-sm font-semibold leading-6 text-orange-50">
            Atualizado em {formatDate(dashboard.generatedAt)}. Os números são
            contagens seguras e não exibem tokens, senhas ou dados financeiros.
          </p>
        </div>
      </section>

      <section aria-labelledby="establishment-counts-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
              Estabelecimentos
            </p>
            <h2
              className="text-2xl font-black tracking-[-0.04em] text-orange-950"
              id="establishment-counts-heading"
            >
              Estado da fila de aprovação
            </h2>
          </div>
          <span className="rounded-full border border-dashed border-orange-200 bg-orange-50 px-4 py-2 text-sm font-black text-orange-700">
            Aprovação completa na próxima etapa
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(dashboard.establishmentCounts).map(([status, count]) => (
            <MetricCard
              key={status}
              className={
                ESTABLISHMENT_STATUS_COPY[status as AdminEstablishmentStatus]
                  .className
              }
              label={
                ESTABLISHMENT_STATUS_COPY[status as AdminEstablishmentStatus]
                  .label
              }
              value={count}
              description={
                ESTABLISHMENT_STATUS_COPY[status as AdminEstablishmentStatus]
                  .description
              }
            />
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <CategorySummary dashboard={dashboard} />
        <CustomerSummary dashboard={dashboard} />
      </section>

      <RecentPendingPanel dashboard={dashboard} />
    </div>
  );
}

function CategorySummary({ dashboard }: { dashboard: AdminDashboardDto }) {
  const totalCategories = Object.values(dashboard.categoryCounts).reduce(
    (sum, item) => sum + item.total,
    0,
  );

  return (
    <section
      aria-labelledby="category-summary-heading"
      className="rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
            Categorias
          </p>
          <h2
            className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950"
            id="category-summary-heading"
          >
            Ativas e inativas por tipo
          </h2>
        </div>
        <Link
          className="rounded-full bg-orange-100 px-4 py-2 text-sm font-black text-orange-900 transition hover:bg-orange-200 focus:outline-none focus:ring-4 focus:ring-orange-100"
          href="/admin/categorias"
        >
          Gerenciar
        </Link>
      </div>

      {totalCategories === 0 ? (
        <p className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">
          Nenhuma categoria cadastrada ainda. Use a página de categorias para
          criar os primeiros grupos de estabelecimentos e produtos.
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {Object.entries(dashboard.categoryCounts).map(([type, counts]) => (
          <article
            className="rounded-3xl border border-orange-100 bg-orange-50/50 p-4"
            key={type}
          >
            <h3 className="text-base font-black text-orange-950">
              {CATEGORY_TYPE_COPY[type as AdminCategoryType]}
            </h3>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <SmallMetric label="Total" value={counts.total} />
              <SmallMetric label="Ativas" value={counts.active} />
              <SmallMetric label="Inativas" value={counts.inactive} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CustomerSummary({ dashboard }: { dashboard: AdminDashboardDto }) {
  return (
    <section
      aria-labelledby="customer-summary-heading"
      className="rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
            Clientes
          </p>
          <h2
            className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950"
            id="customer-summary-heading"
          >
            Consulta somente leitura
          </h2>
        </div>
        <Link
          className="rounded-full bg-orange-100 px-4 py-2 text-sm font-black text-orange-900 transition hover:bg-orange-200 focus:outline-none focus:ring-4 focus:ring-orange-100"
          href="/admin/clientes"
        >
          Consultar
        </Link>
      </div>

      <div className="mt-5 rounded-3xl border border-orange-100 bg-orange-50/50 p-5">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-700">
          Total de clientes
        </p>
        <p className="mt-2 text-5xl font-black tracking-[-0.06em] text-orange-950">
          {dashboard.customerCounts.total}
        </p>
        {dashboard.customerCounts.total === 0 ? (
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">
            Ainda não há contas de consumidor cadastradas.
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {Object.entries(dashboard.customerCounts.byStatus).map(
          ([status, count]) => (
            <SmallMetric
              key={status}
              label={USER_STATUS_COPY[status as AdminUserStatus]}
              value={count}
            />
          ),
        )}
      </div>
    </section>
  );
}

function RecentPendingPanel({ dashboard }: { dashboard: AdminDashboardDto }) {
  return (
    <section
      aria-labelledby="recent-pending-heading"
      className="rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
            Aprovação
          </p>
          <h2
            className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950"
            id="recent-pending-heading"
          >
            Pendentes recentes
          </h2>
        </div>
        <span className="rounded-full border border-orange-100 bg-orange-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-orange-800">
          Até 5 lojas
        </span>
      </div>

      {dashboard.recentPendingEstablishments.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">
          Nenhum estabelecimento pendente no momento. Novas lojas cadastradas
          por comerciantes aparecerão aqui antes da aprovação.
        </p>
      ) : (
        <div className="mt-5 grid gap-3">
          {dashboard.recentPendingEstablishments.map((establishment) => (
            <article
              className="rounded-3xl border border-amber-100 bg-amber-50/60 p-4"
              key={establishment.id}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-black text-orange-950">
                    {establishment.name}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    Responsável: {establishment.owner.name} · {establishment.owner.email}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {establishment.city ?? "Cidade não informada"}
                    {establishment.state ? `/${establishment.state}` : ""} · {" "}
                    {establishment.category?.name ?? "sem categoria"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <StatusBadge label="Pendente" tone="warning" />
                  <StatusBadge
                    label={formatDate(establishment.createdAt)}
                    tone="neutral"
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function MetricCard({
  className,
  description,
  label,
  value,
}: {
  className: string;
  description: string;
  label: string;
  value: number;
}) {
  return (
    <article className={["rounded-3xl border p-5", className].join(" ")}>
      <p className="text-sm font-black uppercase tracking-[0.2em] opacity-75">
        {label}
      </p>
      <p className="mt-4 text-5xl font-black tracking-[-0.06em]">{value}</p>
      <p className="mt-2 text-sm font-semibold leading-6 opacity-75">
        {description}
      </p>
    </article>
  );
}

function SmallMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-orange-100 bg-white px-3 py-3 text-center shadow-sm shadow-orange-950/5">
      <p className="text-2xl font-black tracking-[-0.04em] text-orange-950">
        {value}
      </p>
      <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-orange-700">
        {label}
      </p>
    </div>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "warning";
}) {
  const className =
    tone === "warning"
      ? "border-amber-200 bg-amber-100 text-amber-950"
      : "border-slate-200 bg-white text-slate-700";

  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em]",
        className,
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}
