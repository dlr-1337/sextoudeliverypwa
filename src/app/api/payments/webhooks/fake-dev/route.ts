import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { getFakeDevPaymentConfig } from "@/modules/payments/config";
import { handleFakeDevPaymentWebhookRoute } from "@/modules/payments/webhook-route-core";
import { paymentWebhookService } from "@/modules/payments/webhook-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const result = await handleFakeDevPaymentWebhookRoute({
    rawBody,
    headers: request.headers,
    getConfig: getFakeDevPaymentConfig,
    service: paymentWebhookService,
    revalidatePath,
  });

  return NextResponse.json(result.body, { status: result.status });
}
