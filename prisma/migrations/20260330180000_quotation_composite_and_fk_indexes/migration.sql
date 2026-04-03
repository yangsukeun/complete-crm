-- Quotation: status + issuedAt 복합 인덱스(목록 필터·정렬), issuedAt 단일 인덱스(전체 최신순)
-- Account / Session / TaskComment: 자주 조회되는 외래키 userId

DROP INDEX IF EXISTS "Quotation_status_idx";

CREATE INDEX "Account_userId_idx" ON "Account"("userId");

CREATE INDEX "Quotation_status_issuedAt_idx" ON "Quotation"("status", "issuedAt" DESC);

CREATE INDEX "Quotation_issuedAt_idx" ON "Quotation"("issuedAt" DESC);

CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE INDEX "TaskComment_userId_idx" ON "TaskComment"("userId");
