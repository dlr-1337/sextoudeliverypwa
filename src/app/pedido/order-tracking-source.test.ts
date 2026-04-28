import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const orderTrackingPageSource = readFileSync(
  "src/app/pedido/[publicCode]/page.tsx",
  "utf8",
);
const checkoutPageSource = readFileSync("src/app/checkout/page.tsx", "utf8");

const forbiddenRouteImports = [
  { label: "auth modules", pattern: /@\/modules\/(auth|merchant\/auth)/u },
  { label: "database module", pattern: /@\/server\/db/u },
  { label: "Prisma runtime", pattern: /@prisma|Prisma/u },
  { label: "Next headers", pattern: /next\/headers/u },
  { label: "cookies", pattern: /cookies\(/u },
  { label: "notFound helper", pattern: /notFound\(/u },
  { label: "Server Action directive", pattern: /["']use server["']/u },
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
    expect(orderTrackingPageSource).toContain(
      "orderService.getPublicOrderByCode(publicCode)",
    );
    expect(orderTrackingPageSource).toContain("loadPublicOrder(publicCode)");

    for (const { label, pattern } of forbiddenRouteImports) {
      expect(orderTrackingPageSource, label).not.toMatch(pattern);
    }

    for (const forbiddenFragment of [
      "requireMerchantPageSession",
      "requireMerchantSession",
      "requireCustomerSession",
      "readSessionCookie",
      "transitionMerchantOrderStatusAction",
      "useActionState",
      "useFormStatus",
      "revalidatePath",
      "router.refresh()",
      "<form",
    ]) {
      expect(orderTrackingPageSource).not.toContain(forbiddenFragment);
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
      "getPublicPaymentSummaryCopy",
      "formatPublicOrderMoney",
      "formatPublicOrderDateTime",
      "Código do pedido",
      "Status do pedido",
      "Histórico do pedido",
      "Itens do pedido",
      "Totais",
      "paymentCopy.eyebrow",
      "paymentCopy.heading",
      "paymentCopy.description",
      "paymentCopy.action",
      "Linha do tempo pública",
      "Sem observação pública",
      'href={`/lojas/${order.establishment.slug}`}',
      'href="/lojas"',
      'href="/checkout"',
    ]) {
      expect(orderTrackingPageSource).toContain(expectedFragment);
    }
  });

  it("renders only safe public payment instructions for pending Pix and card states", () => {
    for (const expectedFragment of [
      "PaymentInstructions",
      "order.payment?.instructions ?? null",
      "isPendingOnlinePayment(paymentMethod, paymentStatus)",
      'paymentStatus === "PENDING"',
      'paymentMethod === "PIX"',
      'paymentMethod === "CARD"',
      "Instruções para Pix",
      "Código Pix copia e cola",
      "Dados do QR Pix",
      "instructions.copyPaste",
      "instructions.qrCode",
      "formatPublicOrderDateTime(instructions.expiresAt)",
      "Checkout seguro do cartão",
      "instructions.checkoutUrl",
      'rel="noopener noreferrer"',
      'target="_blank"',
      "Abrir checkout seguro em nova aba",
      "Instruções de pagamento indisponíveis",
      "Não conseguimos exibir instruções públicas seguras",
    ]) {
      expect(orderTrackingPageSource).toContain(expectedFragment);
    }

    for (const forbiddenFragment of [
      "<form",
      "cardNumber",
      "cardholder",
      "cvc",
      "cvv",
      "expiry",
      "expiration",
      "token",
      "pixQrCode",
      "pixCopyPaste",
    ]) {
      expect(orderTrackingPageSource).not.toContain(forbiddenFragment);
    }
  });

  it("keeps status history display safe, redacted and backed by public DTO fields only", () => {
    for (const expectedFragment of [
      "OrderTimeline history={order.statusHistory}",
      "history: PublicOrderStatusHistoryDto[]",
      "history.length === 0",
      "history.map((event, index) => (",
      "getOrderStatusLabel(event.status)",
      "formatPublicOrderDateTime(event.createdAt)",
      "event.note?.trim() || \"Sem observação pública para este evento.\"",
    ]) {
      expect(orderTrackingPageSource).toContain(expectedFragment);
    }

    expect(orderTrackingPageSource).not.toContain("event.changedById");
    expect(orderTrackingPageSource).not.toContain("event.ownerId");
    expect(orderTrackingPageSource).not.toContain("event.provider");
    expect(orderTrackingPageSource).not.toContain("event.raw");
  });

  it("does not render private customer fields, provider state, internal ids, env keys or raw error details", () => {
    for (const forbiddenFragment of forbiddenPrivateFragments) {
      expect(orderTrackingPageSource).not.toContain(forbiddenFragment);
    }

    expect(orderTrackingPageSource).not.toMatch(/error\.message|\.stack/u);
    expect(orderTrackingPageSource).not.toMatch(/last4|gateway/u);
    expect(orderTrackingPageSource).not.toMatch(
      /cardNumber|cardholder|cvc|cvv|expiry|expiration|token/u,
    );
  });

  it("keeps checkout copy aligned with real CASH, PIX and CARD order creation", () => {
    expect(checkoutPageSource).toContain("servidor recalcula");
    expect(checkoutPageSource).toContain("valores e disponibilidade");
    expect(checkoutPageSource).toContain("dinheiro fica");
    expect(checkoutPageSource).toContain("PIX e cartão iniciam pagamento online");
    expect(checkoutPageSource).toContain("sem coletar dados de cartão");

    for (const staleFragment of [
      "criar o pedido CASH",
      "PIX e cartão aparecem como indisponíveis",
      "O pedido ainda não é criado",
      "valores do carrinho local são apenas uma estimativa",
      "Nenhum pedido foi criado ainda",
      "/confirmacao",
    ]) {
      expect(checkoutPageSource).not.toContain(staleFragment);
    }
  });
});
