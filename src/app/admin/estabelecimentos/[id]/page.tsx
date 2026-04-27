import Link from "next/link";
import type { Metadata } from "next";

import { FeedbackState } from "@/components/ui/feedback-state";
import { requireAdminPageSession } from "@/modules/admin/auth";
import { establishmentService } from "@/modules/establishments/service";
import type {
  EstablishmentDetailDto,
  EstablishmentStatusValue,
} from "@/modules/establishments/service-core";

import { EstablishmentStatusForms } from "../establishment-status-forms";
import { ESTABLISHMENT_STATUS_COPY } from "../page-helpers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Detalhe do estabelecimento",
  description:
    "Consulta administrativa segura de estabelecimento e responsável.",
};

type AdminEstablishmentDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

export default async function AdminEstablishmentDetailPage({
  params,
}: AdminEstablishmentDetailPageProps) {
  const { id } = await params;
  await requireAdminPageSession(
    `/admin/estabelecimentos/${encodeURIComponent(id)}`,
  );

  const establishment = await establishmentService.getById({ id });

  if (!establishment.ok) {
    if (establishment.code === "NOT_FOUND") {
      return (
        <FeedbackState
          action={<BackLink />}
          description="O registro solicitado não foi encontrado ou já não está disponível para consulta administrativa."
          title="Estabelecimento não encontrado"
          tone="empty"
        />
      );
    }

    return (
      <FeedbackState
        action={<BackLink />}
        description={establishment.message}
        title="Detalhe indisponível"
        tone="error"
      />
    );
  }

  return <EstablishmentDetailContent establishment={establishment.data} />;
}

function EstablishmentDetailContent({
  establishment,
}: {
  establishment: EstablishmentDetailDto;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-orange-100 bg-orange-950 p-6 text-white shadow-xl shadow-orange-950/15">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-200">
              Detalhe de estabelecimento
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.055em] sm:text-5xl">
              {establishment.name}
            </h2>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-orange-50">
              {establishment.description ??
                "Sem descrição cadastrada pelo comerciante."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <StatusBadge status={establishment.status} />
            <BackLink variant="hero" />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.84fr]">
        <div className="space-y-5">
          <InfoPanel title="Dados da loja" eyebrow="Estabelecimento">
            <InfoGrid>
              <InfoItem label="Nome" value={establishment.name} />
              <InfoItem label="Slug" value={establishment.slug} />
              <InfoItem
                label="Categoria"
                value={establishment.category?.name ?? "Sem categoria"}
              />
              <InfoItem
                label="Categoria ativa"
                value={establishment.category?.isActive ? "Sim" : "Não"}
              />
              <InfoItem
                label="Criado em"
                value={formatDate(establishment.createdAt)}
              />
              <InfoItem
                label="Atualizado em"
                value={formatDate(establishment.updatedAt)}
              />
            </InfoGrid>
          </InfoPanel>

          <InfoPanel title="Contato e endereço" eyebrow="Operação">
            <InfoGrid>
              <InfoItem
                label="Telefone da loja"
                value={establishment.phone ?? "Não informado"}
              />
              <InfoItem
                label="WhatsApp"
                value={establishment.whatsapp ?? "Não informado"}
              />
              <InfoItem
                label="Endereço"
                value={establishment.addressLine1 ?? "Não informado"}
              />
              <InfoItem
                label="Complemento"
                value={establishment.addressLine2 ?? "Não informado"}
              />
              <InfoItem label="Cidade" value={establishment.city ?? "Não informada"} />
              <InfoItem label="Estado" value={establishment.state ?? "Não informado"} />
              <InfoItem label="CEP" value={establishment.postalCode ?? "Não informado"} />
              <InfoItem
                label="Taxa de entrega"
                value={formatCurrency(establishment.deliveryFee)}
              />
              <InfoItem
                label="Pedido mínimo"
                value={formatCurrency(establishment.minimumOrder)}
              />
            </InfoGrid>
          </InfoPanel>
        </div>

        <div className="space-y-5">
          <InfoPanel title="Responsável" eyebrow="Comerciante">
            <InfoGrid>
              <InfoItem label="Nome" value={establishment.owner.name} />
              <InfoItem label="E-mail" value={establishment.owner.email} />
              <InfoItem
                label="Telefone"
                value={establishment.owner.phone ?? "Não informado"}
              />
              <InfoItem label="Perfil" value={establishment.owner.role} />
              <InfoItem label="Status da conta" value={establishment.owner.status} />
            </InfoGrid>
          </InfoPanel>

          <EstablishmentStatusForms
            establishmentId={establishment.id}
            status={establishment.status}
          />
        </div>
      </section>
    </div>
  );
}

function InfoPanel({
  children,
  eyebrow,
  title,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950">
        {title}
      </h3>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function InfoGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>;
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
      <dt className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-bold leading-6 text-slate-800">
        {value}
      </dd>
    </div>
  );
}

function StatusBadge({ status }: { status: EstablishmentStatusValue }) {
  const copy = ESTABLISHMENT_STATUS_COPY[status];

  return (
    <span
      className={[
        "inline-flex rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.16em]",
        copy.className,
      ].join(" ")}
    >
      {copy.label}
    </span>
  );
}

function BackLink({ variant = "plain" }: { variant?: "hero" | "plain" }) {
  const className =
    variant === "hero"
      ? "inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white transition hover:bg-white/20 focus:outline-none focus:ring-4 focus:ring-orange-200"
      : "inline-flex rounded-full border border-orange-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-orange-950 shadow-sm shadow-orange-950/5 transition hover:border-orange-400 hover:bg-orange-50 focus:outline-none focus:ring-4 focus:ring-orange-100";

  return (
    <Link
      className={className}
      href="/admin/estabelecimentos"
    >
      Voltar para lista
    </Link>
  );
}

function formatDate(value: Date) {
  return dateFormatter.format(value);
}

function formatCurrency(value: string) {
  return currencyFormatter.format(Number(value));
}
