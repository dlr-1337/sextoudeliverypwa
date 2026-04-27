import type { Metadata } from "next";

import { FeedbackState } from "@/components/ui/feedback-state";
import { requireAdminPageSession } from "@/modules/admin/auth";
import { adminService } from "@/modules/admin/service";
import type {
  AdminCustomerListDto,
  AdminCustomerListItemDto,
  AdminUserStatus,
} from "@/modules/admin/service-core";

export const metadata: Metadata = {
  title: "Clientes administrativos",
  description: "Consulta administrativa somente leitura de clientes.",
};

const USER_STATUS_COPY: Record<
  AdminUserStatus,
  { label: string; className: string }
> = {
  ACTIVE: {
    label: "Ativo",
    className: "border-lime-200 bg-lime-100 text-lime-950",
  },
  INVITED: {
    label: "Convidado",
    className: "border-amber-200 bg-amber-100 text-amber-950",
  },
  SUSPENDED: {
    label: "Suspenso",
    className: "border-rose-200 bg-rose-100 text-rose-950",
  },
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function AdminCustomersPage() {
  await requireAdminPageSession("/admin/clientes");

  const customers = await adminService.listCustomers();

  if (!customers.ok) {
    return (
      <FeedbackState
        description={customers.message}
        title="Clientes indisponíveis"
        tone="error"
      />
    );
  }

  return <CustomersContent lookup={customers.data} />;
}

function CustomersContent({ lookup }: { lookup: AdminCustomerListDto }) {
  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-orange-100 bg-orange-950 p-6 text-white shadow-xl shadow-orange-950/15">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-200">
          Clientes
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_0.7fr] lg:items-end">
          <h2 className="text-3xl font-black tracking-[-0.055em] sm:text-5xl">
            Consulta segura, sem controles de mutação.
          </h2>
          <p className="rounded-2xl border border-white/15 bg-white/10 p-4 text-sm font-semibold leading-6 text-orange-50">
            {lookup.total} cliente{lookup.total === 1 ? "" : "s"} no total.
            Esta tela mostra até {lookup.limit} registros recentes com campos de
            contato seguros.
          </p>
        </div>
      </section>

      {lookup.customers.length === 0 ? (
        <FeedbackState
          description="Nenhuma conta de consumidor foi cadastrada ainda. Quando clientes criarem conta, nome, e-mail, telefone e status aparecerão aqui."
          title="Nenhum cliente encontrado"
          tone="empty"
        />
      ) : (
        <section
          aria-labelledby="customer-list-heading"
          className="rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
                Lookup
              </p>
              <h2
                className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950"
                id="customer-list-heading"
              >
                Clientes recentes
              </h2>
            </div>
            <span className="rounded-full border border-orange-100 bg-orange-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-orange-800">
              Somente leitura
            </span>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-orange-100">
            <div className="hidden grid-cols-[1.1fr_1.2fr_0.8fr_0.7fr_0.8fr] gap-3 bg-orange-50 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-orange-800 lg:grid">
              <span>Nome</span>
              <span>E-mail</span>
              <span>Telefone</span>
              <span>Status</span>
              <span>Criado em</span>
            </div>
            <div className="divide-y divide-orange-100">
              {lookup.customers.map((customer) => (
                <CustomerRow customer={customer} key={customer.id} />
              ))}
            </div>
          </div>

          {lookup.total > lookup.customers.length ? (
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
              Exibindo os {lookup.customers.length} clientes mais recentes de {" "}
              {lookup.total}. Paginação será adicionada quando o volume exigir.
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}

function CustomerRow({ customer }: { customer: AdminCustomerListItemDto }) {
  return (
    <article className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[1.1fr_1.2fr_0.8fr_0.7fr_0.8fr] lg:items-center">
      <div>
        <span className="block text-xs font-black uppercase tracking-[0.16em] text-orange-700 lg:hidden">
          Nome
        </span>
        <p className="font-black text-orange-950">{customer.name}</p>
      </div>
      <div>
        <span className="block text-xs font-black uppercase tracking-[0.16em] text-orange-700 lg:hidden">
          E-mail
        </span>
        <p className="break-all font-semibold text-slate-700">{customer.email}</p>
      </div>
      <div>
        <span className="block text-xs font-black uppercase tracking-[0.16em] text-orange-700 lg:hidden">
          Telefone
        </span>
        <p className="font-semibold text-slate-700">
          {customer.phone ?? "Não informado"}
        </p>
      </div>
      <div>
        <span className="block text-xs font-black uppercase tracking-[0.16em] text-orange-700 lg:hidden">
          Status
        </span>
        <StatusBadge status={customer.status} />
      </div>
      <div>
        <span className="block text-xs font-black uppercase tracking-[0.16em] text-orange-700 lg:hidden">
          Criado em
        </span>
        <p className="font-semibold text-slate-700">
          {formatDate(customer.createdAt)}
        </p>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: AdminUserStatus }) {
  const copy = USER_STATUS_COPY[status];

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

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}
