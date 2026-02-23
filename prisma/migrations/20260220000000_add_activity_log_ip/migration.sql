-- AlterTable: ActivityLog에 ipAddress 컬럼 추가 (출퇴근 시 IP 기록용)
ALTER TABLE "ActivityLog" ADD COLUMN "ipAddress" TEXT;
