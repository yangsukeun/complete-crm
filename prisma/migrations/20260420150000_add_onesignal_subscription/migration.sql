-- OneSignal 구독별 lastSeenAt (좀비 구독 크론·감사용)
CREATE TABLE "OneSignalSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneSignalSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OneSignalSubscription_subscriptionId_key" ON "OneSignalSubscription"("subscriptionId");

CREATE INDEX "OneSignalSubscription_userId_idx" ON "OneSignalSubscription"("userId");

CREATE INDEX "OneSignalSubscription_lastSeenAt_idx" ON "OneSignalSubscription"("lastSeenAt");

ALTER TABLE "OneSignalSubscription" ADD CONSTRAINT "OneSignalSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
