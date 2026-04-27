import { Container } from "@/components/ui/container";
import { FeedbackState } from "@/components/ui/feedback-state";

export default function StoreCatalogLoading() {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden py-6 sm:py-10">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.24),transparent_34%),linear-gradient(135deg,rgba(255,247,237,0.96),rgba(255,255,255,0.9)_48%,rgba(254,243,199,0.74))]" />
      <Container className="space-y-5">
        <div className="rounded-full border border-orange-200/70 bg-white/80 px-4 py-3 shadow-sm shadow-orange-950/5 backdrop-blur">
          <p className="text-sm font-black uppercase tracking-[0.24em] text-orange-950">
            Sextou Delivery · Catálogo
          </p>
        </div>
        <FeedbackState
          description="Estamos carregando somente a loja ativa e os produtos ativos deste catálogo público."
          title="Carregando catálogo da loja"
          tone="loading"
        />
      </Container>
    </main>
  );
}
