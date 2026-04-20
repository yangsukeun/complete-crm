-- AlterTable: Notification에 OneSignal notification id 저장 컬럼 추가 (취소 API 용)
ALTER TABLE "Notification" ADD COLUMN "oneSignalNotificationId" TEXT;

CREATE INDEX "Notification_oneSignalNotificationId_idx" ON "Notification"("oneSignalNotificationId");

