import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

import { CART_STORAGE_KEY } from "../src/modules/cart/local-storage";

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

type DbAssertionSummary = {
  orderExists: boolean;
  status: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  storeMatchesFixture: boolean;
  customerMatchesFixture: boolean;
  itemCount: number;
  itemProductMatchesFixture: boolean;
  itemProductName: string | null;
  itemQuantity: number | null;
  itemUnitPriceCents: number | null;
  itemTotalCents: number | null;
  subtotalCents: number | null;
  deliveryFeeCents: number | null;
  discountCents: number | null;
  totalCents: number | null;
  expectedProductPriceCents: number | null;
  computedTotalCents: number | null;
  paymentExists: boolean;
  paymentMethodPersisted: string | null;
  paymentStatusPersisted: string | null;
  paymentAmountCents: number | null;
  providerFieldsNull: boolean;
  pixFieldsNull: boolean;
  cardFieldsNull: boolean;
  settlementFieldsNull: boolean;
  historyCount: number;
  initialHistoryStatus: string | null;
  initialHistoryNote: string | null;
  initialHistoryActorMatchesCustomer: boolean;
};

type BrowserDiagnostics = ReturnType<typeof monitorBrowserDiagnostics>;

const HELPER_PATH = "e2e/m002-money-flow.e2e-helper.ts";
const TSX_CLI_PATH = "node_modules/tsx/dist/cli.mjs";

test.describe("M002 active catalog to CASH order tracking", () => {
  test("creates a real CASH order through browser cart, CUSTOMER login, checkout and public tracking", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const customerPassword = generateCustomerPassword();
    const { fixture } = await runM002Helper<{ fixture: BrowserFixture }>(
      "setup",
      { customerPassword },
      [customerPassword],
    );
    const diagnostics = monitorBrowserDiagnostics(page, fixture, customerPassword);
    let publicCode: string | null = null;

    await test.step("populate cart from active public catalog", async () => {
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
      expectNoBrowserDiagnostics(diagnostics, "catalog/cart redirect");
    });

    await test.step("log in as generated CUSTOMER and preserve checkout cart", async () => {
      await page.getByLabel("E-mail", { exact: true }).fill(fixture.customerEmail);
      await page.getByLabel("Senha", { exact: true }).fill(customerPassword);

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
      expectNoBrowserDiagnostics(diagnostics, "customer login");
    });

    await test.step("submit checkout with CASH and disabled future payment methods", async () => {
      await expect(
        page.getByRole("heading", { name: "Revisão do pedido", exact: true }),
      ).toBeVisible();
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

      await expect(cash).toBeEnabled();
      await expect(cash).toBeChecked();
      await expect(pix).toBeDisabled();
      await expect(card).toBeDisabled();
      await expect(page.getByText("PIX ainda não está disponível para concluir pedidos.")).toBeVisible();
      await expect(page.getByText("Cartão ainda não está disponível para concluir pedidos.")).toBeVisible();

      await page.getByLabel("Nome para entrega", { exact: true }).fill(fixture.customerName);
      await page.getByLabel("Telefone para contato", { exact: true }).fill(fixture.customerPhone);
      await page.getByLabel("Rua", { exact: true }).fill("Rua do Fluxo M002");
      await page.getByLabel("Número", { exact: true }).fill("42");
      await page.getByLabel("Complemento", { exact: true }).fill("Apto 27");
      await page.getByLabel("Bairro", { exact: true }).fill("Centro");
      await page.getByLabel("Cidade", { exact: true }).fill("São Paulo");
      await page.getByLabel("Estado", { exact: true }).fill("SP");
      await page.getByLabel("CEP", { exact: true }).fill("01001-000");
      await page
        .getByLabel("Ponto de referência", { exact: true })
        .fill("Portão laranja do teste M002");
      await page
        .getByLabel("Observações gerais", { exact: true })
        .fill("Troco será combinado na entrega.");

      await Promise.all([
        page.waitForURL(/\/pedido\/PED-[A-Z0-9-]+$/u),
        page.getByRole("button", { name: "Criar pedido em dinheiro", exact: true }).click(),
      ]);

      publicCode = readPublicCodeFromUrl(page.url());
      expect(publicCode, "public order code from confirmation URL").not.toBeNull();
      expectNoBrowserDiagnostics(diagnostics, "checkout submit");
    });

    await test.step("assert public tracking page and cleared local cart", async () => {
      expect(publicCode, "public code captured before tracking assertions").not.toBeNull();
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
          name: fixture.productName,
          exact: true,
        }),
      });
      await expect(publicItem).toBeVisible();
      await expect(publicItem.getByText("Quantidade: 1")).toBeVisible();
      await expect(
        publicItem.getByText(formatBRL(fixture.productPrice), { exact: true }).first(),
      ).toBeVisible();
      await expect(page.getByText("Total", { exact: true })).toBeVisible();

      await expect(readCartStorage(page), "cart is cleared after created order").resolves.toBeNull();
      await assertPublicPageDoesNotLeakSensitiveData(page, fixture, customerPassword);
      expectNoBrowserDiagnostics(diagnostics, "public tracking");
    });

    await test.step("assert PostgreSQL order, payment, history and safe provider fields", async () => {
      expect(publicCode, "public code captured before DB lookup").not.toBeNull();
      const { summary } = await runM002Helper<{ summary: DbAssertionSummary }>(
        "assert-order",
        { fixture, publicCode },
        sensitiveValues(fixture, customerPassword),
      );
      const expectedProductPriceCents = moneyToCents(fixture.productPrice);

      expect(summary.orderExists, "order exists for captured public code").toBe(true);
      expect(summary.status).toBe("PENDING");
      expect(summary.paymentMethod).toBe("CASH");
      expect(summary.paymentStatus).toBe("MANUAL_CASH_ON_DELIVERY");
      expect(summary.storeMatchesFixture, "order belongs to fixture store").toBe(true);
      expect(summary.customerMatchesFixture, "order belongs to browser-authenticated CUSTOMER").toBe(true);
      expect(summary.itemCount, "one order item is persisted").toBe(1);
      expect(summary.itemProductMatchesFixture, "order item points at fixture product").toBe(true);
      expect(summary.itemProductName).toBe(fixture.productName);
      expect(summary.itemQuantity).toBe(1);
      expect(summary.itemUnitPriceCents).toBe(expectedProductPriceCents);
      expect(summary.itemTotalCents).toBe(expectedProductPriceCents);
      expect(summary.subtotalCents).toBe(expectedProductPriceCents);
      expect(summary.discountCents).toBe(0);
      expect(summary.totalCents).toBe(summary.computedTotalCents);
      expect(summary.paymentExists, "one payment row is persisted").toBe(true);
      expect(summary.paymentMethodPersisted).toBe("CASH");
      expect(summary.paymentStatusPersisted).toBe("MANUAL_CASH_ON_DELIVERY");
      expect(summary.paymentAmountCents).toBe(summary.totalCents);
      expect(summary.providerFieldsNull, "provider fields stay null for CASH").toBe(true);
      expect(summary.pixFieldsNull, "PIX fields stay null for CASH").toBe(true);
      expect(summary.cardFieldsNull, "card fields stay null for CASH").toBe(true);
      expect(summary.settlementFieldsNull, "manual CASH settlement timestamps stay null").toBe(true);
      expect(summary.historyCount, "one initial order history event is persisted").toBe(1);
      expect(summary.initialHistoryStatus).toBe("PENDING");
      expect(summary.initialHistoryNote).toBe("Pedido criado pelo checkout.");
      expect(
        summary.initialHistoryActorMatchesCustomer,
        "history actor is the CUSTOMER",
      ).toBe(true);
    });
  });
});

