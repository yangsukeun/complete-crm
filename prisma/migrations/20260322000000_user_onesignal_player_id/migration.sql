-- OneSignal 구독(Subscription) ID — 디버그·대시보드와 대조용 (푸시 타깃은 external_id=User.id)
ALTER TABLE "User" ADD COLUMN "oneSignalPlayerId" TEXT;
