import Link from "next/link";
import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import { logoutAction } from "@/modules/auth/actions";
import { requireAdminPageSession } from "@/modules/admin/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s | Admin Sextou",
  },
  description: "Área administrativa protegida do Sextou Delivery.",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requireAdminPageSession("/admin");

  return (
    <main className="relative isolate min-h-dvh overflow-hidden py-5 sm:py-8">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-orange-950 focus:px-4 focus:py-2 focus:text-sm focus:font-black focus:text-white"
        href="#admin-content"
      >
        Pular para conteúdo administrativo
      </a>
      <PrivateBackdrop />
      <Container className="space-y-6">
        <AdminHeader
          adminName={auth.user.name}
          adminStatus={auth.user.status}
        />
        <section
          aria-label="Conteúdo administrativo"
          className="rounded-[2rem] border border-orange-200/70 bg-white/62 p-3 shadow-2xl shadow-orange-950/10 backdrop-blur sm:p-5"
          id="admin-content"
          tabIndex={-1}
        >
          {children}
        </section>
      </Container>
    </main>
  );
}

function AdminHeader({
  adminName,
  adminStatus,
}: {
  adminName: string;
  adminStatus: string;
}) {
  return (
    <header className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-4 shadow-xl shadow-orange-950/10 backdrop-blur">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link
            className="grid size-12 place-items-center rounded-full bg-orange-600 text-lg font-black text-white shadow-lg shadow-orange-600/30 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-200"
            href="/"
            aria-label="Ir para início do Sextou Delivery"
          >
            S
          </Link>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
              Administração
            </p>
            <h1 className="text-2xl font-black tracking-[-0.045em] text-orange-950 sm:text-3xl">
              Central Sextou
            </h1>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="rounded-2xl border border-orange-100 bg-orange-50/75 px-4 py-3 text-sm text-orange-950">
            <span className="block text-xs font-black uppercase tracking-[0.2em] text-orange-700">
              Sessão admin
            </span>
            <span className="font-black">{adminName}</span>
            <span className="mx-2 text-orange-300" aria-hidden="true">
              /
            </span>
            <span>{adminStatus}</span>
          </div>
          <form action={logoutAction}>
            <button
              className="rounded-2xl bg-orange-950 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-orange-950/15 transition hover:bg-orange-900 focus:outline-none focus:ring-4 focus:ring-orange-200"
              type="submit"
            >
              Sair
            </button>
          </form>
        </div>
      </div>

      <nav
        aria-label="Navegação administrativa"
        className="mt-5 flex flex-wrap gap-2"
      >
        <AdminNavLink href="/admin" label="Dashboard" />
        <AdminNavLink href="/admin/categorias" label="Categorias" />
        <AdminNavLink href="/admin/clientes" label="Clientes" />
        <AdminNavLink href="/admin/estabelecimentos" label="Estabelecimentos" />
      </nav>
    </header>
  );
}

function AdminNavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-black text-orange-950 shadow-sm shadow-orange-950/5 transition hover:border-orange-400 hover:bg-orange-50 focus:outline-none focus:ring-4 focus:ring-orange-100"
      href={href}
    >
      {label}
    </Link>
  );
}

function PrivateBackdrop() {
  return (
    <>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.26),transparent_32rem),radial-gradient(circle_at_bottom_right,rgba(234,88,12,0.16),transparent_26rem),linear-gradient(135deg,rgba(255,247,237,0.98),rgba(255,255,255,0.9)_48%,rgba(254,243,199,0.76))]" />
      <div className="absolute right-[-7rem] top-20 -z-10 h-72 w-72 rounded-full bg-orange-300/25 blur-3xl" />
      <div className="absolute bottom-[-8rem] left-[-6rem] -z-10 h-80 w-80 rounded-full bg-amber-200/30 blur-3xl" />
    </>
  );
}
