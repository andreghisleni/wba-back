/*
  Warnings:

  - You are about to drop the column `scheduledAt` on the `broadcast_campaigns` table. All the data in the column will be lost.
  - Made the column `templateId` on table `broadcast_campaigns` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "broadcast_campaigns" DROP CONSTRAINT "broadcast_campaigns_templateId_fkey";

-- AlterTable
ALTER TABLE "broadcast_campaigns" DROP COLUMN "scheduledAt",
ALTER COLUMN "templateId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "broadcast_campaigns" ADD CONSTRAINT "broadcast_campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
