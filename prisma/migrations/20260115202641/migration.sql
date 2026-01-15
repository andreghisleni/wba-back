/*
  Warnings:

  - The `additionalParams` column on the `broadcast_lists` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "broadcast_lists" DROP COLUMN "additionalParams",
ADD COLUMN     "additionalParams" TEXT[] DEFAULT ARRAY[]::TEXT[];
