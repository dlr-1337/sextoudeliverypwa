"use client";

import Link from "next/link";

import { Container } from "@/components/ui/container";
import { FeedbackState } from "@/components/ui/feedback-state";

export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden py-6 sm:py-10">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.24),transparent_34%),linear-gradient(135deg,rgba(255,247,237,0.96),rgba(255,255,255,0.9)_48%,rgba(254,243,199,0.74))]" />
      <Container className="grid min-h-[calc(100dvh-3rem)] place-items-center">
        <section className="w-full max-w-2xl space-y-5 rounded-[2rem] border border-orange-200/75 bg-white/90 p-6 shadow-2xl shadow-orange-950/10 backdrop-blur sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-orange-600 text-lg font-black text-white shadow-lg shadow-orange-600/30">
              S
            </span>
            <span className="text-sm font-black uppercase tracking-[0.24em] text-orange-950">
              Sextou Delivery
            </span>
          </div>

          <FeedbackState
            action={
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-2xl bg-orange-600 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-200"
                  onClick={reset}
                  type="button"
                >
                  Tentar novamente
                </button>
                <Link
                  className="rounded-2xl border border-orange-200 bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-orange-800 transition hover:bg-orange-50 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  href="/lojas"
                >
                  Ver lojas
                </Link>
                <Link
                  className="rounded-2xl border border-orange-200 bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-orange-800 transition hover:bg-orange-50 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  href="/login"
                >
                  Entrar
                </Link>
                <Link
                  className="rounded-2xl border border-orange-200 bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-orange-800 transition hover:bg-orange-50 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  href="/"
                >
                  Início
                </Link>
              </div>
            }
            description="Não conseguimos concluir esta tela agora. Nenhum detalhe técnico foi exibido; tente novamente ou escolha um caminho seguro."
            title="Algo não saiu como esperado"
            tone="error"
          />
        </section>
      </Container>
    </main>
  );
}
