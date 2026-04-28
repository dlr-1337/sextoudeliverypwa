import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import { readSessionCookieValue } from "@/modules/auth/cookies";
import { requireCustomerSession } from "@/modules/auth/guards";
import { resolveAuthErrorRedirect } from "@/modules/auth/navigation";

import { CheckoutForm } from "./checkout-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  description:
    "Revise o carrinho e crie pedidos com dinheiro, PIX ou cartão fake/dev no Sextou Delivery.",
};

export default async function CheckoutPage() {
  const auth = await getCheckoutAuthOrRedirect();

  return (
    <main className="relative isolate min-h-dvh overflow-hidden py-6 sm:py-10">
      <CheckoutBackdrop />
      <Container className="space-y-7">
        <CheckoutHeader />

        <section className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <article className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-6 shadow-xl shadow-orange-950/10 backdrop-blur sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
              Checkout protegido
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.055em] text-orange-950 sm:text-5xl">
              Revise seu carrinho antes de enviar.
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              Esta etapa valida sessão CUSTOMER, dados de contato, entrega e a
              forma de pagamento escolhida. Ao enviar, o servidor recalcula
              valores e disponibilidade antes de criar o pedido; dinheiro fica
              manual na entrega, enquanto PIX e cartão iniciam pagamento online
              fake/dev sem coletar dados de cartão nesta página.
            </p>
            <div className="mt-6 grid gap-3 rounded-3xl border border-orange-100 bg-orange-50/75 p-4 text-sm font-bold text-orange-950">
              <span>Cliente autenticado: {auth.user.name}</span>
              <span>Dinheiro: pagamento manual na entrega.</span>
              <span>PIX e cartão: iniciação online fake/dev pendente.</span>
            </div>
          </article>

          <CheckoutForm
            customerDefaults={{
              name: auth.user.name,
              phone: auth.user.phone ?? "",
            }}
          />
        </section>
      </Container>
    </main>
  );
}

async function getCheckoutAuthOrRedirect() {
  try {
    const sessionToken = await readSessionCookieValue();

    return await requireCustomerSession(sessionToken);
  } catch (error) {
    redirect(resolveAuthErrorRedirect(error, "/checkout"));
  }
}

function CheckoutHeader() {
  return (
    <nav
      aria-label="Navegação do checkout"
      className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-orange-200/70 bg-white/80 px-4 py-3 shadow-sm shadow-orange-950/5 backdrop-blur"
    >
      <Link className="flex items-center gap-3 focus:outline-none focus:ring-4 focus:ring-orange-100" href="/">
        <span className="grid size-10 place-items-center rounded-full bg-orange-500 text-lg font-black text-white shadow-lg shadow-orange-500/30">
          S
        </span>
        <span className="text-sm font-black uppercase tracking-[0.24em] text-orange-950">
          Sextou Delivery
        </span>
      </Link>
      <Link
        className="rounded-full bg-orange-100 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-orange-800 transition hover:bg-orange-200 focus:outline-none focus:ring-4 focus:ring-orange-100"
        href="/lojas"
      >
        Voltar às lojas
      </Link>
    </nav>
  );
}

function CheckoutBackdrop() {
  return (
    <>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.24),transparent_34%),linear-gradient(135deg,rgba(255,247,237,0.96),rgba(255,255,255,0.9)_48%,rgba(254,243,199,0.74))]" />
      <div className="absolute right-[-6rem] top-24 -z-10 h-72 w-72 rounded-full bg-orange-300/25 blur-3xl" />
      <div className="absolute bottom-[-8rem] left-[-4rem] -z-10 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl" />
    </>
  );
}
