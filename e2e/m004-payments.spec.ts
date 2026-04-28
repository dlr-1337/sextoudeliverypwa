import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

import {
  expect,
  test,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
} from "@playwright/test";

import { CART_STORAGE_KEY } from "../src/modules/cart/local-storage";
import { PAYMENT_GATEWAY_PROVIDER_FAKE_DEV } from "../src/modules/payments/types";
import {
  createFakeDevPaymentWebhookSignature,
  FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_HEADER,
  FAKE_DEV_PAYMENT_WEBHOOK_TIMESTAMP_HEADER,
  type FakeDevPaymentWebhookEventStatus,
} from "../src/modules/payments/webhook";

type OnlinePaymentMethod = "PIX" | "CARD";
type TerminalPaymentStatus = "PAID" | "FAILED" | "CANCELED";

type BrowserFixture = {
  storeSlug: string;
  storeName: string;
  productName: string;
  productPrice: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  internalIds: {
    customerId: string;
    merchantUserId: string;
    establishmentId: string;
    productId: string;
  };
};

type CheckoutPrivateValues = {
  customerPassword: string;
  deliveryStreet: string;
  deliveryNumber: string;
  deliveryComplement: string;
  deliveryNeighborhood: string;
  deliveryPostalCode: string;
  deliveryReference: string;
  generalObservation: string;
};

type PendingPaymentResult = {
  scenario: string;
  publicCode: string;
  method: OnlinePaymentMethod;
  orderStatus: string;
  orderPaymentStatus: string;
  paymentStatus: string;
  provider: typeof PAYMENT_GATEWAY_PROVIDER_FAKE_DEV;
  providerStatus: string;
  providerCorrelation: {
    providerPaymentId: string;
  };
  storeMatchesFixture: boolean;
  customerMatchesFixture: boolean;
  itemProductMatchesFixture: boolean;
  itemProductNameMatchesFixture: boolean;
  itemQuantity: number | null;
  orderTotalCents: number | null;
  paymentAmountCents: number | null;
  providerPayloadNull: boolean;
  instructions:
    | {
        method: "PIX";
        qrCodePresent: boolean;
        copyPastePresent: boolean;
        expiresAtSet: boolean;
        checkoutUrlPresent: false;
      }
    | {
        method: "CARD";
        checkoutUrlPresent: boolean;
        pixFieldsNull: boolean;
      };
  publicTrackingMatches: boolean;
  publicTrackingInstructionsPresent: boolean;
  publicDtoRedactionSafe: boolean;
};

type TerminalPaymentSummary = {
  scenario: string;
  publicCode: string;
  method: OnlinePaymentMethod;
  expectedPaymentStatus: TerminalPaymentStatus;
  orderStatus: string;
  orderPaymentStatus: string;
  paymentStatus: string;
  providerStatus: string | null;
  providerPaymentIdPresent: boolean;
  storeMatchesFixture: boolean;
  customerMatchesFixture: boolean;
  itemProductMatchesFixture: boolean;
  itemProductNameMatchesFixture: boolean;
  itemQuantity: number | null;
  orderTotalCents: number | null;
  paymentAmountCents: number | null;
  providerPayloadNull: boolean;
  paidAtSet: boolean;
  failedAtSet: boolean;
  terminalTimestampsMatchStatus: boolean;
  publicTrackingMatches: boolean;
  publicTrackingInstructionsPresent: boolean;
  publicDtoRedactionSafe: boolean;
};

type BrowserDiagnostics = ReturnType<typeof monitorBrowserDiagnostics>;
type RedactionSet = Set<string>;

type WebhookPostResult = {
  changed: boolean;
  paymentStatus: TerminalPaymentStatus;
  publicCode: string;
  revalidated: boolean;
};

const HELPER_PATH = "e2e/m004-payments.e2e-helper.ts";
const TSX_CLI_PATH = "node_modules/tsx/dist/cli.mjs";

const M004_E2E_REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "SESSION_COOKIE_NAME",
  "SESSION_MAX_AGE_DAYS",
  "FAKE_PAYMENT_PROVIDER",
  "FAKE_PAYMENT_WEBHOOK_SECRET",
  "FAKE_PAYMENT_APPROVAL_MODE",
] as const;

const terminalCopy = {
  PIX: {
    PAID: {
      heading: "Pix confirmado",
      paymentStatusLabel: "Pago",
      hiddenInstructionTexts: [
        "Instruções para Pix",
        "Código Pix copia e cola",
        "Dados do QR Pix",
      ],
      instructionAriaLabel: "Instruções para pagamento via Pix",
    },
  },
  CARD: {
    FAILED: {
      heading: "Cartão não aprovado",
      paymentStatusLabel: "Pagamento não aprovado",
      hiddenInstructionTexts: [
        "Checkout seguro do cartão",
        "Abrir checkout seguro em nova aba",
      ],
      instructionAriaLabel: "Instruções para pagamento por cartão",
    },
  },
} as const;

test.describe.configure({ mode: "serial" });

