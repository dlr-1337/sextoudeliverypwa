import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

import {
  expect,
  test,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
} from "@playwright/test";

import { CART_STORAGE_KEY } from "../src/modules/cart/local-storage";

type BrowserFixture = {
  storeSlug: string;
  storeName: string;
  productName: string;
  productPrice: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  ownerMerchantEmail: string;
  internalIds: {
    customerId: string;
    ownerMerchantUserId: string;
    establishmentId: string;
    productId: string;
  };
};

type DbAssertionSummary = {
  orderExists: boolean;
  status: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  acceptedAtSet: boolean;
  updatedAtMatchesAcceptedAt: boolean;
  terminalTimestampsNull: boolean;
  deliveredAtNull: boolean;
  canceledAtNull: boolean;
  storeMatchesFixture: boolean;
  customerMatchesFixture: boolean;
  itemCount: number;
  itemProductMatchesFixture: boolean;
  itemProductName: string | null;
  itemProductNameMatchesFixture: boolean;
  itemQuantity: number | null;
  itemUnitPriceCents: number | null;
  itemTotalCents: number | null;
  expectedProductPriceCents: number | null;
  paymentExists: boolean;
  paymentMethodPersisted: string | null;
  paymentStatusPersisted: string | null;
  providerFieldsNull: boolean;
  pixFieldsNull: boolean;
  cardFieldsNull: boolean;
  settlementFieldsNull: boolean;
  historyCount: number;
  initialHistoryStatus: string | null;
  initialHistoryNote: string | null;
  initialHistoryActorMatchesCustomer: boolean;
  acceptedHistoryStatus: string | null;
  acceptedHistoryNote: string | null;
  acceptedHistoryActorMatchesMerchant: boolean;
  acceptedHistoryNoteMatchesExpected: boolean | null;
};

type CheckoutPrivateValues = {
  customerPassword: string;
  ownerMerchantPassword: string;
  deliveryStreet: string;
  deliveryComplement: string;
  deliveryNeighborhood: string;
  deliveryPostalCode: string;
  deliveryReference: string;
  generalObservation: string;
};

type BrowserDiagnostics = ReturnType<typeof monitorBrowserDiagnostics>;

const HELPER_PATH = "e2e/m003-order-operations.e2e-helper.ts";
const TSX_CLI_PATH = "node_modules/tsx/dist/cli.mjs";
const MERCHANT_ACCEPTANCE_NOTE = "Pedido aceito pelo E2E M003 com dinheiro confirmado.";

