-- AlterTable
ALTER TABLE "webhook_logs" ADD COLUMN     "attempt" INTEGER,
ADD COLUMN     "metaEvent" TEXT,
ADD COLUMN     "referenceId" TEXT;
