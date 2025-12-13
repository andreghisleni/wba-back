-- CreateTable
CREATE TABLE "ConversationCharge" (
    "id" TEXT NOT NULL,
    "wamid" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationCharge_instanceId_category_idx" ON "ConversationCharge"("instanceId", "category");

-- CreateIndex
CREATE INDEX "ConversationCharge_createdAt_idx" ON "ConversationCharge"("createdAt");

-- AddForeignKey
ALTER TABLE "ConversationCharge" ADD CONSTRAINT "ConversationCharge_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "whatsapp_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