test.describe("M003 browser order operation and public tracking", () => {
  test("creates a CASH order, accepts it as owner MERCHANT, and exposes safe public tracking", async ({
    browser,
    page,
  }) => {
    test.setTimeout(150_000);

    const privateValues: CheckoutPrivateValues = {
      customerPassword: generatePassword("customer"),
      ownerMerchantPassword: generatePassword("merchant"),
      deliveryStreet: "Rua do Fluxo M003",
      deliveryComplement: "Casa roxa M003",
      deliveryNeighborhood: "Centro M003",
      deliveryPostalCode: "01001-000",
      deliveryReference: "Portão roxo do teste M003",
      generalObservation: "Troco combinado pelo fluxo E2E M003.",
    };
    let fixture: BrowserFixture | null = null;
    let publicCode: string | null = null;
    let merchantContext: BrowserContext | null = null;
    let publicContext: BrowserContext | null = null;

    try {
      await test.step("prepare disposable M003 customer, merchant, store and product", async () => {
        const result = await runM003Helper<{ fixture: BrowserFixture }>(
          "setup",
          {
            customerPassword: privateValues.customerPassword,
            ownerMerchantPassword: privateValues.ownerMerchantPassword,
          },
          [privateValues.customerPassword, privateValues.ownerMerchantPassword],
        );

        fixture = result.fixture;
      });

      expect(fixture, "fixture should be available after setup").not.toBeNull();
      const fixtureData = fixture as BrowserFixture;
      const customerDiagnostics = monitorBrowserDiagnostics(
        page,
        fixtureData,
        privateValues,
      );

      await test.step("customer creates a CASH order through catalog, login and checkout", async () => {
        await page.goto(`/lojas/${fixtureData.storeSlug}`);

        await expect(
          page.getByRole("heading", { name: fixtureData.storeName, exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "Cardápio disponível", exact: true }),
        ).toBeVisible();

        const productCard = page.getByRole("article").filter({
          has: page.getByRole("heading", {
            name: fixtureData.productName,
            exact: true,
          }),
        });
        await expect(productCard).toBeVisible();
        await expect(productCard.getByText(formatBRL(fixtureData.productPrice))).toBeVisible();

        await productCard
          .getByRole("button", {
            name: `Adicionar ${fixtureData.productName} ao carrinho`,
            exact: true,
          })
          .click();

        await expect(
          page.getByRole("status").filter({
            hasText: `${fixtureData.productName} está no carrinho.`,
          }),
        ).toBeVisible();
        await expect(
          page
            .getByRole("list", { name: "Itens do carrinho" })
            .getByRole("heading", { name: fixtureData.productName, exact: true }),
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
        await expect(readCartStorage(page), "cart survives CUSTOMER login redirect").resolves.not.toBeNull();

        await page.getByLabel("E-mail", { exact: true }).fill(fixtureData.customerEmail);
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
        await expect(readCartStorage(page), "cart survives CUSTOMER authentication").resolves.not.toBeNull();

        const checkoutCartItems = page.getByRole("list", {
          name: "Itens estimados do carrinho",
        });
        await expect(checkoutCartItems.getByText(fixtureData.productName)).toBeVisible();
        await expect(page.getByText("quantidade 1")).toBeVisible();
        await expect(
          checkoutCartItems.getByText(formatBRL(fixtureData.productPrice), { exact: true }).first(),
        ).toBeVisible();

        const cash = page.getByRole("radio", { name: /^Dinheiro/u });
        await expect(cash).toBeEnabled();
        await expect(cash).toBeChecked();
        await expect(page.getByRole("radio", { name: /^PIX/u })).toBeDisabled();
        await expect(page.getByRole("radio", { name: /^Cartão/u })).toBeDisabled();

        await page.getByLabel("Nome para entrega", { exact: true }).fill(fixtureData.customerName);
        await page.getByLabel("Telefone para contato", { exact: true }).fill(fixtureData.customerPhone);
        await page.getByLabel("Rua", { exact: true }).fill(privateValues.deliveryStreet);
        await page.getByLabel("Número", { exact: true }).fill("43");
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
          page.getByRole("button", { name: "Criar pedido em dinheiro", exact: true }).click(),
        ]);

        publicCode = readPublicCodeFromUrl(page.url());
        expect(publicCode, "public order code from confirmation URL").not.toBeNull();
        const code = publicCode as string;

        await expect(
          page.getByRole("heading", { name: `Pedido ${code}`, exact: true }),
        ).toBeVisible();
        await expect(page.getByText("Pedido recebido").first()).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "Pagamento em dinheiro", exact: true }),
        ).toBeVisible();
        await expect(page.getByText("Pagamento em dinheiro na entrega").first()).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "Linha do tempo pública", exact: true }),
        ).toBeVisible();

        const publicItem = page.getByRole("article").filter({
          has: page.getByRole("heading", {
            name: fixtureData.productName,
            exact: true,
          }),
        });
        await expect(publicItem).toBeVisible();
        await expect(publicItem.getByText("Quantidade: 1")).toBeVisible();
        await expect(
          publicItem.getByText(formatBRL(fixtureData.productPrice), { exact: true }).first(),
        ).toBeVisible();
        await expect(page.getByText("Total", { exact: true })).toBeVisible();

        await expect(readCartStorage(page), "cart is cleared after created order").resolves.toBeNull();
        expectNoBrowserDiagnostics(customerDiagnostics, "customer checkout");
      });

      await test.step("owner merchant accepts the order from the protected list/detail flow", async () => {
        expect(publicCode, "public code captured before merchant operation").not.toBeNull();
        const code = publicCode as string;

        merchantContext = await browser.newContext();
        const merchantPage = await merchantContext.newPage();
        const merchantDiagnostics = monitorBrowserDiagnostics(
          merchantPage,
          fixtureData,
          privateValues,
        );

        await merchantPage.goto("/estabelecimento/pedidos");
        await expect(merchantPage).toHaveURL(/\/login\?/u);
        assertMerchantLoginRedirect(merchantPage.url());
        await expect(
          merchantPage.getByRole("heading", { name: "Acesse sua área no Sextou.", exact: true }),
        ).toBeVisible();

        await merchantPage.getByLabel("E-mail", { exact: true }).fill(fixtureData.ownerMerchantEmail);
        await merchantPage.getByLabel("Senha", { exact: true }).fill(privateValues.ownerMerchantPassword);

        await Promise.all([
          merchantPage.waitForURL(/\/estabelecimento(?:\/pedidos)?(?:$|[?#])/u),
          merchantPage.getByRole("button", { name: "Entrar com segurança", exact: true }).click(),
        ]);

        if (new URL(merchantPage.url()).pathname !== "/estabelecimento/pedidos") {
          await merchantPage.goto("/estabelecimento/pedidos");
        }

        await expect(
          merchantPage.getByRole("heading", { name: "Pedidos da loja", exact: true }),
        ).toBeVisible();

        const orderCard = merchantPage.getByRole("article").filter({
          hasText: `Pedido ${code}`,
        });
        await expect(orderCard).toBeVisible();
        await expect(orderCard.getByText("Pedido recebido").first()).toBeVisible();

        const detailLink = orderCard.getByRole("link", {
          name: "Abrir detalhes",
          exact: true,
        });
        await expect(detailLink).toBeVisible();
        const detailHref = await detailLink.getAttribute("href");
        expect(detailHref, "merchant detail link should target owner-scoped order id").toMatch(
          /^\/estabelecimento\/pedidos\/[^/?#]+$/u,
        );
        expect(detailHref, "merchant detail link must not use public code route construction").not.toContain(code);

        await Promise.all([
          merchantPage.waitForURL(/\/estabelecimento\/pedidos\/[^/?#]+$/u),
          detailLink.click(),
        ]);
        expect(new URL(merchantPage.url()).pathname).not.toContain(code);

        await expect(
          merchantPage.getByRole("heading", { name: `Pedido ${code}`, exact: true }),
        ).toBeVisible();
        await expect(
          merchantPage.getByRole("heading", { name: "Atualizar status", exact: true }),
        ).toBeVisible();
        const statusActionsRegion = merchantPage.getByRole("region", {
          name: "Atualizar status",
        });
        await expect(statusActionsRegion).toBeVisible();
        await expect(
          statusActionsRegion.getByText("Status atual: Pedido recebido"),
        ).toBeVisible();

        await statusActionsRegion
          .locator("#merchant-order-status-note")
          .fill(MERCHANT_ACCEPTANCE_NOTE);
        const acceptButton = statusActionsRegion.getByRole("button", {
          name: "Aceitar pedido",
          exact: true,
        });
        await expect(acceptButton).toBeEnabled();
        await acceptButton.click();

        await expect(
          merchantPage.getByRole("status").filter({
            hasText: "Pedido atualizado com sucesso.",
          }),
        ).toBeVisible();
        await expect(merchantPage.getByText("Novo status: Pedido aceito.")).toBeVisible();
        await expect(merchantPage.getByText("Status atual: Pedido aceito").first()).toBeVisible();
        await expect(merchantPage.getByText("Pedido aceito").first()).toBeVisible();
        await expect(merchantPage.getByText(MERCHANT_ACCEPTANCE_NOTE).first()).toBeVisible();
        await expect(merchantPage.getByRole("button", { name: "Iniciar preparo", exact: true })).toBeVisible();
        await expect(readAcceptedAtMetric(merchantPage)).toBeVisible();
        expectNoBrowserDiagnostics(merchantDiagnostics, "merchant status operation");
      });

      await test.step("fresh unauthenticated public tracking shows accepted status without private leaks", async () => {
        expect(publicCode, "public code captured before public tracking").not.toBeNull();
        const code = publicCode as string;

        publicContext = await browser.newContext();
        const publicPage = await publicContext.newPage();
        const publicDiagnostics = monitorBrowserDiagnostics(
          publicPage,
          fixtureData,
          privateValues,
        );

        await publicPage.goto(`/pedido/${code}`);
        await expect(publicPage).toHaveURL(new RegExp(`/pedido/${escapeRegExp(code)}$`, "u"));
        await expect(
          publicPage.getByRole("heading", { name: `Pedido ${code}`, exact: true }),
        ).toBeVisible();
        await expect(publicPage.getByText("Status atual: Pedido aceito")).toBeVisible();
        await expect(publicPage.getByText("Pedido aceito").first()).toBeVisible();
        await expect(
          publicPage.getByRole("heading", { name: "Linha do tempo pública", exact: true }),
        ).toBeVisible();
        await expect(publicPage.getByText(MERCHANT_ACCEPTANCE_NOTE).first()).toBeVisible();
        await assertPublicPageDoesNotLeakSensitiveData(publicPage, fixtureData, privateValues);
        expectNoBrowserDiagnostics(publicDiagnostics, "public accepted tracking");
      });

      await test.step("assert PostgreSQL accepted status, history actor/note, and payment redaction", async () => {
        expect(publicCode, "public code captured before DB lookup").not.toBeNull();
        const code = publicCode as string;
        const { summary } = await runM003Helper<{ summary: DbAssertionSummary }>(
          "assert-order-operated",
          {
            fixture: fixtureData,
            publicCode: code,
            expectedMerchantNote: MERCHANT_ACCEPTANCE_NOTE,
          },
          sensitiveValues(fixtureData, privateValues),
        );
        const expectedProductPriceCents = moneyToCents(fixtureData.productPrice);

        expect(summary.orderExists, "order exists for captured public code").toBe(true);
        expect(summary.status).toBe("ACCEPTED");
        expect(summary.paymentMethod).toBe("CASH");
        expect(summary.paymentStatus).toBe("MANUAL_CASH_ON_DELIVERY");
        expect(summary.acceptedAtSet, "acceptedAt timestamp was set").toBe(true);
        expect(summary.updatedAtMatchesAcceptedAt, "updatedAt matches acceptedAt transition timestamp").toBe(true);
        expect(summary.terminalTimestampsNull, "terminal timestamps remain empty").toBe(true);
        expect(summary.deliveredAtNull).toBe(true);
        expect(summary.canceledAtNull).toBe(true);
        expect(summary.storeMatchesFixture, "order belongs to fixture store").toBe(true);
        expect(summary.customerMatchesFixture, "order belongs to browser-authenticated CUSTOMER").toBe(true);
        expect(summary.itemCount, "one order item is persisted").toBe(1);
        expect(summary.itemProductMatchesFixture, "item points at fixture product").toBe(true);
        expect(summary.itemProductName).toBe(fixtureData.productName);
        expect(summary.itemProductNameMatchesFixture).toBe(true);
        expect(summary.itemQuantity).toBe(1);
        expect(summary.itemUnitPriceCents).toBe(expectedProductPriceCents);
        expect(summary.itemTotalCents).toBe(expectedProductPriceCents);
        expect(summary.expectedProductPriceCents).toBe(expectedProductPriceCents);
        expect(summary.paymentExists, "one CASH payment row is persisted").toBe(true);
        expect(summary.paymentMethodPersisted).toBe("CASH");
        expect(summary.paymentStatusPersisted).toBe("MANUAL_CASH_ON_DELIVERY");
        expect(summary.providerFieldsNull, "provider fields stay null for CASH").toBe(true);
        expect(summary.pixFieldsNull, "PIX fields stay null for CASH").toBe(true);
        expect(summary.cardFieldsNull, "card fields stay null for CASH").toBe(true);
        expect(summary.settlementFieldsNull, "manual CASH settlement timestamps stay null").toBe(true);
        expect(summary.historyCount, "initial and accepted history events are persisted").toBe(2);
        expect(summary.initialHistoryStatus).toBe("PENDING");
        expect(summary.initialHistoryNote).toBe("Pedido criado pelo checkout.");
        expect(summary.initialHistoryActorMatchesCustomer).toBe(true);
        expect(summary.acceptedHistoryStatus).toBe("ACCEPTED");
        expect(summary.acceptedHistoryNote).toBe(MERCHANT_ACCEPTANCE_NOTE);
        expect(summary.acceptedHistoryActorMatchesMerchant).toBe(true);
        expect(summary.acceptedHistoryNoteMatchesExpected).toBe(true);
      });
    } finally {
      await publicContext?.close();
      await merchantContext?.close();
    }
  });
});

function monitorBrowserDiagnostics(
  page: Page,
  fixture: BrowserFixture,
  privateValues: CheckoutPrivateValues,
) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") {
      consoleErrors.push(redactSensitiveText(message.text(), fixture, privateValues));
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(redactSensitiveText(error.message, fixture, privateValues));
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

function assertLoginRedirect(rawUrl: string, expectedNext: string) {
  const url = new URL(rawUrl);

  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("next")).toBe(expectedNext);
  expect(url.searchParams.get("erro")).toBe("sessao");
}

