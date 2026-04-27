import { Container } from "@/components/ui/container";
import { FeedbackState } from "@/components/ui/feedback-state";

export default function AdminLoading() {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden py-5 sm:py-8">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.26),transparent_32rem),radial-gradient(circle_at_bottom_right,rgba(234,88,12,0.16),transparent_26rem),linear-gradient(135deg,rgba(255,247,237,0.98),rgba(255,255,255,0.9)_48%,rgba(254,243,199,0.76))]" />
      <div className="absolute right-[-7rem] top-20 -z-10 h-72 w-72 rounded-full bg-orange-300/25 blur-3xl" />
      <div className="absolute bottom-[-8rem] left-[-6rem] -z-10 h-80 w-80 rounded-full bg-amber-200/30 blur-3xl" />
      <Container className="space-y-6">
        <header className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-4 shadow-xl shadow-orange-950/10 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-orange-600 text-lg font-black text-white shadow-lg shadow-orange-600/30">
              S
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
                Administração
              </p>
              <h1 className="text-2xl font-black tracking-[-0.045em] text-orange-950 sm:text-3xl">
                Central Sextou
              </h1>
            </div>
          </div>
        </header>

        <section
          aria-label="Carregamento administrativo"
          className="rounded-[2rem] border border-orange-200/70 bg-white/62 p-3 shadow-2xl shadow-orange-950/10 backdrop-blur sm:p-5"
        >
          <FeedbackState
            description="Estamos validando a sessão administrativa e preparando os dados seguros da central."
            title="Carregando área administrativa"
            tone="loading"
          />
        </section>
      </Container>
    </main>
  );
}
