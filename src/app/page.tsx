import Link from "next/link";

import { Container } from "@/components/ui/container";
import { FeedbackState } from "@/components/ui/feedback-state";

const platformAreas = [
  {
    title: "Consumidor",
    description: "catálogo público com lojas aprovadas e produtos ativos para consulta no PWA.",
  },
  {
    title: "Estabelecimento",
    description: "perfil operacional, produtos e fotos com ownership seguro.",
  },
  {
    title: "Admin",
    description: "aprovação de lojas, categorias gerais e controle manual da operação.",
  },
];

const setupSignals = [
  "Catálogo público em /lojas",
  "Login, cadastro e sessões seguras",
  "Painel do estabelecimento com produtos e fotos",
  "Prisma/PostgreSQL com seed idempotente",
];

const quickLinks = [
  {
    href: "/lojas",
    label: "Ver lojas ativas",
    variant: "primary",
  },
  {
    href: "/login",
    label: "Entrar",
    variant: "secondary",
  },
  {
    href: "/cadastro",
    label: "Criar conta",
    variant: "secondary",
  },
  {
    href: "/estabelecimento",
    label: "Área do estabelecimento",
    variant: "secondary",
  },
] as const;

export default function Home() {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden py-6 sm:py-10">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.24),transparent_34%),linear-gradient(135deg,rgba(255,247,237,0.96),rgba(255,255,255,0.88)_48%,rgba(254,243,199,0.74))]" />
      <div className="absolute left-1/2 top-10 -z-10 h-64 w-64 -translate-x-1/2 rounded-full bg-orange-300/20 blur-3xl" />

      <Container className="space-y-10">
        <nav
          aria-label="Identidade do produto"
          className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-orange-200/70 bg-white/75 px-4 py-3 shadow-sm shadow-orange-950/5 backdrop-blur"
        >
          <a href="#inicio" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-orange-500 text-lg font-black text-white shadow-lg shadow-orange-500/30">
              S
            </span>
            <span className="text-sm font-black uppercase tracking-[0.24em] text-orange-950">
              Sextou Delivery
            </span>
          </a>
          <Link
            className="rounded-full bg-lime-100 px-4 py-2 text-xs font-bold text-lime-800 transition hover:bg-lime-200 focus:outline-none focus:ring-4 focus:ring-lime-100"
            href="/lojas"
          >
            Lojas ativas
          </Link>
        </nav>

        <section
          id="inicio"
          className="grid gap-8 rounded-[2rem] border border-orange-200/70 bg-white/80 p-5 shadow-2xl shadow-orange-950/10 backdrop-blur md:grid-cols-[1.2fr_0.8fr] md:p-8 lg:p-10"
        >
          <div className="flex flex-col justify-center gap-7">
            <p className="w-fit rounded-full bg-orange-100 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-orange-700">
              PWA de delivery local
            </p>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-4xl font-black tracking-[-0.06em] text-orange-950 sm:text-5xl lg:text-7xl">
                Encontre lojas ativas e acompanhe a base do Sextou evoluir com
                segurança.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-slate-700 sm:text-lg">
                Esta fundação já conecta autenticação, aprovação de lojas, uploads
                de imagens e catálogo público ativo. Carrinho, pedidos e pagamentos
                continuam fora desta entrega e entram nas próximas slices.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {quickLinks.map((link) => (
                <Link
                  className={
                    link.variant === "primary"
                      ? "inline-flex rounded-full bg-orange-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100"
                      : "inline-flex rounded-full border border-orange-200 bg-white px-5 py-3 text-sm font-black text-orange-900 shadow-sm shadow-orange-950/5 transition hover:border-orange-300 hover:bg-orange-50 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  }
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {setupSignals.map((signal) => (
                <div
                  className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4 text-sm font-semibold text-orange-950"
                  key={signal}
                >
                  {signal}
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-[1.75rem] bg-orange-950 p-5 text-white shadow-xl shadow-orange-950/25 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.32em] text-orange-200">
              Catálogo público
            </p>
            <h2 className="mt-4 text-2xl font-black tracking-tight">
              Lojas e produtos ativos, sem expor dados privados.
            </h2>
            <p className="mt-4 text-sm leading-7 text-orange-100">
              A vitrine pública lista apenas estabelecimentos aprovados e produtos
              ativos. Comerciantes continuam gerenciando produtos e fotos pelo
              painel privado.
            </p>
            <Link
              className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm font-black text-orange-950 shadow-sm shadow-orange-950/10 transition hover:bg-orange-100 focus:outline-none focus:ring-4 focus:ring-white/30"
              href="/lojas"
            >
              Abrir catálogo
            </Link>
          </aside>
        </section>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Áreas do MVP">
          {platformAreas.map((area) => (
            <article
              className="rounded-3xl border border-slate-200/80 bg-white/75 p-5 shadow-sm shadow-slate-950/5 backdrop-blur"
              key={area.title}
            >
              <p className="text-sm font-black uppercase tracking-[0.2em] text-orange-600">
                {area.title}
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-700">
                {area.description}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-3" aria-label="Estados de feedback">
          <FeedbackState
            tone="loading"
            title="Carregando dados operacionais"
            description="Use este estado enquanto listas e painéis privados buscam informações reais no servidor."
          />
          <FeedbackState
            tone="empty"
            title="Nada cadastrado ainda"
            description="Explique o próximo passo em português antes de mostrar uma tabela vazia ou um card sem ação."
          />
          <FeedbackState
            tone="error"
            title="Não foi possível concluir"
            description="Falhas de validação, conexão ou permissão devem aparecer de forma explícita e sem vazar segredos."
          />
        </section>
      </Container>
    </main>
  );
}
