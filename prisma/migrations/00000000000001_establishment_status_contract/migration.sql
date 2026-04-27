-- AlterEnum
ALTER TABLE "establishments" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "EstablishmentStatus" RENAME VALUE 'DRAFT' TO 'PENDING';
ALTER TYPE "EstablishmentStatus" RENAME VALUE 'PAUSED' TO 'BLOCKED';
ALTER TYPE "EstablishmentStatus" RENAME VALUE 'ARCHIVED' TO 'INACTIVE';
ALTER TABLE "establishments" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"EstablishmentStatus";
