-- S03 merchant order refusal status
-- Additive-only enum extension for refused orders; do not drop/recreate OrderStatus.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'REJECTED' AFTER 'DELIVERED';
