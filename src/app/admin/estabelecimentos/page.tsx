import Link from "next/link";
import type { Metadata } from "next";

import { FeedbackState } from "@/components/ui/feedback-state";
import { requireAdminPageSession } from "@/modules/admin/auth";
import { establishmentService } from "@/modules/establishments/service";
import type {
  EstablishmentListItemDto,
  EstablishmentStatusValue,
} from "@/modules/establishments/service-core";

import { EstablishmentStatusForms } from "./establishment-status-forms";
import {
  ESTABLISHMENT_STATUS_COPY,
  ESTABLISHMENT_STATUS_VALUES,
  getEstablishmentEmptyState,
  getEstablishmentListTitle,
  parseAdminEstablishmentStatusFilter,
} from "./page-helpers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Estabelecimentos administrativos",
  description:
    "Listagem administrativa de estabelecimentos para aprovação e operação de status.",
};

type AdminEstablishmentsPageProps = {
  searchParams: Promise<{
    status?: string | string[];
  }>;
};

const LIST_LIMIT = 50;

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function AdminEstablishmentsPage({
  searchParams,
}: AdminEstablishmentsPageProps) {
  await requireAdminPageSession("/admin/estabelecimentos");

  const params = await searchParams;
  const parsedStatus = parseAdminEstablishmentStatusFilter(params.status);
  const status = parsedStatus.valid ? parsedStatus.status : undefined;
  const establishments = await establishmentService.list({
    ...(status ? { status } : {}),
    limit: LIST_LIMIT,
  });

  if (!establishments.ok) {
    return (
      <FeedbackState
        description={establishments.message}
        title="Estabelecimentos indisponíveis"
        tone="error"
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-orange-100 bg-orange-950 p-6 text-white shadow-xl shadow-orange-950/15">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-200">
          Aprovação de estabelecimentos
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_0.72fr] lg:items-end">
          <h2 className="text-3xl font-black tracking-[-0.055em] sm:text-5xl">
            Consulte lojas cadastradas por comerciantes e opere status com
            segurança.
          </h2>
          <p className="rounded-2xl border border-white/15 bg-white/10 p-4 text-sm font-semibold leading-6 text-orange-50">
            Exibindo até {LIST_LIMIT} registros por filtro, ordenados por
            criação, nome e identificador. A tela mostra apenas campos seguros
            de loja, categoria e responsável.
          </p>
        </div>
      </section>

      <StatusTabs currentStatus={status} />

      {!parsedStatus.valid ? (
        <FeedbackState
          description="O filtro informado não corresponde a um status administrativo válido. A lista abaixo mostra todos os estabelecimentos sem reutilizar o valor inválido."
          title="Filtro de status ignorado"
          tone="error"
        />
      ) : null}

      <section
        aria-labelledby="establishment-list-heading"
        className="rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
              Estabelecimentos
            </p>
            <h2
              className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950"
              id="establishment-list-heading"
            >
              {getEstablishmentListTitle(status)}
            </h2>
          </div>
          <span className="rounded-full border border-orange-100 bg-orange-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-orange-800">
            {establishments.data.length}/{LIST_LIMIT} exibidos
          </span>
        </div>

        {establishments.data.length === 0 ? (
          <div className="mt-5">
            <FeedbackState
              description={getEstablishmentEmptyState(status).description}
              title={getEstablishmentEmptyState(status).title}
              tone="empty"
            />
          </div>
        ) : (
          <div className="mt-5 grid gap-4">
            {establishments.data.map((establishment) => (
              <EstablishmentCard
                establishment={establishment}
                key={establishment.id}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusTabs({
  currentStatus,
}: {
  currentStatus?: EstablishmentStatusValue;
}) {
  return (
    <nav
      aria-label="Filtros de status de estabelecimento"
      className="flex flex-wrap gap-2 rounded-[1.75rem] border border-orange-100 bg-white p-3 shadow-sm shadow-orange-950/5"
    >
      <StatusTab active={!currentStatus} href="/admin/estabelecimentos" label="Todos" />
      {ESTABLISHMENT_STATUS_VALUES.map((status) => (
        <StatusTab
          active={currentStatus === status}
          href={`/admin/estabelecimentos?status=${status}`}
          key={status}
          label={ESTABLISHMENT_STATUS_COPY[status].pluralLabel}
        />
      ))}
    </nav>
  );
}

function StatusTab({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={[
        "rounded-full border px-4 py-2 text-sm font-black shadow-sm shadow-orange-950/5 transition focus:outline-none focus:ring-4 focus:ring-orange-100",
        active
          ? "border-orange-600 bg-orange-600 text-white"
          : "border-orange-200 bg-white text-orange-950 hover:border-orange-400 hover:bg-orange-50",
      ].join(" ")}
      href={href}
    >
      {label}
    </Link>
  );
}

function EstablishmentCard({
  establishment,
}: {
  establishment: EstablishmentListItemDto;
}) {
  return (
    <article className="rounded-3xl border border-orange-100 bg-orange-50/50 p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.78fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-black tracking-[-0.03em] text-orange-950">
              {establishment.name}
            </h3>
            <StatusBadge status={establishment.status} />
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
            Responsável: {establishment.owner.name} · {establishment.owner.email}
            {establishment.owner.phone ? ` · ${establishment.owner.phone}` : ""}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Categoria: {establishment.category?.name ?? "sem categoria"} · {" "}
            {establishment.city ?? "cidade não informada"}
            {establishment.state ? `/${establishment.state}` : ""}
          </p>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-orange-700">
            Criado em {formatDate(establishment.createdAt)} · atualizado em {" "}
            {formatDate(establishment.updatedAt)}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              className="rounded-full bg-orange-950 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-orange-950/15 transition hover:bg-orange-900 focus:outline-none focus:ring-4 focus:ring-orange-100"
              href={`/admin/estabelecimentos/${encodeURIComponent(establishment.id)}`}
            >
              Consultar detalhes
            </Link>
          </div>
        </div>

        <EstablishmentStatusForms
          compact
          establishmentId={establishment.id}
          status={establishment.status}
        />
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: EstablishmentStatusValue }) {
  const copy = ESTABLISHMENT_STATUS_COPY[status];

  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em]",
        copy.className,
      ].join(" ")}
    >
      {copy.label}
    </span>
  );
}

function formatDate(value: Date) {
  return dateFormatter.format(value);
}
