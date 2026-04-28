import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const merchantOrdersPageSource = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8",
);
const merchantDashboardSource = readFileSync(
  fileURLToPath(new URL("../page.tsx", import.meta.url)),
  "utf8",
);

const forbiddenRouteImports = [
  { label: "database module", pattern: /@\/server\/db/u },
  { label: "Prisma runtime", pattern: /@prisma|Prisma/u },
  { label: "Next headers", pattern: /next\/headers/u },
  { label: "cookies", pattern: /cookies\(/u },
] as const;

const forbiddenPrivateFragments = [
  "customerId",
  "establishmentId",
  "deliveryAddress",
  "deliveryStreet",
  "deliveryNumber",
  "deliveryNeighborhood",
  "deliveryPostalCode",
  "deliveryReference",
  "generalObservation",
  "order.items",
  "statusHistory",
  "changedById",
  "productId",
  "providerPayload",
  "providerPaymentId",
  "pixQrCode",
  "pixCopyPaste",
  "cardBrand",
  "cardLast4",
  "DATABASE_URL",
  "AUTH_SECRET",
] as const;

describe("merchant order inbox route source boundaries", () => {
  it("keeps the route dynamic and protected by the MERCHANT page guard", () => {
    expect(merchantOrdersPageSource).toContain(
      'export const dynamic = "force-dynamic"',
    );
    expect(merchantOrdersPageSource).toContain("export const metadata");
    expect(merchantOrdersPageSource).toContain("searchParams: Promise<{");
    expect(merchantOrdersPageSource).toContain("status?: string | string[]");
    expect(merchantOrdersPageSource).toContain("requireMerchantPageSession()");
    expect(merchantOrdersPageSource).toContain("auth.user.id");

    for (const { label, pattern } of forbiddenRouteImports) {
      expect(merchantOrdersPageSource, label).not.toMatch(pattern);
    }
  });

  it("uses the order service seam and never accepts owner or store authority from the query", () => {
    expect(merchantOrdersPageSource).toContain("orderService.listMerchantOrdersForOwner");
    expect(merchantOrdersPageSource).toContain(
      "orderService.listMerchantOrdersForOwner(ownerId, {",
    );
    expect(merchantOrdersPageSource).toContain("MERCHANT_ORDER_LIST_LIMIT");
    expect(merchantOrdersPageSource).toContain("limit: MERCHANT_ORDER_LIST_LIMIT");
    expect(merchantOrdersPageSource).toContain("status: parsedStatus.status");
    expect(merchantOrdersPageSource).not.toMatch(/searchParams.*owner|searchParams.*establishment/u);
    expect(merchantOrdersPageSource).not.toContain("params.owner");
    expect(merchantOrdersPageSource).not.toContain("params.establishment");
  });

  it("parses real status filters and renders safe union states", () => {
    for (const expectedFragment of [
      "parseMerchantOrderStatusFilter(statusInput)",
      'status: "invalid-filter"',
      'status: "unavailable"',
      'status: "loaded"',
      "getMerchantOrderInvalidFilterState",
      "getMerchantOrderEmptyState",
      "FeedbackState",
      "Pedidos indisponíveis",
      "catch {",
    ]) {
      expect(merchantOrdersPageSource).toContain(expectedFragment);
    }

    expect(merchantOrdersPageSource).not.toContain("error.message");
    expect(merchantOrdersPageSource).not.toContain(".stack");
    expect(merchantOrdersPageSource).not.toContain("P2002");
  });

  it("renders list-safe fields with display helpers and a bounded count", () => {
    for (const expectedFragment of [
      "Container",
      "Link",
      "MERCHANT_ORDER_STATUS_VALUES.map",
      "getMerchantOrderStatusCopy(status).pluralLabel",
      "getMerchantOrderListTitle",
      "getOrderStatusLabel(order.status)",
      "getPaymentMethodLabel(paymentMethod)",
      "getPaymentStatusLabel(paymentStatus)",
      "formatPublicOrderMoney(order.total)",
      "formatPublicOrderDateTime(orderDate)",
      "order.payment?.method ?? order.paymentMethod",
      "order.payment?.status ?? order.paymentStatus",
      "order.payment?.amount ?? order.total",
      "Exibindo {state.data.count} de até {state.data.limit}",
    ]) {
      expect(merchantOrdersPageSource).toContain(expectedFragment);
    }
  });

  it("uses the internal order id only for authenticated future detail navigation", () => {
    expect(merchantOrdersPageSource).toContain(
      'href={`/estabelecimento/pedidos/${encodeURIComponent(order.id)}`}',
    );
    expect(merchantOrdersPageSource).toContain("key={order.id}");
    expect(merchantOrdersPageSource).not.toMatch(/>\s*\{order\.id\}\s*</u);
    expect(merchantOrdersPageSource).toContain("Pedido {order.publicCode}");
    expect(merchantOrdersPageSource).toContain("formatCustomerSummary(order.customerName)");
  });

  it("does not render private detail fields, env keys or raw error details", () => {
    for (const forbiddenFragment of forbiddenPrivateFragments) {
      expect(merchantOrdersPageSource).not.toContain(forbiddenFragment);
    }

    expect(merchantOrdersPageSource).not.toMatch(/error\.message|\.stack/u);
    expect(merchantOrdersPageSource).not.toMatch(/raw |SQL|gateway|secret/u);
  });

  it("adds a focused dashboard CTA without embedding the pedidos list", () => {
    expect(merchantDashboardSource).toContain("function OrdersShortcutPanel");
    expect(merchantDashboardSource).toContain('href="/estabelecimento/pedidos"');
    expect(merchantDashboardSource).toContain("Ver pedidos");
    expect(merchantDashboardSource).toContain("painel focado em perfil e cardápio");
    expect(merchantDashboardSource).not.toContain("listMerchantOrdersForOwner");
    expect(merchantDashboardSource).not.toContain("MerchantOrderList");
  });
});
