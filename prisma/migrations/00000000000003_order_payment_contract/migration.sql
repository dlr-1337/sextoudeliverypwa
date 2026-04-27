-- S01 order/payment contract
-- Required order delivery/payment columns intentionally have no defaults: empty M001
-- databases migrate cleanly, while incompatible experimental order rows fail instead of
-- receiving invented checkout data.

-- Add required checkout contract columns first so non-empty experimental order tables
-- fail before enum, FK, or index rewrites are attempted.
ALTER TABLE "orders" ADD COLUMN "delivery_street" TEXT NOT NULL;
ALTER TABLE "orders" ADD COLUMN "delivery_number" TEXT NOT NULL;
ALTER TABLE "orders" ADD COLUMN "delivery_neighborhood" TEXT NOT NULL;
ALTER TABLE "orders" ADD COLUMN "delivery_city" TEXT NOT NULL;
ALTER TABLE "orders" ADD COLUMN "delivery_state" TEXT NOT NULL;
ALTER TABLE "orders" ADD COLUMN "delivery_postal_code" TEXT NOT NULL;
ALTER TABLE "orders" ADD COLUMN "payment_method" "PaymentMethod" NOT NULL;
ALTER TABLE "orders" ADD COLUMN "payment_status" "PaymentStatus" NOT NULL;

-- Add optional checkout/detail fields.
ALTER TABLE "orders" ADD COLUMN "delivery_complement" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_reference" TEXT;
ALTER TABLE "orders" ADD COLUMN "general_observation" TEXT;

-- Public order lookup contract: keep the existing value while exposing the safer name.
ALTER TABLE "orders" RENAME COLUMN "code" TO "public_code";
ALTER INDEX "orders_code_key" RENAME TO "orders_public_code_key";

-- Rename order lifecycle value without a destructive enum replacement.
ALTER TYPE "OrderStatus" RENAME VALUE 'PLACED' TO 'PENDING';
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"OrderStatus";

-- Manual cash status is additive so existing payment status values remain compatible.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'MANUAL_CASH_ON_DELIVERY';

-- M002 orders must belong to an authenticated customer; no null customer authority.
ALTER TABLE "orders" DROP CONSTRAINT "orders_customer_id_fkey";
ALTER TABLE "orders" ALTER COLUMN "customer_id" SET NOT NULL;
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Payment provider/PIX/card placeholders for the future gateway milestone.
ALTER TABLE "payments" ADD COLUMN "provider_status" TEXT;
ALTER TABLE "payments" ADD COLUMN "provider_payload" JSONB;
ALTER TABLE "payments" ADD COLUMN "pix_qr_code" TEXT;
ALTER TABLE "payments" ADD COLUMN "pix_copy_paste" TEXT;
ALTER TABLE "payments" ADD COLUMN "pix_expires_at" TIMESTAMPTZ;
ALTER TABLE "payments" ADD COLUMN "card_brand" TEXT;
ALTER TABLE "payments" ADD COLUMN "card_last4" TEXT;

-- Lookup indexes for checkout/order tracking and payment/provider diagnostics.
CREATE INDEX "orders_payment_status_idx" ON "orders"("payment_status");
CREATE INDEX "orders_establishment_id_payment_status_idx" ON "orders"("establishment_id", "payment_status");
CREATE INDEX "payments_status_provider_idx" ON "payments"("status", "provider");
CREATE INDEX "payments_provider_idx" ON "payments"("provider");
