-- CreateEnum
CREATE TYPE "TagType" AS ENUM ('general', 'kanban');

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "tag_kanban_id" TEXT;

-- AlterTable
ALTER TABLE "tags" ADD COLUMN     "type" "TagType" NOT NULL DEFAULT 'general',
ALTER COLUMN "colorName" SET DEFAULT '';

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tag_kanban_id_fkey" FOREIGN KEY ("tag_kanban_id") REFERENCES "tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;
