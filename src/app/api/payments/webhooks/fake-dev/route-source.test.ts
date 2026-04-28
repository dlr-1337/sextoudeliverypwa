import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routePath = "src/app/api/payments/webhooks/fake-dev/route.ts";
const routeSource = readFileSync(routePath, "utf8");

const forbiddenRouteFragments = [
  "request.json(",
  "request.formData(",
  "cookies(",
  "headers(",
  "readSessionCookie",
  "requireMerchantSession",
  "requireCustomerSession",
  "@/modules/auth",
  "@/server/db",
  "PrismaClient",
  "new Prisma",
  "providerPayload",
  "providerPaymentId",
  "cardNumber",
  "cardBrand",
  "cardLast4",
  "cvv",
  "cvc",
  "expiry",
  "expiration",
  "token",
  "DATABASE_URL",
  "AUTH_SECRET",
  "process.env",
  "console.",
  "error.message",
  ".stack",
] as const;

describe("fake/dev payment webhook route source boundary", () => {
  it("lives at the public fake/dev webhook path with node runtime and POST handler", () => {
    expect(routePath).toBe("src/app/api/payments/webhooks/fake-dev/route.ts");
    expect(routeSource).toContain('export const runtime = "nodejs"');
    expect(routeSource).toContain("export async function POST(request: NextRequest)");
    expect(routeSource).toContain("NextResponse");
  });

  it("reads the raw request body exactly once and never parses JSON in the route file", () => {
    expect(routeSource.match(/request\.text\(\)/gu) ?? []).toHaveLength(1);
    expect(routeSource).toContain("const rawBody = await request.text();");
    expect(routeSource).not.toContain("request.json(");
  });

  it("delegates auth, parsing, service mapping and revalidation through the route adapter", () => {
    for (const expectedFragment of [
      'import { revalidatePath } from "next/cache"',
      'import { getFakeDevPaymentConfig } from "@/modules/payments/config"',
      'import { handleFakeDevPaymentWebhookRoute } from "@/modules/payments/webhook-route-core"',
      'import { paymentWebhookService } from "@/modules/payments/webhook-service"',
      "handleFakeDevPaymentWebhookRoute({",
      "rawBody,",
      "headers: request.headers,",
      "getConfig: getFakeDevPaymentConfig,",
      "service: paymentWebhookService,",
      "revalidatePath,",
    ]) {
      expect(routeSource).toContain(expectedFragment);
    }
  });

  it("returns the adapter's stable response shape and status without rebuilding it inline", () => {
    expect(routeSource).toContain(
      "return NextResponse.json(result.body, { status: result.status });",
    );
    expect(routeSource).not.toMatch(/NextResponse\.json\(\s*\{[\s\S]*ok:/u);
    expect(routeSource).not.toMatch(/status:\s*200/u);
    expect(routeSource).not.toMatch(/status:\s*500/u);
  });

  it("keeps the route thin: no direct db, session, env, provider payload or card-data handling", () => {
    for (const forbiddenFragment of forbiddenRouteFragments) {
      expect(routeSource, forbiddenFragment).not.toContain(forbiddenFragment);
    }

    expect(routeSource).not.toMatch(/request\.headers\.get\((?![\s\S]*$)/u);
    expect(routeSource).not.toMatch(/payment\.(find|update|create)|order\.(find|update|create)/u);
  });
});
