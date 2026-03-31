-- CreateIndex
CREATE INDEX "Schedule_scope_userId_startTime_idx" ON "Schedule"("scope", "userId", "startTime" ASC);
