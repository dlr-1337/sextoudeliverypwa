import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const orderTrackingPageSource = readFileSync(
  "src/app/pedido/[publicCode]/page.tsx",
  "utf8",
);
const checkoutPageSource = readFileSync("src/app/checkout/page.tsx", "utf8");

const forbiddenRouteImports = [
  { label: "auth modules", pattern: /@\/modules\/auth/u },
  { label: "database module", pattern: /@\/server\/db/u },
  { label: "Prisma runtime", pattern: /@prisma|Prisma/u },
  { label: "Next headers", pattern: /next\/headers/u },
  { label: "cookies", pattern: /cookies\(/u },
  { label: "notFound helper", pattern: /notFound\(/u },
] as const;

const forbiddenPrivateFragments = [
  "customerId",
  "customerName",
  "customerPhone",
  "deliveryAddress",
  "deliveryStreet",
  "deliveryNumber",
  "deliveryNeighborhood",
  "deliveryPostalCode",
  "changedById",
  "productId",
  "provider",
  "providerPayload",
  "providerPaymentId",
  "pixQrCode",
  "pixCopyPaste",
  "cardBrand",
  "cardLast4",
  "DATABASE_URL",
  "AUTH_SECRET",
] as const;

describe("public order tracking route source boundaries", () => {
  it("keeps the route dynamic, public and backed only by the public-code service seam", () => {
    expect(orderTrackingPageSource).toContain('export const dynamic = "force-dynamic"');
    expect(orderTrackingPageSource).toContain("export const metadata");
    expect(orderTrackingPageSource).toContain("params: Promise<{");
    expect(orderTrackingPageSource).toContain("publicCode: string");
    expect(orderTrackingPageSource).toContain("orderService.getPublicOrderByCode(publicCode)");
    expect(orderTrackingPageSource).toContain("loadPublicOrder(publicCode)");

    for (const { label, pattern } of forbiddenRouteImports) {
      expect(orderTrackingPageSource, label).not.toMatch(pattern);
    }
  });

  it("uses a safe loader discriminated union with catch-all unavailable state", () => {
    for (const expectedFragment of [
      'status: "found"',
      'status: "not-found"',
      'status: "unavailable"',
      "try {",
      "catch {",
      "return order ?",
      "PublicOrderUnavailableState",
      "Acompanhamento indisponível",
      "Pedido não encontrado",
    ]) {
      expect(orderTrackingPageSource).toContain(expectedFragment);
    }

    expect(orderTrackingPageSource).not.toContain("error.message");
    expect(orderTrackingPageSource).not.toContain(".stack");
    expect(orderTrackingPageSource).not.toContain("P2002");
  });

  it("renders the canonical public tracking sections with display helpers", () => {
    for (const expectedFragment of [
      "Container",
      "FeedbackState",
      "getOrderStatusLabel",
      "getPaymentMethodLabel",
      "getPaymentStatusLabel",
      "getManualCashPaymentDescription",
      "formatPublicOrderMoney",
      "formatPublicOrderDateTime",
      "Código do pedido",
      "Status do pedido",
      "Histórico do pedido",
      "Itens do pedido",
      "Totais",
      "Pagamento em dinheiro",
      "Linha do tempo pública",
      "Sem observação pública",
      'href={`/lojas/${order.establishment.slug}`}',
      'href="/lojas"',
      'href="/checkout"',
    ]) {
      expect(orderTrackingPageSource).toContain(expectedFragment);
    }
  });

  it("does not render private customer fields, provider state, internal ids, env keys or raw error details", () => {
    for (const forbiddenFragment of forbiddenPrivateFragments) {
      expect(orderTrackingPageSource).not.toContain(forbiddenFragment);
    }

    expect(orderTrackingPageSource).not.toMatch(/error\.message|\.stack/u);
    expect(orderTrackingPageSource).not.toMatch(/qr|last4|gateway/u);
  });

  it("keeps checkout copy aligned with real CASH order creation", () => {
    expect(checkoutPageSource).toContain("servidor recalcula valores");
    expect(checkoutPageSource).toContain("criar o pedido CASH");

    for (const staleFragment of [
      "O pedido ainda não é criado",
      "valores do carrinho local são apenas uma estimativa",
      "Nenhum pedido foi criado ainda",
      "/confirmacao",
    ]) {
      expect(checkoutPageSource).not.toContain(staleFragment);
    }
  });
});
