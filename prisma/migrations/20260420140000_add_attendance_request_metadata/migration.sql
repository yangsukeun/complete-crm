-- AlterTable: 출퇴근 시 요청 IP·User-Agent (재택·모바일 등 추적용)
ALTER TABLE "Attendance" ADD COLUMN "checkInIp" TEXT;
ALTER TABLE "Attendance" ADD COLUMN "checkInUa" TEXT;
ALTER TABLE "Attendance" ADD COLUMN "checkOutIp" TEXT;
ALTER TABLE "Attendance" ADD COLUMN "checkOutUa" TEXT;