test.describe("M004 Chromium checkout, webhook and public tracking", () => {
  test("approves a PIX checkout through the signed fake/dev webhook route", async ({
    browser,
    page,
  }) => {
    test.setTimeout(180_000);

    const env = readRequiredM004E2EEnv();
    const privateValues = createCheckoutPrivateValues("pix");
    const redactions = createRedactionSet(privateValues);
    const publicContexts: BrowserContext[] = [];

    try {
      const { fixture } = await test.step("prepare disposable PIX checkout fixture", async () =>
        runM004Helper<{ fixture: BrowserFixture }>(
          "setup",
          { customerPassword: privateValues.customerPassword },
          toRedactions(redactions),
        ),
      );
      addFixtureRedactions(redactions, fixture);

      const diagnostics = monitorBrowserDiagnostics(page, () => toRedactions(redactions));
      const publicCode = await createOnlinePaymentOrder({
        diagnostics,
        fixture,
        method: "PIX",
        page,
        privateValues,
      });

      await test.step("assert pending PIX tracking and safe instructions", async () => {
        await assertPendingPixTrackingPage(page, publicCode);
        await expect(
          readCartStorage(page),
          "cart is cleared after created PIX order",
        ).resolves.toBeNull();
        await assertPublicPageDoesNotLeakSensitiveData(page, fixture, privateValues);
        expectNoBrowserDiagnostics(diagnostics, "pending PIX tracking");
      });

      const pending = await test.step("assert pending PIX payment state through helper", async () => {
        const { result } = await runM004Helper<{ result: PendingPaymentResult }>(
          "read-online-payment",
          {
            fixture,
            publicCode,
            expectedMethod: "PIX",
            scenario: "pix-approved",
          },
          toRedactions(redactions),
        );
        addProviderRedaction(redactions, result.providerCorrelation.providerPaymentId);
        assertPendingPaymentResult(result, fixture, publicCode, "PIX");

        return result;
      });

      await test.step("post signed approved fake/dev webhook to real route", async () => {
        const result = await postSignedFakeDevWebhook({
          page,
          publicCode,
          providerPaymentId: pending.providerCorrelation.providerPaymentId,
          secret: env.webhookSecret,
          scenario: "pix-approved",
          status: "approved",
        });

        expect(result).toEqual({
          changed: true,
          paymentStatus: "PAID",
          publicCode,
          revalidated: true,
        });
      });

      await test.step("assert terminal PIX payment state through helper", async () => {
        const { summary } = await runM004Helper<{ summary: TerminalPaymentSummary }>(
          "assert-terminal-payment",
          {
            fixture,
            publicCode,
            expectedMethod: "PIX",
            expectedPaymentStatus: "PAID",
            scenario: "pix-approved",
          },
          toRedactions(redactions),
        );

        assertTerminalPaymentSummary(summary, fixture, publicCode, "PIX", "PAID");
      });

      await test.step("reload current tracking page with terminal PIX copy and no pending instructions", async () => {
        await page.reload();
        await assertTerminalTrackingPage(page, publicCode, "PIX", "PAID");
        await assertPublicPageDoesNotLeakSensitiveData(page, fixture, privateValues, {
          providerPaymentId: pending.providerCorrelation.providerPaymentId,
        });
        expectNoBrowserDiagnostics(diagnostics, "terminal PIX tracking reload");
      });

      await test.step("open fresh public tracking context for terminal PIX copy", async () => {
        const publicContext = await browser.newContext();
        publicContexts.push(publicContext);
        const publicPage = await publicContext.newPage();
        const publicDiagnostics = monitorBrowserDiagnostics(publicPage, () =>
          toRedactions(redactions),
        );

        await publicPage.goto(`/pedido/${publicCode}`);
        await expect(publicPage).toHaveURL(new RegExp(`/pedido/${escapeRegExp(publicCode)}$`, "u"));
        await assertTerminalTrackingPage(publicPage, publicCode, "PIX", "PAID");
        await assertPublicPageDoesNotLeakSensitiveData(publicPage, fixture, privateValues, {
          providerPaymentId: pending.providerCorrelation.providerPaymentId,
        });
        expectNoBrowserDiagnostics(publicDiagnostics, "fresh terminal PIX tracking");
      });
    } finally {
      await Promise.all(publicContexts.map((context) => context.close()));
    }
  });

  test("fails a hosted-card checkout through the signed fake/dev webhook route", async ({
    browser,
    page,
  }) => {
    test.setTimeout(180_000);

    const env = readRequiredM004E2EEnv();
    const privateValues = createCheckoutPrivateValues("card");
    const redactions = createRedactionSet(privateValues);
    const publicContexts: BrowserContext[] = [];

    try {
      const { fixture } = await test.step("prepare disposable CARD checkout fixture", async () =>
        runM004Helper<{ fixture: BrowserFixture }>(
          "setup",
          { customerPassword: privateValues.customerPassword },
          toRedactions(redactions),
        ),
      );
      addFixtureRedactions(redactions, fixture);

      const diagnostics = monitorBrowserDiagnostics(page, () => toRedactions(redactions));
      const publicCode = await createOnlinePaymentOrder({
        diagnostics,
        fixture,
        method: "CARD",
        page,
        privateValues,
      });

      await test.step("assert pending hosted-card tracking without collecting card data", async () => {
        await assertPendingCardTrackingPage(page, publicCode);
        await assertNoCardCollectionFields(page);
        await expect(
          readCartStorage(page),
          "cart is cleared after created card order",
        ).resolves.toBeNull();
        await assertPublicPageDoesNotLeakSensitiveData(page, fixture, privateValues);
        expectNoBrowserDiagnostics(diagnostics, "pending CARD tracking");
      });

      const pending = await test.step("assert pending CARD payment state through helper", async () => {
        const { result } = await runM004Helper<{ result: PendingPaymentResult }>(
          "read-online-payment",
          {
            fixture,
            publicCode,
            expectedMethod: "CARD",
            scenario: "card-failed",
          },
          toRedactions(redactions),
        );
        addProviderRedaction(redactions, result.providerCorrelation.providerPaymentId);
        assertPendingPaymentResult(result, fixture, publicCode, "CARD");

        return result;
      });

      await test.step("post signed failed fake/dev webhook to real route", async () => {
        const result = await postSignedFakeDevWebhook({
          page,
          publicCode,
          providerPaymentId: pending.providerCorrelation.providerPaymentId,
          secret: env.webhookSecret,
          scenario: "card-failed",
          status: "failed",
        });

        expect(result).toEqual({
          changed: true,
          paymentStatus: "FAILED",
          publicCode,
          revalidated: true,
        });
      });

      await test.step("assert terminal CARD payment state through helper", async () => {
        const { summary } = await runM004Helper<{ summary: TerminalPaymentSummary }>(
          "assert-terminal-payment",
          {
            fixture,
            publicCode,
            expectedMethod: "CARD",
            expectedPaymentStatus: "FAILED",
            scenario: "card-failed",
          },
          toRedactions(redactions),
        );

        assertTerminalPaymentSummary(summary, fixture, publicCode, "CARD", "FAILED");
      });

      await test.step("reload current tracking page with terminal CARD copy and no pending link", async () => {
        await page.reload();
        await assertTerminalTrackingPage(page, publicCode, "CARD", "FAILED");
        await assertNoCardCollectionFields(page);
        await assertPublicPageDoesNotLeakSensitiveData(page, fixture, privateValues, {
          providerPaymentId: pending.providerCorrelation.providerPaymentId,
        });
        expectNoBrowserDiagnostics(diagnostics, "terminal CARD tracking reload");
      });

      await test.step("open fresh public tracking context for terminal CARD copy", async () => {
        const publicContext = await browser.newContext();
        publicContexts.push(publicContext);
        const publicPage = await publicContext.newPage();
        const publicDiagnostics = monitorBrowserDiagnostics(publicPage, () =>
          toRedactions(redactions),
        );

        await publicPage.goto(`/pedido/${publicCode}`);
        await expect(publicPage).toHaveURL(new RegExp(`/pedido/${escapeRegExp(publicCode)}$`, "u"));
        await assertTerminalTrackingPage(publicPage, publicCode, "CARD", "FAILED");
        await assertNoCardCollectionFields(publicPage);
        await assertPublicPageDoesNotLeakSensitiveData(publicPage, fixture, privateValues, {
          providerPaymentId: pending.providerCorrelation.providerPaymentId,
        });
        expectNoBrowserDiagnostics(publicDiagnostics, "fresh terminal CARD tracking");
      });
    } finally {
      await Promise.all(publicContexts.map((context) => context.close()));
    }
  });
});

