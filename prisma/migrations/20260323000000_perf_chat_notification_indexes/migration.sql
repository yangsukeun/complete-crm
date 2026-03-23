-- 채팅 목록 정렬(updatedAt desc), 알림 목록(userId + createdAt)
CREATE INDEX IF NOT EXISTS "Chat_updatedAt_idx" ON "Chat"("updatedAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
