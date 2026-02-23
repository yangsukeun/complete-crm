-- AlterTable: ChatMessage 논리적 삭제(Soft Delete)용 플래그
ALTER TABLE "ChatMessage" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT 0;
