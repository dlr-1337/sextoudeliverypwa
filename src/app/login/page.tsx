import Link from "next/link";
import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import { FeedbackState } from "@/components/ui/feedback-state";
import { parseSafeRelativeRedirect } from "@/modules/auth/schemas";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Login seguro por e-mail e senha no Sextou Delivery.",
};

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const nextPath = parseSafeRelativeRedirect(firstParam(params.next));
  const sessionExpired = firstParam(params.erro) === "sessao";
  const loggedOut = firstParam(params.saida) === "ok";

  return (
    <main className="relative isolate min-h-dvh overflow-hidden py-6 sm:py-10">
      <AuthBackdrop />
      <Container className="grid min-h-[calc(100dvh-3rem)] items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-5">
          <Link className="inline-flex items-center gap-3" href="/">
            <span className="grid size-11 place-items-center rounded-full bg-orange-500 text-lg font-black text-white shadow-lg shadow-orange-500/30">
              S
            </span>
            <span className="text-sm font-black uppercase tracking-[0.24em] text-orange-950">
              Sextou Delivery
            </span>
          </Link>
          <div className="rounded-[2rem] border border-white/70 bg-white/70 p-6 shadow-xl shadow-orange-950/10 backdrop-blur">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
              Sessão segura
            </p>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] text-orange-950 sm:text-5xl">
              Um login, três áreas, nenhuma permissão no cliente.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              O Sextou valida credenciais, sessão e perfil no servidor antes de
              abrir admin, conta de consumidor ou painel de estabelecimento.
            </p>
          </div>
          {sessionExpired ? (
            <FeedbackState
              description="Sua sessão não está ativa. Entre novamente para continuar."
              title="Faça login novamente"
              tone="error"
            />
          ) : null}
          {loggedOut ? (
            <FeedbackState
              description="Sua sessão foi encerrada neste dispositivo."
              title="Logout concluído"
              tone="empty"
            />
          ) : null}
        </section>
        <LoginForm nextPath={nextPath} />
      </Container>
    </main>
  );
}

function AuthBackdrop() {
  return (
    <>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.28),transparent_34%),linear-gradient(135deg,rgba(255,247,237,0.97),rgba(255,255,255,0.9)_48%,rgba(254,243,199,0.78))]" />
      <div className="absolute right-[-6rem] top-16 -z-10 h-72 w-72 rounded-full bg-orange-300/25 blur-3xl" />
      <div className="absolute bottom-[-8rem] left-[-4rem] -z-10 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl" />
    </>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