function monitorBrowserDiagnostics(
  page: Page,
  fixture: BrowserFixture,
  customerPassword: string,
) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") {
      consoleErrors.push(redactSensitiveText(message.text(), fixture, customerPassword));
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(redactSensitiveText(error.message, fixture, customerPassword));
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

function readPublicCodeFromUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  const match = /^\/pedido\/(PED-[A-Z0-9-]+)$/u.exec(url.pathname);

  return match?.[1] ?? null;
}

function readCartStorage(page: Page) {
  return page.evaluate((key) => window.localStorage.getItem(key), CART_STORAGE_KEY);
}

async function assertPublicPageDoesNotLeakSensitiveData(
  page: Page,
  fixture: BrowserFixture,
  customerPassword: string,
) {
  const bodyText = await page.locator("body").innerText();
  const forbiddenLiteralChecks = [
    { label: "customer password", value: customerPassword },
    { label: "customer id", value: fixture.internalIds.customerId },
    { label: "merchant user id", value: fixture.internalIds.merchantUserId },
    { label: "establishment id", value: fixture.internalIds.establishmentId },
    { label: "product id", value: fixture.internalIds.productId },
    { label: "DATABASE_URL key", value: "DATABASE_URL" },
    { label: "AUTH_SECRET key", value: "AUTH_SECRET" },
    { label: "provider payload camelCase", value: "providerPayload" },
    { label: "provider payload snake_case", value: "provider_payload" },
    { label: "PIX copy-paste camelCase", value: "pixCopyPaste" },
    { label: "PIX copy-paste snake_case", value: "pix_copy_paste" },
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
  ] as const) {
    const value = process.env[key];

    if (value) {
      expect(bodyText.includes(value), `public page does not expose ${label}`).toBe(false);
    }
  }
}

function runM002Helper<TResult>(
  command: "setup" | "assert-order",
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
            `M002 E2E helper ${command} failed: ${redactHelperOutput(stderr, redactions)}`,
          ),
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout) as TResult);
      } catch (error) {
        reject(
          new Error(
            `M002 E2E helper ${command} returned malformed JSON: ${redactHelperOutput(
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

function generateCustomerPassword() {
  return `Sextou-M002-${randomBytes(18).toString("hex")}-Senha!42`;
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
  customerPassword: string,
) {
  return redactHelperOutput(text, sensitiveValues(fixture, customerPassword));
}

function redactHelperOutput(text: string, redactions: string[]) {
  return redactions.reduce(
    (redacted, value) => redacted.split(value).join("[REDACTED]"),
    text,
  );
}

function sensitiveValues(fixture: BrowserFixture, customerPassword: string) {
  return [
    customerPassword,
    fixture.internalIds.customerId,
    fixture.internalIds.merchantUserId,
    fixture.internalIds.establishmentId,
    fixture.internalIds.productId,
    process.env.DATABASE_URL,
    process.env.AUTH_SECRET,
  ].filter((value): value is string => Boolean(value));
}