function assertMerchantLoginRedirect(rawUrl: string) {
  const url = new URL(rawUrl);
  const nextPath = url.searchParams.get("next");

  expect(url.pathname).toBe("/login");
  expect(nextPath === "/estabelecimento" || nextPath === "/estabelecimento/pedidos").toBe(true);
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

function readAcceptedAtMetric(page: Page) {
  return page
    .locator("div")
    .filter({
      has: page.getByText("Aceito em", { exact: true }),
      hasNotText: "Data indisponível",
    })
    .first();
}

async function assertPublicPageDoesNotLeakSensitiveData(
  page: Page,
  fixture: BrowserFixture,
  privateValues: CheckoutPrivateValues,
) {
  const bodyText = await page.locator("body").innerText();
  const forbiddenLiteralChecks = [
    { label: "customer password", value: privateValues.customerPassword },
    { label: "owner merchant password", value: privateValues.ownerMerchantPassword },
    { label: "customer email", value: fixture.customerEmail },
    { label: "owner merchant email", value: fixture.ownerMerchantEmail },
    { label: "customer phone", value: fixture.customerPhone },
    { label: "customer id", value: fixture.internalIds.customerId },
    { label: "owner merchant user id", value: fixture.internalIds.ownerMerchantUserId },
    { label: "establishment id", value: fixture.internalIds.establishmentId },
    { label: "product id", value: fixture.internalIds.productId },
    { label: "delivery street", value: privateValues.deliveryStreet },
    { label: "delivery complement", value: privateValues.deliveryComplement },
    { label: "delivery neighborhood", value: privateValues.deliveryNeighborhood },
    { label: "delivery postal code", value: privateValues.deliveryPostalCode },
    { label: "delivery reference", value: privateValues.deliveryReference },
    { label: "customer checkout observation", value: privateValues.generalObservation },
    { label: "changedById field", value: "changedById" },
    { label: "changed_by_id field", value: "changed_by_id" },
    { label: "session token field", value: "sessionToken" },
    { label: "token hash field", value: "tokenHash" },
    { label: "password hash field", value: "passwordHash" },
    { label: "DATABASE_URL key", value: "DATABASE_URL" },
    { label: "AUTH_SECRET key", value: "AUTH_SECRET" },
    { label: "SESSION_COOKIE_NAME key", value: "SESSION_COOKIE_NAME" },
    { label: "SESSION_MAX_AGE_DAYS key", value: "SESSION_MAX_AGE_DAYS" },
    { label: "provider payload camelCase", value: "providerPayload" },
    { label: "provider payload snake_case", value: "provider_payload" },
    { label: "provider payment id camelCase", value: "providerPaymentId" },
    { label: "provider payment id snake_case", value: "provider_payment_id" },
    { label: "provider status camelCase", value: "providerStatus" },
    { label: "provider status snake_case", value: "provider_status" },
    { label: "PIX QR code camelCase", value: "pixQrCode" },
    { label: "PIX QR code snake_case", value: "pix_qr_code" },
    { label: "PIX copy-paste camelCase", value: "pixCopyPaste" },
    { label: "PIX copy-paste snake_case", value: "pix_copy_paste" },
    { label: "card brand camelCase", value: "cardBrand" },
    { label: "card brand snake_case", value: "card_brand" },
    { label: "card last4 camelCase", value: "cardLast4" },
    { label: "card last4 snake_case", value: "card_last4" },
    { label: "raw Prisma client error", value: "PrismaClient" },
    { label: "raw Prisma invocation", value: "Invalid `prisma" },
  ] as const;

  for (const { label, value } of forbiddenLiteralChecks) {
    expect(bodyText.includes(value), `public page does not expose ${label}`).toBe(false);
  }

  const forbiddenPatterns = [
    { label: "JavaScript stack frame", pattern: /\bat\s+[^\n()]+\([^\n()]+:\d+:\d+\)/u },
    { label: "raw unique constraint detail", pattern: /Unique constraint failed|violates unique constraint/iu },
    { label: "raw database URL", pattern: /postgres(?:ql)?:\/\//iu },
  ] as const;

  for (const { label, pattern } of forbiddenPatterns) {
    expect(pattern.test(bodyText), `public page does not expose ${label}`).toBe(false);
  }

  for (const { key, label } of [
    { key: "DATABASE_URL", label: "DATABASE_URL value" },
    { key: "AUTH_SECRET", label: "AUTH_SECRET value" },
    { key: "SESSION_COOKIE_NAME", label: "SESSION_COOKIE_NAME value" },
    { key: "SESSION_MAX_AGE_DAYS", label: "SESSION_MAX_AGE_DAYS value" },
  ] as const) {
    const value = process.env[key];

    if (value) {
      expect(bodyText.includes(value), `public page does not expose ${label}`).toBe(false);
    }
  }
}

function runM003Helper<TResult>(
  command: "setup" | "assert-order-operated",
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
            `M003 E2E helper ${command} failed: ${redactHelperOutput(stderr, redactions)}`,
          ),
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout) as TResult);
      } catch (error) {
        reject(
          new Error(
            `M003 E2E helper ${command} returned malformed JSON: ${redactHelperOutput(
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

function generatePassword(scope: "customer" | "merchant") {
  return `Sextou-M003-${scope}-${randomBytes(18).toString("hex")}-Senha!42`;
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

function redactSensitiveText(
  text: string,
  fixture: BrowserFixture,
  privateValues: CheckoutPrivateValues,
) {
  return redactHelperOutput(text, sensitiveValues(fixture, privateValues));
}

function redactHelperOutput(text: string, redactions: string[]) {
  return redactions.reduce(
    (redacted, value) => redacted.split(value).join("[REDACTED]"),
    text,
  );
}

function sensitiveValues(
  fixture: BrowserFixture,
  privateValues: CheckoutPrivateValues,
) {
  return [
    privateValues.customerPassword,
    privateValues.ownerMerchantPassword,
    fixture.customerEmail,
    fixture.ownerMerchantEmail,
    fixture.internalIds.customerId,
    fixture.internalIds.ownerMerchantUserId,
    fixture.internalIds.establishmentId,
    fixture.internalIds.productId,
    process.env.DATABASE_URL,
    process.env.AUTH_SECRET,
    process.env.SESSION_COOKIE_NAME,
    process.env.SESSION_MAX_AGE_DAYS,
  ].filter((value): value is string => Boolean(value));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
