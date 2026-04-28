-- S01 fake/dev hosted-card checkout URL contract
-- Additive-only payment persistence field; do not edit older migrations.
ALTER TABLE "payments" ADD COLUMN "checkout_url" TEXT;
