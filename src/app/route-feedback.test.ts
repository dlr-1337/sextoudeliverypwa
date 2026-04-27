import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fallbackFiles = {
  rootError: "src/app/error.tsx",
  notFound: "src/app/not-found.tsx",
  adminLoading: "src/app/admin/loading.tsx",
} as const;

const fallbackSources = Object.fromEntries(
  Object.entries(fallbackFiles).map(([key, path]) => [
    key,
    readFileSync(path, "utf8"),
  ]),
) as Record<keyof typeof fallbackFiles, string>;

const unsafeRootErrorDetailPatterns = [
  { label: "raw error message", pattern: /error\.message/u },
  { label: "stack trace", pattern: /\.stack\b/u },
  { label: "Next internal digest", pattern: /\bdigest\b/u },
  { label: "database URL", pattern: /DATABASE_URL/u },
  { label: "auth secret", pattern: /AUTH_SECRET/u },
  { label: "environment access", pattern: /process\.env/u },
] as const;

const serverOnlyImportPatterns = [
  { label: "auth modules", pattern: /@\/modules\/auth/u },
  { label: "admin server modules", pattern: /@\/modules\/admin/u },
  { label: "database module", pattern: /@\/server\/db/u },
  { label: "Next headers", pattern: /next\/headers/u },
  { label: "Next navigation redirects", pattern: /next\/navigation/u },
  { label: "Prisma runtime", pattern: /@prisma|Prisma/u },
  { label: "cookie helpers", pattern: /\bcookies\b/u },
] as const;

function expectNavigation(source: string, paths: readonly string[]) {
  for (const path of paths) {
    expect(source, `expected safe navigation to ${path}`).toContain(
      `href="${path}"`,
    );
  }
}

describe("App Router route fallback feedback states", () => {
  it("keeps the root error boundary as a safe client component", () => {
    expect(fallbackSources.rootError).toMatch(/^"use client";/u);
    expect(fallbackSources.rootError).toContain("reset");
    expect(fallbackSources.rootError).toContain("onClick={reset}");
    expect(fallbackSources.rootError).toContain("Algo não saiu como esperado");
    expect(fallbackSources.rootError).toContain("Nenhum detalhe técnico");
    expectNavigation(fallbackSources.rootError, ["/", "/lojas", "/login"]);

    for (const { label, pattern } of unsafeRootErrorDetailPatterns) {
      expect(fallbackSources.rootError, label).not.toMatch(pattern);
    }
  });

  it("uses shared feedback and layout primitives in every fallback", () => {
    for (const [name, source] of Object.entries(fallbackSources)) {
      expect(source, `${name} should import Container`).toContain(
        'import { Container } from "@/components/ui/container";',
      );
      expect(source, `${name} should import FeedbackState`).toContain(
        'import { FeedbackState } from "@/components/ui/feedback-state";',
      );
      expect(source, `${name} should render Container`).toContain("<Container");
      expect(source, `${name} should render FeedbackState`).toContain(
        "<FeedbackState",
      );
    }
  });

  it("renders a non-enumerating Portuguese not-found state with safe navigation", () => {
    expect(fallbackSources.notFound).toContain("Página não encontrada");
    expect(fallbackSources.notFound).toContain("caminhos públicos e seguros");
    expectNavigation(fallbackSources.notFound, ["/", "/lojas", "/login"]);
    expect(fallbackSources.notFound).not.toMatch(/estabelecimento|produto|admin/iu);
  });

  it("keeps admin loading as a pure UI shell without private imports", () => {
    expect(fallbackSources.adminLoading).toContain(
      "Carregando área administrativa",
    );
    expect(fallbackSources.adminLoading).toContain(
      "validando a sessão administrativa",
    );
    expect(fallbackSources.adminLoading).toContain('tone="loading"');

    for (const { label, pattern } of serverOnlyImportPatterns) {
      expect(fallbackSources.adminLoading, label).not.toMatch(pattern);
    }
  });
});
