/*
  Warnings:

  - You are about to drop the `ConversationCharge` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ConversationCharge" DROP CONSTRAINT "ConversationCharge_instanceId_fkey";

-- DropTable
DROP TABLE "ConversationCharge";

-- CreateTable
CREATE TABLE "conversation_charges" (
    "id" TEXT NOT NULL,
    "wamid" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_charges_instanceId_category_idx" ON "conversation_charges"("instanceId", "category");

-- CreateIndex
CREATE INDEX "conversation_charges_createdAt_idx" ON "conversation_charges"("createdAt");

-- AddForeignKey
ALTER TABLE "conversation_charges" ADD CONSTRAINT "conversation_charges_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "whatsapp_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
