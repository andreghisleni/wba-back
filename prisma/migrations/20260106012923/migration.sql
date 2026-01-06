-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "errorDefinitionId" TEXT;

-- CreateTable
CREATE TABLE "error_definitions" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "metaCode" TEXT NOT NULL,
    "rawMessage" TEXT NOT NULL,
    "shortExplanation" TEXT,
    "detailedExplanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "error_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "error_definitions_hash_key" ON "error_definitions"("hash");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_errorDefinitionId_fkey" FOREIGN KEY ("errorDefinitionId") REFERENCES "error_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
