-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PROCESSING', 'COMPLETED', 'PAUSED', 'FAILED', 'CANCELED');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "broadcastCampaignId" TEXT;

-- CreateTable
CREATE TABLE "broadcast_lists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "additionalParams" JSONB,
    "instanceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcast_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_list_members" (
    "id" TEXT NOT NULL,
    "broadcastListId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "additionalParams" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_list_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "templateId" TEXT,
    "broadcastListId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "totalContacts" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcast_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "broadcast_list_members_broadcastListId_contactId_key" ON "broadcast_list_members"("broadcastListId", "contactId");

-- AddForeignKey
ALTER TABLE "broadcast_lists" ADD CONSTRAINT "broadcast_lists_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "whatsapp_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_list_members" ADD CONSTRAINT "broadcast_list_members_broadcastListId_fkey" FOREIGN KEY ("broadcastListId") REFERENCES "broadcast_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_list_members" ADD CONSTRAINT "broadcast_list_members_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_campaigns" ADD CONSTRAINT "broadcast_campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_campaigns" ADD CONSTRAINT "broadcast_campaigns_broadcastListId_fkey" FOREIGN KEY ("broadcastListId") REFERENCES "broadcast_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_campaigns" ADD CONSTRAINT "broadcast_campaigns_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "whatsapp_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_broadcastCampaignId_fkey" FOREIGN KEY ("broadcastCampaignId") REFERENCES "broadcast_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
