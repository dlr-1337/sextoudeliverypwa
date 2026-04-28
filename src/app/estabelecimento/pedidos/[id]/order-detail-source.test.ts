import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const merchantOrderDetailPageSource = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8",
);
const merchantOrderStatusActionsSource = readFileSync(
  fileURLToPath(new URL("./order-status-actions.tsx", import.meta.url)),
  "utf8",
);

const forbiddenRouteImports = [
  { label: "database module", pattern: /@\/server\/db/u },
  { label: "Prisma runtime", pattern: /@prisma|Prisma/u },
  { label: "Next headers", pattern: /next\/headers/u },
  { label: "cookies", pattern: /cookies\(/u },
  { label: "notFound helper", pattern: /notFound\(/u },
  { label: "Server Action directive", pattern: /["']use server["']/u },
] as const;

const forbiddenPrivateFragments = [
  "customerId",
  "establishmentId",
  "productId",
  "changedById",
  "providerPayload",
  "providerPaymentId",
  "providerStatus",
  "pixQrCode",
  "pixCopyPaste",
  "cardBrand",
  "cardLast4",
  "DATABASE_URL",
  "AUTH_SECRET",
  "SESSION_COOKIE_NAME",
] as const;

const statusActionLabels = [
  "Aceitar pedido",
  "Iniciar preparo",
  "Saiu para entrega",
  "Marcar como entregue",
  "Recusar pedido",
  "Cancelar pedido",
] as const;

const statusActionPendingLabels = [
  "Aceitando pedido",
  "Iniciando preparo",
  "Marcando saída para entrega",
  "Marcando como entregue",
  "Recusando pedido",
  "Cancelando pedido",
] as const;

describe("merchant order detail route source boundaries", () => {
  it("keeps the dynamic route protected by the MERCHANT guard before detail data loading", () => {
    expect(merchantOrderDetailPageSource).toContain(
      'export const dynamic = "force-dynamic"',
    );
    expect(merchantOrderDetailPageSource).toContain("export const metadata");
    expect(merchantOrderDetailPageSource).toContain("params: Promise<{");
    expect(merchantOrderDetailPageSource).toContain("id: string;");
    expect(merchantOrderDetailPageSource).toContain(
      "const auth = await requireMerchantPageSession();",
    );
    expect(merchantOrderDetailPageSource).toContain(
      "const state = await loadMerchantOrderDetail(auth.user.id, id);",
    );

    for (const { label, pattern } of forbiddenRouteImports) {
      expect(merchantOrderDetailPageSource, label).not.toMatch(pattern);
    }
  });

  it("uses only the owner-scoped order service seam and no URL authority for ownership", () => {
    expect(merchantOrderDetailPageSource).toContain(
      "orderService.getMerchantOrderDetailForOwner",
    );
    expect(merchantOrderDetailPageSource).toContain(
      "orderService.getMerchantOrderDetailForOwner(\n      ownerId,\n      orderId,\n    )",
    );
    expect(merchantOrderDetailPageSource).toContain("auth.user.id");
    expect(merchantOrderDetailPageSource).not.toMatch(/searchParams/u);
    expect(merchantOrderDetailPageSource).not.toMatch(
      /params\.(owner|store|establishment)/u,
    );
    expect(merchantOrderDetailPageSource).not.toMatch(
      /ownerId:\s*id|establishmentId:\s*id/u,
    );
  });

  it("maps unsafe and unavailable outcomes to raw-value-free route states", () => {
    for (const expectedFragment of [
      'status: "found"',
      'status: "not-found"',
      'status: "unavailable"',
      "isSafeMissingOrderCode(result.code)",
      'code === "INVALID_ORDER"',
      'code === "ORDER_NOT_FOUND"',
      'code === "ESTABLISHMENT_NOT_FOUND"',
      "catch {",
      "Pedido não encontrado",
      "Pedidos indisponíveis",
      "FeedbackState",
    ]) {
      expect(merchantOrderDetailPageSource).toContain(expectedFragment);
    }

    expect(merchantOrderDetailPageSource).not.toContain("result.message");
    expect(merchantOrderDetailPageSource).not.toMatch(/error\.message|\.stack/u);
    expect(merchantOrderDetailPageSource).not.toMatch(/P20\d\d|SQL|DATABASE_URL/u);
    expect(merchantOrderDetailPageSource).not.toContain("Pedido {id}");
  });

  it("renders the required operational sections with display helpers", () => {
    for (const expectedFragment of [
      "Container",
      "Link",
      "getMerchantOrderStatusCopy(order.status)",
      "getOrderStatusLabel(order.status)",
      "formatPublicOrderDateTime(order.timestamps.updatedAt)",
      "Cliente e contato",
      "Entrega e referência",
      "Observações do pedido",
      "Snapshots dos itens",
      "Pagamento e conferência",
      "Totais do pedido",
      "Histórico do status",
      "formatPublicOrderMoney(item.total)",
      "getPaymentMethodLabel(paymentMethod)",
      "getPaymentStatusLabel(paymentStatus)",
      "formatOptionalText(order.delivery.reference)",
      "formatOptionalText(order.observation.customer)",
      "formatOptionalText(order.observation.internal)",
    ]) {
      expect(merchantOrderDetailPageSource).toContain(expectedFragment);
    }
  });

  it("wires the status action panel through server-derived targets without making the page a mutation boundary", () => {
    for (const expectedFragment of [
      "OrderStatusActions",
      "MERCHANT_ORDER_TRANSITION_NOTE_MAX_LENGTH",
      "getAllowedMerchantOrderTransitionTargets",
      "orderId={id}",
      "orderId={orderId}",
      "currentStatus={order.status}",
      "noteMaxLength={MERCHANT_ORDER_TRANSITION_NOTE_MAX_LENGTH}",
      "targets={[...getAllowedMerchantOrderTransitionTargets(order.status)]}",
    ]) {
      expect(merchantOrderDetailPageSource).toContain(expectedFragment);
    }

    expect(merchantOrderDetailPageSource).not.toMatch(
      /<form|useActionState|useFormStatus|formAction|transitionMerchantOrderStatusAction/u,
    );
  });

  it("keeps presence and absence states for items, payment and history while moving mutations into the client boundary", () => {
    for (const expectedFragment of [
      "items.length === 0",
      "Itens indisponíveis",
      "order.payment",
      "Pagamento registrado para conferência operacional.",
      "Pagamento sem lançamento dedicado",
      "history.length === 0",
      "Histórico sem eventos disponíveis",
    ]) {
      expect(merchantOrderDetailPageSource).toContain(expectedFragment);
    }
  });

  it("uses public tracking and inbox links while keeping internal ids out of visible copy", () => {
    expect(merchantOrderDetailPageSource).toContain(
      'href="/estabelecimento/pedidos"',
    );
    expect(merchantOrderDetailPageSource).toContain(
      "href={`/pedido/${encodeURIComponent(order.publicCode)}`}",
    );
    expect(merchantOrderDetailPageSource).toContain("Pedido {order.publicCode}");
    expect(merchantOrderDetailPageSource).toContain(
      "Código público: {order.publicCode}",
    );
    expect(merchantOrderDetailPageSource).not.toContain("order.id");
    expect(merchantOrderDetailPageSource).not.toMatch(/>\s*\{id\}\s*</u);
    expect(merchantOrderDetailPageSource).not.toContain("encodeURIComponent(id)");
  });

  it("does not include provider fields, env keys or raw diagnostic fragments", () => {
    for (const forbiddenFragment of forbiddenPrivateFragments) {
      expect(merchantOrderDetailPageSource).not.toContain(forbiddenFragment);
      expect(merchantOrderStatusActionsSource).not.toContain(forbiddenFragment);
    }

    expect(merchantOrderDetailPageSource).not.toMatch(/provider|gateway|secret/u);
    expect(merchantOrderStatusActionsSource).not.toMatch(/provider|gateway|secret/u);
    expect(merchantOrderDetailPageSource).not.toMatch(/raw |SQL|stack trace/u);
    expect(merchantOrderStatusActionsSource).not.toMatch(/raw |SQL|stack trace/u);
  });
});

describe("merchant order status action client boundary", () => {
  it("submits only the allowed S03 transition fields through the merchant Server Action", () => {
    for (const expectedFragment of [
      '"use client"',
      "useActionState(",
      "useFormStatus",
      "useRouter",
      "transitionMerchantOrderStatusAction",
      "MERCHANT_ORDER_TRANSITION_ACTION_IDLE_STATE",
      "name=\"orderId\"",
      "name=\"expectedStatus\"",
      "name=\"targetStatus\"",
      "value={target}",
      "name=\"note\"",
      "maxLength={noteMaxLength}",
    ]) {
      expect(merchantOrderStatusActionsSource).toContain(expectedFragment);
    }

    for (const forbiddenField of [
      "ownerId",
      "establishmentId",
      "changedById",
      "publicCode",
      "acceptedAt",
      "updatedAt",
      "statusAuthority",
    ]) {
      expect(merchantOrderStatusActionsSource).not.toContain(`name=\"${forbiddenField}\"`);
    }

    expect(merchantOrderStatusActionsSource).not.toContain(
      "getAllowedMerchantOrderTransitionTargets",
    );
    expect(merchantOrderStatusActionsSource).not.toContain(
      "ALLOWED_MERCHANT_ORDER_TRANSITIONS",
    );
  });

  it("renders deterministic accessible labels, pending labels, terminal copy and live feedback", () => {
    for (const label of statusActionLabels) {
      expect(merchantOrderStatusActionsSource).toContain(label);
    }

    for (const pendingLabel of statusActionPendingLabels) {
      expect(merchantOrderStatusActionsSource).toContain(pendingLabel);
    }

    for (const expectedFragment of [
      "TERMINAL_STATUS_MESSAGE",
      "targets.length === 0",
      'role="status"',
      'role={isError ? "alert" : "status"}',
      'aria-live={isError ? "assertive" : "polite"}',
      'disabled={pending}',
      'data?.get("targetStatus") === target',
      'aria-label="Ações de status disponíveis"',
      "GENERIC_ACTION_FAILURE_MESSAGE",
    ]) {
      expect(merchantOrderStatusActionsSource).toContain(expectedFragment);
    }
  });

  it("refreshes the current route after success without exposing raw action payloads", () => {
    for (const expectedFragment of [
      'state.status !== "success"',
      "handledSuccessKeyRef",
      "router.refresh()",
      "getOrderStatusLabel(state.currentStatus)",
    ]) {
      expect(merchantOrderStatusActionsSource).toContain(expectedFragment);
    }

    expect(merchantOrderStatusActionsSource).not.toContain("state.publicCode");
    expect(merchantOrderStatusActionsSource).not.toContain("JSON.stringify(state)");
  });
});