async function createOnlinePaymentOrder({
  diagnostics,
  fixture,
  method,
  page,
  privateValues,
}: {
  diagnostics: BrowserDiagnostics;
  fixture: BrowserFixture;
  method: OnlinePaymentMethod;
  page: Page;
  privateValues: CheckoutPrivateValues;
}) {
  await test.step(`populate cart for ${method} checkout from active catalog`, async () => {
    await page.goto(`/lojas/${fixture.storeSlug}`);

    await expect(
      page.getByRole("heading", { name: fixture.storeName, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Cardápio disponível", exact: true }),
    ).toBeVisible();

    const productCard = page.getByRole("article").filter({
      has: page.getByRole("heading", {
        name: fixture.productName,
        exact: true,
      }),
    });
    await expect(productCard).toBeVisible();
    await expect(productCard.getByText(formatBRL(fixture.productPrice))).toBeVisible();

    await productCard
      .getByRole("button", {
        name: `Adicionar ${fixture.productName} ao carrinho`,
        exact: true,
      })
      .click();

    await expect(
      page.getByRole("status").filter({
        hasText: `${fixture.productName} está no carrinho.`,
      }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Itens do carrinho" })
        .getByRole("heading", { name: fixture.productName, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("No carrinho: 1")).toBeVisible();

    const checkoutLink = page.getByRole("link", {
      name: "Revisar entrega e pagamento",
      exact: true,
    });
    await expect(checkoutLink).toBeVisible();
    await checkoutLink.click();

    await expect(page).toHaveURL(/\/login\?/u);
    assertLoginRedirect(page.url(), "/checkout");
    await expect(
      page.getByRole("heading", { name: "Acesse sua área no Sextou.", exact: true }),
    ).toBeVisible();
    await expect(readCartStorage(page), "cart survives unauthenticated redirect").resolves.not.toBeNull();
    expectNoBrowserDiagnostics(diagnostics, `${method} catalog/cart redirect`);
  });

  await test.step(`log in generated CUSTOMER for ${method} checkout`, async () => {
    await page.getByLabel("E-mail", { exact: true }).fill(fixture.customerEmail);
    await page.getByLabel("Senha", { exact: true }).fill(privateValues.customerPassword);

    await Promise.all([
      page.waitForURL(/\/checkout$/u),
      page.getByRole("button", { name: "Entrar com segurança", exact: true }).click(),
    ]);

    await expect(
      page.getByRole("heading", {
        name: "Revise seu carrinho antes de enviar.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({
        hasText: "Carrinho salvo carregado para revisão.",
      }),
    ).toBeVisible();
    await expect(readCartStorage(page), "cart survives CUSTOMER login").resolves.not.toBeNull();
    expectNoBrowserDiagnostics(diagnostics, `${method} customer login`);
  });

  return test.step(`submit checkout selecting ${method}`, async () => {
    const checkoutCartItems = page.getByRole("list", {
      name: "Itens estimados do carrinho",
    });
    await expect(checkoutCartItems.getByText(fixture.productName)).toBeVisible();
    await expect(page.getByText("quantidade 1")).toBeVisible();
    await expect(
      checkoutCartItems.getByText(formatBRL(fixture.productPrice), { exact: true }).first(),
    ).toBeVisible();

    const cash = page.getByRole("radio", { name: /^Dinheiro/u });
    const pix = page.getByRole("radio", { name: /^PIX/u });
    const card = page.getByRole("radio", { name: /^Cartão/u });
    const selectedPayment = method === "PIX" ? pix : card;

    await expect(cash).toBeEnabled();
    await expect(cash).toBeChecked();
    await expect(pix).toBeEnabled();
    await expect(pix).not.toBeChecked();
    await expect(card).toBeEnabled();
    await expect(card).not.toBeChecked();

    await selectedPayment.check();
    await expect(selectedPayment).toBeChecked();
    await expect(cash).not.toBeChecked();

    await page.getByLabel("Nome para entrega", { exact: true }).fill(fixture.customerName);
    await page.getByLabel("Telefone para contato", { exact: true }).fill(fixture.customerPhone);
    await page.getByLabel("Rua", { exact: true }).fill(privateValues.deliveryStreet);
    await page.getByLabel("Número", { exact: true }).fill(privateValues.deliveryNumber);
    await page.getByLabel("Complemento", { exact: true }).fill(privateValues.deliveryComplement);
    await page.getByLabel("Bairro", { exact: true }).fill(privateValues.deliveryNeighborhood);
    await page.getByLabel("Cidade", { exact: true }).fill("São Paulo");
    await page.getByLabel("Estado", { exact: true }).fill("SP");
    await page.getByLabel("CEP", { exact: true }).fill(privateValues.deliveryPostalCode);
    await page
      .getByLabel("Ponto de referência", { exact: true })
      .fill(privateValues.deliveryReference);
    await page
      .getByLabel("Observações gerais", { exact: true })
      .fill(privateValues.generalObservation);

    await Promise.all([
      page.waitForURL(/\/pedido\/PED-[A-Z0-9-]+$/u),
      page.getByRole("button", { name: "Criar pedido", exact: true }).click(),
    ]);

    const publicCode = readPublicCodeFromUrl(page.url());
    expect(publicCode, `public order code from ${method} confirmation URL`).not.toBeNull();
    expectNoBrowserDiagnostics(diagnostics, `${method} checkout submit`);

    return publicCode as string;
  });
}

async function assertPendingPixTrackingPage(page: Page, publicCode: string) {
  await assertPublicTrackingScaffold(page, publicCode);
  await expect(
    page.getByRole("heading", { name: "Pix aguardando pagamento", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Pagamento pendente", { exact: true }).first()).toBeVisible();

  const pixInstructions = page.locator('[aria-label="Instruções para pagamento via Pix"]');
  await expect(pixInstructions).toBeVisible();
  await expect(pixInstructions.getByText("Instruções para Pix", { exact: true })).toBeVisible();
  await expect(pixInstructions.getByText("Código Pix copia e cola", { exact: true })).toBeVisible();
  await expect(pixInstructions.getByText("Dados do QR Pix", { exact: true })).toBeVisible();
  await expect(pixInstructions.getByText("FAKEDEVPIX").first()).toBeVisible();
}

async function assertPendingCardTrackingPage(page: Page, publicCode: string) {
  await assertPublicTrackingScaffold(page, publicCode);
  await expect(
    page.getByRole("heading", { name: "Cartão aguardando pagamento", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Pagamento pendente", { exact: true }).first()).toBeVisible();

  const cardInstructions = page.locator('[aria-label="Instruções para pagamento por cartão"]');
  await expect(cardInstructions).toBeVisible();
  await expect(
    cardInstructions.getByText("Checkout seguro do cartão", { exact: true }),
  ).toBeVisible();
  await expect(
    cardInstructions.getByText("Esta página não coleta dados de cartão."),
  ).toBeVisible();
  const hostedCheckoutLink = cardInstructions.getByRole("link", {
    name: "Abrir checkout seguro em nova aba",
    exact: true,
  });
  await expect(hostedCheckoutLink).toBeVisible();
  await expect(hostedCheckoutLink).toHaveAttribute(
    "href",
    /^https:\/\/fake-payments\.local\/checkout\/[^/?#]+$/u,
  );
  await expect(hostedCheckoutLink).toHaveAttribute("target", "_blank");
  await expect(hostedCheckoutLink).toHaveAttribute("rel", /noopener/u);
}

async function assertTerminalTrackingPage(
  page: Page,
  publicCode: string,
  method: "PIX",
  status: "PAID",
): Promise<void>;
async function assertTerminalTrackingPage(
  page: Page,
  publicCode: string,
  method: "CARD",
  status: "FAILED",
): Promise<void>;
async function assertTerminalTrackingPage(
  page: Page,
  publicCode: string,
  method: "PIX" | "CARD",
  status: "PAID" | "FAILED",
) {
  await assertPublicTrackingScaffold(page, publicCode);

  if (method === "PIX") {
    expect(status).toBe("PAID");
    await assertTerminalTrackingCopy(page, terminalCopy.PIX.PAID);
    return;
  }

  expect(status).toBe("FAILED");
  await assertTerminalTrackingCopy(page, terminalCopy.CARD.FAILED);
}

async function assertTerminalTrackingCopy(
  page: Page,
  copy: {
    heading: string;
    paymentStatusLabel: string;
    hiddenInstructionTexts: readonly string[];
    instructionAriaLabel: string;
  },
) {
  await expect(
    page.getByRole("heading", { name: copy.heading, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(copy.paymentStatusLabel, { exact: true }).first()).toBeVisible();
  await expect(page.locator(`[aria-label="${copy.instructionAriaLabel}"]`)).toHaveCount(0);

  for (const hiddenInstructionText of copy.hiddenInstructionTexts) {
    await expect(page.getByText(hiddenInstructionText, { exact: true })).toHaveCount(0);
  }
}

async function assertPublicTrackingScaffold(page: Page, publicCode: string) {
  await expect(
    page.getByRole("heading", { name: `Pedido ${publicCode}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Status atual: Pedido recebido", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Linha do tempo pública", exact: true }),
  ).toBeVisible();
}

function assertPendingPaymentResult(
  result: PendingPaymentResult,
  fixture: BrowserFixture,
  publicCode: string,
  method: OnlinePaymentMethod,
) {
  expect(result.scenario).toBe(method === "PIX" ? "pix-approved" : "card-failed");
  expect(result.publicCode).toBe(publicCode);
  expect(result.method).toBe(method);
  expect(result.orderStatus).toBe("PENDING");
  expect(result.orderPaymentStatus).toBe("PENDING");
  expect(result.paymentStatus).toBe("PENDING");
  expect(result.provider).toBe(PAYMENT_GATEWAY_PROVIDER_FAKE_DEV);
  expect(result.providerStatus).toBe("pending");
  expect(
    result.providerCorrelation.providerPaymentId.length,
    `${method} provider correlation id should be present for signing`,
  ).toBeGreaterThan(0);
  expect(result.storeMatchesFixture, `${method} order belongs to fixture store`).toBe(true);
  expect(result.customerMatchesFixture, `${method} order belongs to fixture customer`).toBe(true);
  expect(result.itemProductMatchesFixture, `${method} item points at fixture product`).toBe(true);
  expect(result.itemProductNameMatchesFixture, `${method} item name matches fixture`).toBe(true);
  expect(result.itemQuantity).toBe(1);
  expect(result.orderTotalCents).toBe(result.paymentAmountCents);
  expect(result.orderTotalCents).toBeGreaterThan(0);
  expect(result.orderTotalCents).toBeGreaterThanOrEqual(moneyToCents(fixture.productPrice));
  expect(result.providerPayloadNull, `${method} provider payload stays null`).toBe(true);
  expect(result.publicTrackingMatches, `${method} public DTO matches pending payment`).toBe(true);
  expect(result.publicTrackingInstructionsPresent, `${method} public DTO exposes pending instructions`).toBe(true);
  expect(result.publicDtoRedactionSafe, `${method} public DTO stays redaction-safe`).toBe(true);

  if (method === "PIX") {
    expect(result.instructions).toMatchObject({
      method: "PIX",
      qrCodePresent: true,
      copyPastePresent: true,
      expiresAtSet: true,
      checkoutUrlPresent: false,
    });
    return;
  }

  expect(result.instructions).toMatchObject({
    method: "CARD",
    checkoutUrlPresent: true,
    pixFieldsNull: true,
  });
}

function assertTerminalPaymentSummary(
  summary: TerminalPaymentSummary,
  fixture: BrowserFixture,
  publicCode: string,
  method: OnlinePaymentMethod,
  expectedPaymentStatus: TerminalPaymentStatus,
) {
  expect(summary.scenario).toBe(method === "PIX" ? "pix-approved" : "card-failed");
  expect(summary.publicCode).toBe(publicCode);
  expect(summary.method).toBe(method);
  expect(summary.expectedPaymentStatus).toBe(expectedPaymentStatus);
  expect(summary.orderStatus).toBe("PENDING");
  expect(summary.orderPaymentStatus).toBe(expectedPaymentStatus);
  expect(summary.paymentStatus).toBe(expectedPaymentStatus);
  expect(summary.providerPaymentIdPresent, `${method} terminal provider id remains present in DB`).toBe(true);
  expect(summary.storeMatchesFixture, `${method} terminal order belongs to fixture store`).toBe(true);
  expect(summary.customerMatchesFixture, `${method} terminal order belongs to fixture customer`).toBe(true);
  expect(summary.itemProductMatchesFixture, `${method} terminal item points at fixture product`).toBe(true);
  expect(summary.itemProductNameMatchesFixture, `${method} terminal item name matches fixture`).toBe(true);
  expect(summary.itemQuantity).toBe(1);
  expect(summary.orderTotalCents).toBe(summary.paymentAmountCents);
  expect(summary.orderTotalCents).toBeGreaterThan(0);
  expect(summary.orderTotalCents).toBeGreaterThanOrEqual(moneyToCents(fixture.productPrice));
  expect(summary.providerPayloadNull, `${method} terminal provider payload stays null`).toBe(true);
  expect(summary.terminalTimestampsMatchStatus, `${method} terminal timestamp matches status`).toBe(true);
  expect(summary.publicTrackingMatches, `${method} terminal public DTO matches DB`).toBe(true);
  expect(summary.publicTrackingInstructionsPresent, `${method} terminal DTO keeps safe instructions for service consumers`).toBe(true);
  expect(summary.publicDtoRedactionSafe, `${method} terminal public DTO stays redaction-safe`).toBe(true);

  if (expectedPaymentStatus === "PAID") {
    expect(summary.providerStatus).toBe("paid");
    expect(summary.paidAtSet).toBe(true);
    expect(summary.failedAtSet).toBe(false);
    return;
  }

  if (expectedPaymentStatus === "FAILED") {
    expect(summary.providerStatus).toBe("failed");
    expect(summary.paidAtSet).toBe(false);
    expect(summary.failedAtSet).toBe(true);
    return;
  }

  expect(summary.providerStatus).toBe("canceled");
  expect(summary.paidAtSet).toBe(false);
  expect(summary.failedAtSet).toBe(false);
}

async function postSignedFakeDevWebhook({
  page,
  publicCode,
  providerPaymentId,
  scenario,
  secret,
  status,
}: {
  page: Page;
  publicCode: string;
  providerPaymentId: string;
  scenario: string;
  secret: string;
  status: FakeDevPaymentWebhookEventStatus;
}): Promise<WebhookPostResult> {
  const occurredAt = new Date();
  const rawBody = JSON.stringify({
    provider: PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
    eventId: `evt_${scenario}_${randomBytes(10).toString("hex")}`,
    providerPaymentId,
    status,
    occurredAt: occurredAt.toISOString(),
  });
  const timestamp = Date.now().toString();
  const signature = createFakeDevPaymentWebhookSignature({
    rawBody,
    timestamp,
    secret,
  });
  const response = await page.request.post("/api/payments/webhooks/fake-dev", {
    data: rawBody,
    headers: {
      "content-type": "application/json",
      [FAKE_DEV_PAYMENT_WEBHOOK_SIGNATURE_HEADER]: signature,
      [FAKE_DEV_PAYMENT_WEBHOOK_TIMESTAMP_HEADER]: timestamp,
    },
    timeout: 30_000,
  });
  const body = await parseWebhookResponseBody(response.status(), response);
  const expectedPaymentStatus = paymentStatusForWebhookStatus(status);

  assertSafeWebhookSuccessBody(body, {
    changed: true,
    paymentStatus: expectedPaymentStatus,
    publicCode,
    revalidated: true,
    scenario,
    statusCode: response.status(),
  });

  return body.data;
}

async function parseWebhookResponseBody(statusCode: number, response: { json(): Promise<unknown> }) {
  try {
    return await response.json();
  } catch {
    throw new Error(
      `M004 webhook route returned malformed JSON; http=${statusCode}.`,
    );
  }
}

function assertSafeWebhookSuccessBody(
  body: unknown,
  expected: WebhookPostResult & { scenario: string; statusCode: number },
): asserts body is { ok: true; code: string; data: WebhookPostResult } {
  if (!isRecord(body)) {
    throw new Error(
      `M004 webhook ${expected.scenario} returned non-object body; http=${expected.statusCode}.`,
    );
  }

  if (
    expected.statusCode !== 200 ||
    body.ok !== true ||
    !isRecord(body.data) ||
    body.data.changed !== expected.changed ||
    body.data.paymentStatus !== expected.paymentStatus ||
    body.data.publicCode !== expected.publicCode ||
    body.data.revalidated !== expected.revalidated
  ) {
    throw new Error(
      `M004 webhook ${expected.scenario} safe response mismatch; http=${expected.statusCode}; shape=${describeWebhookBodyShape(
        body,
      )}.`,
    );
  }
}

function describeWebhookBodyShape(body: Record<string, unknown>) {
  const data = isRecord(body.data) ? body.data : null;
  const dataKeys = data ? Object.keys(data).sort().join(",") : "none";
  const ok = typeof body.ok === "boolean" ? String(body.ok) : typeof body.ok;
  const code = typeof body.code === "string" ? body.code : typeof body.code;
  const paymentStatus = data && typeof data.paymentStatus === "string"
    ? data.paymentStatus
    : data
      ? typeof data.paymentStatus
      : "none";
  const publicCode = data && typeof data.publicCode === "string" ? data.publicCode : "none";

  return `ok=${ok}; code=${code}; dataKeys=${dataKeys}; paymentStatus=${paymentStatus}; publicCode=${publicCode}`;
}

function paymentStatusForWebhookStatus(
  status: FakeDevPaymentWebhookEventStatus,
): TerminalPaymentStatus {
  switch (status) {
    case "approved":
      return "PAID";
    case "failed":
      return "FAILED";
    case "canceled":
      return "CANCELED";
  }
}

async function assertNoCardCollectionFields(page: Page) {
  await expect(
    page.locator(
      [
        'input[name*="card" i]',
        'input[name*="cvv" i]',
        'input[name*="cvc" i]',
        'input[name*="expiry" i]',
        'input[autocomplete="cc-number"]',
        'input[autocomplete="cc-csc"]',
        'input[autocomplete="cc-exp"]',
      ].join(", "),
    ),
    "public card tracking must not collect card fields",
  ).toHaveCount(0);

  const surface = await readPublicPageSurface(page);
  const forbiddenCardCollectionTexts = [
    "Número do cartão",
    "Numero do cartao",
    "Card number",
    "CVV",
    "CVC",
    "Data de validade",
    "Validade do cartão",
    "cardNumber",
    "card_number",
    "cardLast4",
    "card_last4",
    "expiry",
  ] as const;

  for (const text of forbiddenCardCollectionTexts) {
    expect(surface.includes(text), `public page does not expose card collection text ${text}`).toBe(false);
  }
}

async function assertPublicPageDoesNotLeakSensitiveData(
  page: Page,
  fixture: BrowserFixture,
  privateValues: CheckoutPrivateValues,
  options: { providerPaymentId?: string } = {},
) {
  const surface = await readPublicPageSurface(page);
  const forbiddenLiteralChecks = [
    { label: "customer password", value: privateValues.customerPassword },
    { label: "customer email", value: fixture.customerEmail },
    { label: "customer phone", value: fixture.customerPhone },
    { label: "customer id", value: fixture.internalIds.customerId },
    { label: "merchant user id", value: fixture.internalIds.merchantUserId },
    { label: "establishment id", value: fixture.internalIds.establishmentId },
    { label: "product id", value: fixture.internalIds.productId },
    { label: "delivery street", value: privateValues.deliveryStreet },
    { label: "delivery number", value: privateValues.deliveryNumber },
    { label: "delivery complement", value: privateValues.deliveryComplement },
    { label: "delivery neighborhood", value: privateValues.deliveryNeighborhood },
    { label: "delivery postal code", value: privateValues.deliveryPostalCode },
    { label: "delivery reference", value: privateValues.deliveryReference },
    { label: "customer checkout observation", value: privateValues.generalObservation },
    { label: "DATABASE_URL key", value: "DATABASE_URL" },
    { label: "AUTH_SECRET key", value: "AUTH_SECRET" },
    { label: "SESSION_COOKIE_NAME key", value: "SESSION_COOKIE_NAME" },
    { label: "SESSION_MAX_AGE_DAYS key", value: "SESSION_MAX_AGE_DAYS" },
    { label: "FAKE_PAYMENT_PROVIDER key", value: "FAKE_PAYMENT_PROVIDER" },
    { label: "FAKE_PAYMENT_WEBHOOK_SECRET key", value: "FAKE_PAYMENT_WEBHOOK_SECRET" },
    { label: "FAKE_PAYMENT_APPROVAL_MODE key", value: "FAKE_PAYMENT_APPROVAL_MODE" },
    { label: "changedById field", value: "changedById" },
    { label: "changed_by_id field", value: "changed_by_id" },
    { label: "session token field", value: "sessionToken" },
    { label: "token hash field", value: "tokenHash" },
    { label: "password hash field", value: "passwordHash" },
    { label: "provider payload camelCase", value: "providerPayload" },
    { label: "provider payload snake_case", value: "provider_payload" },
    { label: "provider payment id camelCase", value: "providerPaymentId" },
    { label: "provider payment id snake_case", value: "provider_payment_id" },
    { label: "provider status camelCase", value: "providerStatus" },
    { label: "provider status snake_case", value: "provider_status" },
    { label: "raw body field", value: "rawBody" },
    { label: "signature digest marker", value: "sha256=" },
    { label: "PIX QR code camelCase", value: "pixQrCode" },
    { label: "PIX QR code snake_case", value: "pix_qr_code" },
    { label: "PIX copy-paste camelCase", value: "pixCopyPaste" },
    { label: "PIX copy-paste snake_case", value: "pix_copy_paste" },
    { label: "card number camelCase", value: "cardNumber" },
    { label: "card number snake_case", value: "card_number" },
    { label: "card brand camelCase", value: "cardBrand" },
    { label: "card brand snake_case", value: "card_brand" },
    { label: "card last4 camelCase", value: "cardLast4" },
    { label: "card last4 snake_case", value: "card_last4" },
    { label: "raw Prisma client error", value: "PrismaClient" },
    { label: "raw Prisma invocation", value: "Invalid `prisma" },
  ] as const;

  for (const { label, value } of forbiddenLiteralChecks) {
    expect(surface.includes(value), `public page does not expose ${label}`).toBe(false);
  }

  if (options.providerPaymentId) {
    expect(
      surface.includes(options.providerPaymentId),
      "terminal public page does not expose provider id after pending instructions disappear",
    ).toBe(false);
  }

  const forbiddenPatterns = [
    { label: "JavaScript stack frame", pattern: /\bat\s+[^\n()]+\([^\n()]+:\d+:\d+\)/u },
    { label: "raw unique constraint detail", pattern: /Unique constraint failed|violates unique constraint/iu },
    { label: "raw database URL", pattern: /postgres(?:ql)?:\/\//iu },
    { label: "SQL select text", pattern: /\bselect\s+.+\bfrom\b/iu },
    { label: "SQL update text", pattern: /\bupdate\s+.+\bset\b/iu },
  ] as const;

  for (const { label, pattern } of forbiddenPatterns) {
    expect(pattern.test(surface), `public page does not expose ${label}`).toBe(false);
  }

  for (const key of M004_E2E_REQUIRED_ENV_KEYS) {
    const value = process.env[key];

    if (value) {
      expect(surface.includes(value), `public page does not expose ${key} value`).toBe(false);
    }
  }
}

async function readPublicPageSurface(page: Page) {
  return page.locator("body").evaluate((body) => {
    const values: string[] = [];
    const bodyText = body.innerText.trim();

    if (bodyText) {
      values.push(bodyText);
    }

    for (const element of body.querySelectorAll("*")) {
      for (const attribute of [
        "aria-label",
        "alt",
        "autocomplete",
        "href",
        "name",
        "placeholder",
        "rel",
        "target",
        "title",
        "value",
      ]) {
        const attributeValue = element.getAttribute(attribute)?.trim();

        if (attributeValue) {
          values.push(`${attribute}=${attributeValue}`);
        }
      }
    }

    return values.join("\n");
  });
}

function monitorBrowserDiagnostics(page: Page, getRedactions: () => string[]) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") {
      consoleErrors.push(redactHelperOutput(message.text(), getRedactions()));
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(redactHelperOutput(error.message, getRedactions()));
  });

  return { consoleErrors, pageErrors };
}

function expectNoBrowserDiagnostics(
  diagnostics: BrowserDiagnostics,
  phase: string,
) {
  expect(
    diagnostics.consoleErrors,
    `unexpected browser console.error during ${phase}: ${diagnostics.consoleErrors.join(" | ")}`,
  ).toEqual([]);
  expect(
    diagnostics.pageErrors,
    `unexpected browser pageerror during ${phase}: ${diagnostics.pageErrors.join(" | ")}`,
  ).toEqual([]);
}

function runM004Helper<TResult>(
  command: "setup" | "read-online-payment" | "assert-terminal-payment",
  input: unknown,
  redactions: string[] = [],
): Promise<TResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI_PATH, HELPER_PATH, command], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `M004 E2E helper ${command} failed: ${redactHelperOutput(stderr, redactions)}`,
          ),
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout) as TResult);
      } catch (error) {
        reject(
          new Error(
            `M004 E2E helper ${command} returned malformed JSON: ${redactHelperOutput(
              String(error),
              redactions,
            )}`,
          ),
        );
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function readRequiredM004E2EEnv() {
  const missingKeys = M004_E2E_REQUIRED_ENV_KEYS.filter(
    (key) => !process.env[key]?.trim(),
  );

  expect(
    missingKeys,
    `Missing required M004 E2E env keys: ${missingKeys.join(", ")}`,
  ).toEqual([]);

  return {
    webhookSecret: process.env.FAKE_PAYMENT_WEBHOOK_SECRET?.trim() ?? "",
  };
}

function createCheckoutPrivateValues(scope: "pix" | "card"): CheckoutPrivateValues {
  const token = randomBytes(12).toString("hex");

  return {
    customerPassword: `Sextou-M004-${scope}-${token}-Senha!42`,
    deliveryStreet: `Rua do Fluxo M004 ${scope.toUpperCase()}`,
    deliveryNumber: `Numero-M004-${scope}-${token.slice(0, 8)}`,
    deliveryComplement: `Complemento reservado M004 ${scope}`,
    deliveryNeighborhood: `Bairro reservado M004 ${scope}`,
    deliveryPostalCode: "01001-000",
    deliveryReference: `Referência privada M004 ${scope}`,
    generalObservation: `Observação privada M004 ${scope}`,
  };
}

function createRedactionSet(privateValues: CheckoutPrivateValues): RedactionSet {
  return new Set(
    [
      privateValues.customerPassword,
      privateValues.deliveryStreet,
      privateValues.deliveryNumber,
      privateValues.deliveryComplement,
      privateValues.deliveryNeighborhood,
      privateValues.deliveryPostalCode,
      privateValues.deliveryReference,
      privateValues.generalObservation,
      process.env.DATABASE_URL,
      process.env.AUTH_SECRET,
      process.env.SESSION_COOKIE_NAME,
      process.env.SESSION_MAX_AGE_DAYS,
      process.env.FAKE_PAYMENT_PROVIDER,
      process.env.FAKE_PAYMENT_WEBHOOK_SECRET,
      process.env.FAKE_PAYMENT_APPROVAL_MODE,
    ].filter(isNonEmptyString),
  );
}

function addFixtureRedactions(redactions: RedactionSet, fixture: BrowserFixture) {
  for (const value of [
    fixture.customerEmail,
    fixture.customerPhone,
    fixture.internalIds.customerId,
    fixture.internalIds.merchantUserId,
    fixture.internalIds.establishmentId,
    fixture.internalIds.productId,
  ]) {
    redactions.add(value);
  }
}

function addProviderRedaction(redactions: RedactionSet, providerPaymentId: string) {
  if (providerPaymentId.trim().length > 0) {
    redactions.add(providerPaymentId);
  }
}

function toRedactions(redactions: RedactionSet) {
  return [...redactions].filter(isNonEmptyString);
}

function redactHelperOutput(text: string, redactions: string[]) {
  return redactions.reduce(
    (redacted, value) => redacted.split(value).join("[REDACTED]"),
    text,
  );
}

function assertLoginRedirect(rawUrl: string, expectedNext: string) {
  const url = new URL(rawUrl);

  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("next")).toBe(expectedNext);
  expect(url.searchParams.get("erro")).toBe("sessao");
}

function readPublicCodeFromUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  const match = /^\/pedido\/(PED-[A-Z0-9-]+)$/u.exec(url.pathname);

  return match?.[1] ?? null;
}

function readCartStorage(page: Page) {
  return page.evaluate((key) => window.localStorage.getItem(key), CART_STORAGE_KEY);
}

function formatBRL(value: string) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(Number(value));
}

function moneyToCents(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/u.exec(value);

  expect(match, `money value is decimal-compatible: ${value}`).not.toBeNull();
  if (!match) {
    return Number.NaN;
  }

  return Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
