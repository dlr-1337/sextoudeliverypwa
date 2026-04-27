import Link from "next/link";
import type { Metadata } from "next";

import { Container } from "@/components/ui/container";

import { RegistrationFooter, RegistrationForms } from "./registration-forms";

export const metadata: Metadata = {
  title: "Cadastro",
  description:
    "Cadastro de consumidores e estabelecimentos no Sextou Delivery.",
};

export default function CadastroPage() {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden py-6 sm:py-10">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(251,146,60,0.26),transparent_32%),linear-gradient(135deg,rgba(255,247,237,0.97),rgba(255,255,255,0.9)_52%,rgba(254,243,199,0.78))]" />
      <div className="absolute left-[-5rem] top-28 -z-10 h-72 w-72 rounded-full bg-orange-300/20 blur-3xl" />

      <Container className="space-y-7">
        <nav className="flex items-center justify-between rounded-full border border-orange-200/70 bg-white/75 px-4 py-3 shadow-sm shadow-orange-950/5 backdrop-blur">
          <Link className="flex items-center gap-3" href="/">
            <span className="grid size-10 place-items-center rounded-full bg-orange-500 text-lg font-black text-white shadow-lg shadow-orange-500/30">
              S
            </span>
            <span className="text-sm font-black uppercase tracking-[0.24em] text-orange-950">
              Sextou Delivery
            </span>
          </Link>
          <Link className="text-sm font-black text-orange-700 underline-offset-4 hover:underline" href="/login">
            Entrar
          </Link>
        </nav>

        <section className="max-w-3xl space-y-4">
          <p className="w-fit rounded-full bg-orange-100 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-orange-700">
            Cadastro sem atalhos de perfil
          </p>
          <h1 className="text-4xl font-black tracking-[-0.06em] text-orange-950 sm:text-5xl lg:text-6xl">
            Escolha o fluxo certo; o servidor define o papel da conta.
          </h1>
          <p className="text-base leading-8 text-slate-700">
            Consumidores entram direto na conta. Estabelecimentos nascem como
            pendentes de aprovação para a administração liberar depois.
          </p>
        </section>

        <RegistrationForms />
        <RegistrationFooter />
      </Container>
    </main>
  );
}
