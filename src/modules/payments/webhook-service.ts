import type {
  PaymentWebhookServiceClient,
  PaymentWebhookServiceCore,
} from "./webhook-service-core";
import { createPaymentWebhookServiceCore } from "./webhook-service-core";

let paymentWebhookServiceCore: PaymentWebhookServiceCore | undefined;

async function getPaymentWebhookServiceCore() {
  if (paymentWebhookServiceCore) {
    return paymentWebhookServiceCore;
  }

  const { db } = await import("@/server/db");

  paymentWebhookServiceCore = createPaymentWebhookServiceCore({
    db: db as unknown as PaymentWebhookServiceClient,
  });

  return paymentWebhookServiceCore;
}

export const paymentWebhookService: PaymentWebhookServiceCore = {
  async applyFakeDevPaymentWebhookEvent(event) {
    return (await getPaymentWebhookServiceCore()).applyFakeDevPaymentWebhookEvent(
      event,
    );
  },
};

export type PaymentWebhookService = typeof paymentWebhookService;
