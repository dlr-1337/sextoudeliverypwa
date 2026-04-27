import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import { FeedbackState } from "@/components/ui/feedback-state";
import { logoutAction } from "@/modules/auth/actions";
import { readSessionCookieValue } from "@/modules/auth/cookies";
import { requireCustomerSession } from "@/modules/auth/guards";
import { resolveAuthErrorRedirect } from "@/modules/auth/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Minha conta",
  description: "Área protegida do consumidor no Sextou Delivery.",
};

export default async function AccountPage() {
  const auth = await getCustomerAuthOrRedirect();

  return (
    <main className="relative isolate min-h-dvh overflow-hidden py-6 sm:py-10">
      <PrivateBackdrop />
      <Container className="space-y-7">
        <PrivateHeader eyebrow="Consumidor" title="Minha conta" />

        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-6 shadow-xl shadow-orange-950/10 backdrop-blur">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
              Sessão customer
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-orange-950 sm:text-5xl">
              Olá, {auth.user.name}.
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              A área do consumidor é renderizada apenas depois do guard
              server-side confirmar sessão ativa e perfil CUSTOMER.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <StatusPill label="Perfil" value="CUSTOMER" />
              <StatusPill label="Conta" value={auth.user.status} />
              <StatusPill label="Pedidos" value="em breve" />
            </div>
          </article>

          <div className="space-y-5">
            <FeedbackState
              description="Histórico de pedidos, favoritos e dados pessoais serão conectados nas próximas slices. O guard já bloqueia perfis incorretos."
              title="Conta protegida"
              tone="empty"
            />
            <LogoutPanel />
          </div>
        </section>
      </Container>
    </main>
  );
}

async function getCustomerAuthOrRedirect() {
  try {
    const sessionToken = await readSessionCookieValue();

    return await requireCustomerSession(sessionToken);
  } catch (error) {
    redirect(resolveAuthErrorRedirect(error, "/conta"));
  }
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

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-700">
        {label}
      </p>
      <p className="mt-2 text-sm font-black text-orange-950">{value}</p>
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
        Logout encerra a sessão no banco antes de limpar o cookie do navegador.
      </p>
      <button
        className="mt-4 rounded-2xl bg-orange-950 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:bg-orange-900"
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
