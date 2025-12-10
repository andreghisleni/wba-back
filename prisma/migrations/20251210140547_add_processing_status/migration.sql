-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'NONE');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'NONE';
