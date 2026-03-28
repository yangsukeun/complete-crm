-- AlterTable
ALTER TABLE "BoardPost" ADD COLUMN IF NOT EXISTS "content_type" VARCHAR(20) NOT NULL DEFAULT 'text';

-- AlterTable
ALTER TABLE "UserNote" ADD COLUMN IF NOT EXISTS "content_type" VARCHAR(20) NOT NULL DEFAULT 'text';
