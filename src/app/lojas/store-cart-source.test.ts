import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const storeCartSource = readFileSync(
  "src/app/lojas/[slug]/store-cart.tsx",
  "utf8",
);
const storePageSource = readFileSync("src/app/lojas/[slug]/page.tsx", "utf8");

const forbiddenClientImports = [
  { label: "catalog service", pattern: /@\/modules\/catalog\/service["']/u },
  { label: "database module", pattern: /@\/server\/db/u },
  { label: "Prisma runtime", pattern: /@prisma|Prisma/u },
  { label: "Next headers", pattern: /next\/headers/u },
  { label: "auth modules", pattern: /@\/modules\/auth/u },
  {
    label: "order action modules",
    pattern: /@\/modules\/orders\/(?:actions|action-core|action-state)|submitCheckoutAction/u,
  },
] as const;

describe("public store cart client island", () => {
  it("keeps catalog fetching server-side and browser APIs inside the client island", () => {
    expect(storeCartSource.startsWith('"use client";')).toBe(true);
    expect(storePageSource).toContain(
      'import { StoreCart } from "./store-cart";',
    );
    expect(storePageSource).toContain("catalogService.getActiveStoreCatalog");
    expect(storePageSource).not.toContain("localStorage");

    expect(storeCartSource).toContain("useEffect(() =>");
    expect(storeCartSource).toContain("window.localStorage.getItem");
    expect(storeCartSource).toContain("window.localStorage.setItem");
    expect(storeCartSource).toContain("window.localStorage.removeItem");
  });

  it("uses type-only catalog DTO imports and avoids server-only modules in the client bundle", () => {
    expect(storeCartSource).toContain("import type {");
    expect(storeCartSource).toContain(
      '} from "@/modules/catalog/service-core";',
    );

    for (const { label, pattern } of forbiddenClientImports) {
      expect(storeCartSource, label).not.toMatch(pattern);
    }
  });

  it("exposes a checkout CTA only for a hydrated current-store cart", () => {
    expect(storeCartSource).toContain('import Link from "next/link";');
    expect(storeCartSource).toContain("canCheckoutCurrentStoreCart");
    expect(storeCartSource).toContain(
      "hasHydrated && cart !== null && cart.store.establishmentId === catalog.id",
    );
    expect(storeCartSource).toContain("canCheckoutCurrentStoreCart ? (");
    expect(storeCartSource).toContain('href="/checkout"');
    expect(storeCartSource).toContain("Revisar entrega e pagamento");
    expect(storeCartSource).not.toContain('router.push("/checkout")');
    expect(storeCartSource).not.toContain("window.location");
  });

  it("exposes observable cart recovery, persistence, and cross-store feedback", () => {
    for (const expectedFragment of [
      "CART_STORAGE_KEY",
      "parseStoredCart",
      "serializeCart",
      "addCartItem",
      "replaceCartWithItem",
      "updateCartItemQuantity",
      "removeCartItem",
      "clearCart",
      "window.confirm",
      'role="status"',
      'role="alert"',
      "Carrinho anterior foi mantido.",
      "Não foi possível salvar o carrinho neste navegador.",
    ]) {
      expect(storeCartSource).toContain(expectedFragment);
    }
  });
});
