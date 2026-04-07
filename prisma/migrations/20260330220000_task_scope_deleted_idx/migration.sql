-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_scope_deletedAt_idx" ON "Task"("scope", "deletedAt");
