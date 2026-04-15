-- AlterTable (IF NOT EXISTS: 이미 db push로 컬럼이 있는 환경과 호환)
ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "permissions" TEXT;
